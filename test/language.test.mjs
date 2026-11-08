import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeDbml, completions, projectLanguage, symbolAt } from '../src/dbml-language.mjs';
import { startStudio } from '../src/studio-server.mjs';
const source = `Table sales.users as U {
  id int [pk]
  email varchar
  status account_status
  Indexes {
    email [unique]
  }
}
Enum account_status {
  active
  disabled
}
TablePartial timestamps {
  created_at timestamp
}
`;
const labels = value => value.items.map(item => item.label);
const complete = (draft, symbols = [], files = []) => completions(draft, 'main.dbml', draft.length, symbols, files);

test('tolerant symbols include schemas, aliases, columns, enums, partials and incomplete objects', () => {
    const parsed = analyzeDbml(source, 'main.dbml');
    assert.deepEqual(parsed.symbols.map(s => s.kind), ['Table', 'Enum', 'TablePartial']);
    const table = parsed.symbols[0];
    assert.equal(table.qualified, 'sales.users'); assert.equal(table.alias, 'U');
    assert.deepEqual(table.children.map(c => c.name), ['id', 'email', 'status']);
    assert.deepEqual(parsed.symbols[1].children.map(c => c.name), ['active', 'disabled']);
    const draft = analyzeDbml('Table draft {\n id int\n email varchar\n', 'draft.dbml');
    assert.equal(draft.symbols[0].children.length, 2);
    assert.ok(draft.folds.some(f => f.start === 1 && f.end >= 3));
});

test('syntax folding ignores literal/comment braces and folds nested blocks, notes and comments', () => {
    const text = `Table users {\n id int\n Note: '''\n text { not a block }\n '''\n Indexes {\n id [pk]\n }\n}\n/* {\n comment }\n*/\n// {\n`;
    const folds = analyzeDbml(text).folds;
    assert.deepEqual(folds.map(f => [f.start, f.end]), [[1,9],[3,5],[6,8],[10,12]]);
});

test('completion chooses keywords, types, enums, settings, references, aliases and partials by context', () => {
    assert.ok(labels(complete('Ta')).includes('Table'));
    assert.equal(complete('Ta').from, 0);
    assert.ok(labels(complete(source + '\nRef: ')).includes('sales.users'));
    assert.ok(labels(complete(source + '\nDep: U.')).includes('email'));
    assert.deepEqual(labels(complete(source + '\nRef: sales.users.')), ['id','email','status']);
    assert.ok(labels(complete(source + '\nRef: sales.')).includes('users'));
    const types = complete(source + '\nTable next {\n status ');
    assert.ok(labels(types).includes('varchar')); assert.ok(labels(types).includes('account_status'));
    assert.ok(!labels(types).includes('Table'));
    const setting = complete('Table users {\n id int [');
    assert.ok(labels(setting).includes('pk')); assert.ok(labels(setting).includes('not null'));
    const partial = complete(source + '\nTable next {\n ~time');
    assert.ok(labels(partial).some(value => value.includes('timestamps')));
    assert.equal((source + '\nTable next {\n ~time').slice(partial.from), '~time');
    assert.ok(labels(complete('Ref: users.id > other.id [')).includes('delete:'));
    assert.deepEqual(labels(complete(source + '\nTable next {\n user_id int [ref: > sales.users.')), ['id','email','status']);
    const field = complete(source + '\nRef: sales.users.em');
    assert.equal(field.from, (source + '\nRef: sales.users.em').length - 2);
});

test('completion is suppressed in comments, strings and SQL expressions; import paths are relative', () => {
    for (const text of ['// Ta', "// use * from './", '/* Ta', "Note: 'Ta", 'Table users {\n value text [default: `Table ']) assert.deepEqual(labels(complete(text)), []);
    const paths = completions("use * from '../co", 'sales/main.dbml', "use * from '../co".length, [], ['common/users.dbml','sales/main.dbml']);
    assert.deepEqual(labels(paths), ['../common/users.dbml']);
    assert.equal(paths.from, "use * from '".length);
});

test('project symbols respect use privacy, reuse exports, selective imports, aliases and cycles', () => {
    const sources = [
        ['main.dbml', "use * from './common/index'\nuse { table sales.orders as purchases } from './sales/orders'\nTable local {\n id int\n}\nRef: purchases."],
        ['common/index.dbml', "reuse * from './users'\nuse * from './private'"],
        ['common/users.dbml', 'Table users {\n id int\n email varchar\n}'],
        ['common/private.dbml', 'Table secret {\n id int\n}'],
        ['sales/orders.dbml', 'Table sales.orders {\n id int\n amount decimal\n}\nTable excluded {\n id int\n}'],
        ['unrelated.dbml', 'Table unrelated {\n id int\n}'],
    ];
    const project = projectLanguage('main.dbml', sources);
    assert.deepEqual(project.symbols.map(s => s.name).sort(), ['local','purchases','users']);
    assert.equal(project.symbols.find(s => s.name === 'purchases').qualified, 'purchases');
    assert.deepEqual(labels(complete(sources[0][1], project.symbols)), ['id','amount']);
    const users = symbolAt('Ref: users.email', 'main.dbml', 14, project.symbols);
    assert.equal(users.path, 'common/users.dbml'); assert.equal(users.selectionRange.startLineNumber, 3);
    const cycle = projectLanguage('a.dbml', [['a.dbml', "reuse * from './b'\nTable a { id int }"], ['b.dbml', "reuse * from './a'\nTable b { id int }"]]);
    assert.ok(cycle.symbols.some(s => s.name === 'b'));
});

test('current local edits replace stale local symbols and quoted object names remain addressable', () => {
    const old = projectLanguage('main.dbml', [['main.dbml', source]]).symbols;
    assert.ok(!labels(complete('Ref: ', old)).includes('sales.users'));
    const quoted = 'Table "user accounts" {\n "user id" int\n}\nRef: "user accounts".';
    const result = complete(quoted);
    assert.deepEqual(labels(result), ['user id']);
    assert.equal(result.items[0].insertText, '"user id"');
});

test('preview returns imported dirty-buffer symbols despite an incomplete reference without saving', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-language-'));
    t.after(() => fs.rmSync(root, {recursive:true,force:true}));
    fs.writeFileSync(path.join(root,'main.dbml'), "use * from './users'\n");
    fs.writeFileSync(path.join(root,'users.dbml'), 'Table users {\n id int\n}');
    const studio = await startStudio({directory:root,port:0,watch:false});
    t.after(() => studio.close());
    const response = await fetch(studio.url + '/api/preview', {method:'POST',headers:{'content-type':'application/json','x-workspace-token':studio.token},body:JSON.stringify({path:'main.dbml',source:"use * from './users'\nRef: users.",buffers:[{path:'users.dbml',source:'Table users {\n id int\n draft_email varchar\n}'}]})});
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.update.errors.length);
    assert.ok(result.language.symbols.find(s => s.name === 'users').children.some(c => c.name === 'draft_email'));
    assert.ok(!fs.readFileSync(path.join(root,'users.dbml'),'utf8').includes('draft_email'));
});
