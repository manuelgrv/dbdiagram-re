import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Workspace } from '../src/workspace.mjs';
import { startStudio } from '../src/studio-server.mjs';
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-studio-')); fs.mkdirSync(path.join(root, 'nested')); fs.writeFileSync(path.join(root, 'one.dbml'), 'Table one {\n id int [pk]\n}\n'); fs.writeFileSync(path.join(root, 'nested/two.dbml'), 'Table two {\n id int [pk]\n}\n'); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
test('workspace discovers nested DBML and ignores generated/vendor content', t => { const root = fixture(t); for (const name of ['node_modules', 'artifacts', '.git', 'dist']) {
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, 'ignore.dbml'), 'Table hidden {}');
} fs.writeFileSync(path.join(root, 'readme.md'), 'text'); assert.deepEqual(new Workspace(root).files().files.map(f => f.path), ['nested/two.dbml', 'one.dbml']); });
test('workspace directory browser stays relative to its root', t => { const ws = new Workspace(fixture(t)); assert.deepEqual(ws.directories().directories.map(d => d.path), ['nested']); assert.equal(ws.directories('nested').parent, ''); assert.deepEqual(ws.files('nested').files.map(f => f.path), ['nested/two.dbml']); });
test('workspace reads, creates, and saves with content versions', t => { const ws = new Workspace(fixture(t)), original = ws.read('one.dbml'); const saved = ws.save('one.dbml', original.source + '// edited\n', original.version); assert.notEqual(saved.version, original.version); assert.equal(fs.readFileSync(path.join(ws.root, 'one.dbml'), 'utf8'), saved.source); assert.equal(ws.create('nested/new.dbml').path, 'nested/new.dbml'); assert.throws(() => ws.create('nested/new.dbml'), error => error.status === 409); });
test('workspace rejects stale saves without overwriting disk changes', t => { const ws = new Workspace(fixture(t)), original = ws.read('one.dbml'); fs.writeFileSync(path.join(ws.root, 'one.dbml'), '// external change\n'); assert.throws(() => ws.save('one.dbml', '// browser edit\n', original.version), error => error.status === 409 && error.details.current.source === '// external change\n'); assert.equal(ws.read('one.dbml').source, '// external change\n'); });
test('workspace rejects traversal, absolute paths, and non-DBML reads or writes', t => { const ws = new Workspace(fixture(t)); for (const name of ['../escape.dbml', '/tmp/escape.dbml', 'readme.txt'])
    assert.throws(() => ws.read(name)); assert.throws(() => ws.create('../escape.dbml')); assert.throws(() => ws.save('one.dbml', 'x', undefined), error => error.status === 409); });
test('workspace blocks symlinks that escape the selected directory', t => { const root = fixture(t), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true })); fs.writeFileSync(path.join(outside, 'secret.dbml'), 'outside'); fs.symlinkSync(outside, path.join(root, 'link')); const ws = new Workspace(root); assert.throws(() => ws.read('link/secret.dbml'), error => error.status === 403); assert.throws(() => ws.create('link/new.dbml'), error => error.status === 403); assert.ok(!fs.existsSync(path.join(outside, 'new.dbml'))); });
test('workspace limits oversized models and leaves no save temp files', t => { const ws = new Workspace(fixture(t)), doc = ws.read('one.dbml'); assert.throws(() => ws.save('one.dbml', 'x'.repeat(2 * 1024 * 1024 + 1), doc.version), error => error.status === 413); ws.save('one.dbml', doc.source + '// saved\n', doc.version); assert.ok(!fs.readdirSync(ws.root).some(name => name.endsWith('.tmp'))); });
async function studioFixture(t) { const root = fixture(t), studio = await startStudio({ directory: root, port: 0, watch: false }); t.after(() => studio.close()); return studio; }
async function request(studio, route, method, data, token = studio.token) { return fetch(studio.url + route, { method, headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': token }, body: JSON.stringify(data) }); }
test('studio serves the built Vite app, directory tree, and original renderer iframe', async (t) => { const studio = await studioFixture(t); const html = await (await fetch(studio.url)).text(); assert.match(html, /DBML Studio/); assert.match(html, /\/assets\//); const list = await (await fetch(studio.url + '/api/files')).json(); assert.equal(list.files.length, 2); const iframe = await (await fetch(studio.url + '/renderer/')).text(); assert.match(iframe, /\/studio-bridge\.js/); assert.match(iframe, /\/renderer\/assets\/index-/); assert.equal((await fetch(studio.url + '/health')).status, 200); });
test('studio compiles unsaved buffers with diagnostics without modifying files', async (t) => { const studio = await studioFixture(t), disk = fs.readFileSync(path.join(studio.workspace.root, 'one.dbml'), 'utf8'); const result = await request(studio, '/api/preview', 'POST', { path: 'one.dbml', source: 'Table draft {\n id int\n}', requestId: 8 }); const data = await result.json(); assert.equal(data.requestId, 8); assert.equal(data.stats.tables, 1); assert.equal(Object.values(data.update.database.tables)[0].name, 'draft'); assert.equal(fs.readFileSync(path.join(studio.workspace.root, 'one.dbml'), 'utf8'), disk); const invalid = await (await request(studio, '/api/preview', 'POST', { path: 'one.dbml', source: 'Table {' })).json(); assert.ok(invalid.update.errors.length); assert.ok(invalid.update.errors[0].startLine >= 1); });
test('studio saves and creates files only with a valid workspace token', async (t) => { const studio = await studioFixture(t), doc = studio.workspace.read('one.dbml'); assert.equal((await request(studio, '/api/file?path=one.dbml', 'PUT', { source: 'changed', version: doc.version }, 'invalid')).status, 403); const saved = await request(studio, '/api/file?path=one.dbml', 'PUT', { source: doc.source + '// saved', version: doc.version }); assert.equal(saved.status, 200); assert.equal((await request(studio, '/api/file?path=one.dbml', 'PUT', { source: 'stale', version: doc.version })).status, 409); assert.equal((await request(studio, '/api/file?path=nested%2Fcreated.dbml', 'POST', {})).status, 201); });
test('studio rejects cross-origin writes, invalid hosts, and escaped paths', async (t) => { const studio = await studioFixture(t); assert.equal((await fetch(studio.url + '/api/file?path=one.dbml', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': studio.token, Origin: 'http://untrusted.invalid' }, body: '{}' })).status, 403); assert.equal((await fetch(studio.url + '/api/file?path=..%2Foutside.dbml')).status, 403); const status = await new Promise((resolve, reject) => { const req = http.get(studio.url + '/health', { headers: { host: 'untrusted.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); }); assert.equal(status, 403); });
test('studio streams file changes to connected editor clients', async (t) => { const studio = await studioFixture(t), response = await fetch(studio.url + '/api/workspace/events'), reader = response.body.getReader(); await reader.read(); await request(studio, '/api/file?path=new.dbml', 'POST', {}); const timeout = setTimeout(() => reader.cancel(), 3000); try {
    const next = await reader.read();
    assert.match(new TextDecoder().decode(next.value), /"path":"new.dbml"/);
}
finally {
    clearTimeout(timeout);
    await reader.cancel();
} });
test('studio watches external changes in nested directories', async (t) => {
    const root = fixture(t), studio = await startStudio({ directory: root, port: 0 });
    t.after(() => studio.close());
    const response = await fetch(studio.url + '/api/workspace/events'), reader = response.body.getReader();
    await reader.read();
    fs.writeFileSync(path.join(root, 'nested/two.dbml'), 'Table changed {\n id int\n}');
    const timeout = setTimeout(() => reader.cancel(), 3000);
    try {
        const data = await reader.read();
        assert.match(new TextDecoder().decode(data.value), /nested\/two.dbml/);
    }
    finally {
        clearTimeout(timeout);
        await reader.cancel();
    }
});
test('Vite development mode serves the editor shell and Monaco source', async (t) => {
    const studio = await startStudio({ directory: fixture(t), port: 0, dev: true, watch: false });
    t.after(() => studio.close());
    const html = await (await fetch(studio.url)).text();
    assert.match(html, /@vite\/client/);
    const source = await fetch(studio.url + '/src/main.js');
    assert.equal(source.status, 200);
    assert.match(await source.text(), /monaco/);
});

test('explorer includes empty directories and non-DBML files without allowing their contents to be opened', t => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, 'empty'));
    fs.writeFileSync(path.join(root, 'notes.txt'), 'visible filename, not editable');
    const workspace = new Workspace(root), listing = workspace.files();
    assert.ok(listing.entries.some(e => e.path === 'empty' && e.kind === 'directory'));
    assert.ok(listing.entries.some(e => e.path === 'notes.txt' && !e.dbml));
    assert.equal(listing.files.length, 2);
    assert.throws(() => workspace.read('notes.txt'), error => error.status === 400);
});

test('Open folder replaces the workspace root, rotates write tokens, and cancellation leaves it intact', async t => {
    const first = fixture(t), second = fixture(t);
    let selection = second;
    const studio = await startStudio({ directory: first, port: 0, watch: false, pickDirectory: async () => selection });
    t.after(() => studio.close());
    const originalToken = studio.token;
    assert.equal((await request(studio, '/api/workspace/open', 'POST', {}, 'invalid')).status, 403);
    const opened = await (await request(studio, '/api/workspace/open', 'POST', {})).json();
    assert.equal(opened.root, fs.realpathSync(second));
    assert.equal(studio.workspace.root, fs.realpathSync(second));
    assert.notEqual(opened.token, originalToken);
    const doc = studio.workspace.read('one.dbml');
    assert.equal((await request(studio, '/api/file?path=one.dbml', 'PUT', { source: 'wrong workspace', version: doc.version }, originalToken)).status, 403);
    assert.equal(studio.workspace.read('one.dbml').source, doc.source);
    const selectedToken = studio.token;
    await request(studio, '/api/workspace/open', 'POST', {});
    assert.equal(studio.token, selectedToken, 'reselecting the same root keeps other tabs valid');
    selection = null;
    assert.deepEqual(await (await request(studio, '/api/workspace/open', 'POST', {})).json(), { cancelled: true });
    assert.equal(studio.workspace.root, fs.realpathSync(second));
    const invalid = await request(studio, '/api/workspace/open', 'POST', { directory: 'relative/path' });
    assert.equal(invalid.status, 400);
    assert.equal(studio.workspace.root, fs.realpathSync(second));
});

test('workspace switching broadcasts root changes and watches new directories and files', async t => {
    const first = fixture(t), second = fixture(t);
    const studio = await startStudio({ directory: first, port: 0, pickDirectory: async () => second });
    t.after(() => studio.close());
    const response = await fetch(studio.url + '/api/workspace/events'), reader = response.body.getReader();
    await reader.read();
    const timeout = setTimeout(() => reader.cancel(), 5000);
    try {
        await request(studio, '/api/workspace/open', 'POST', {});
        const changed = new TextDecoder().decode((await reader.read()).value);
        assert.match(changed, /"type":"workspace"/);
        assert.ok(changed.includes(second));
        fs.mkdirSync(path.join(second, 'new-empty-directory'));
        const event = new TextDecoder().decode((await reader.read()).value);
        assert.match(event, /new-empty-directory/);
        const listing = await (await fetch(studio.url + '/api/files')).json();
        assert.ok(listing.entries.some(e => e.path === 'new-empty-directory'));
    } finally { clearTimeout(timeout); await reader.cancel(); }
});


test('explorer moves and renames regular files without overwriting destinations', t => {
    const ws = new Workspace(fixture(t)), doc = ws.read('one.dbml');
    const version = name => ws.files().entries.find(e => e.path === name).version;
    const moved = ws.move('one.dbml', 'nested/renamed.dbml', version('one.dbml'));
    assert.equal(moved.destination, 'nested/renamed.dbml');
    assert.equal(ws.read(moved.destination).source, doc.source);
    assert.ok(!fs.existsSync(path.join(ws.root, 'one.dbml')));
    assert.throws(() => ws.move(moved.destination, 'nested/two.dbml', moved.version), e => e.status === 409);
    assert.throws(() => ws.move(moved.destination, 'renamed.txt', moved.version), e => e.status === 400);
    assert.equal(ws.read('nested/two.dbml').source, 'Table two {\n id int [pk]\n}\n');
    fs.writeFileSync(path.join(ws.root, 'notes.txt'), 'notes');
    ws.move('notes.txt', 'nested/notes.txt', version('notes.txt'));
    assert.equal(fs.readFileSync(path.join(ws.root, 'nested/notes.txt'), 'utf8'), 'notes');
    const latest = version(moved.destination);
    fs.writeFileSync(path.join(ws.root, moved.destination), 'external edit');
    assert.throws(() => ws.move(moved.destination, 'stale.dbml', latest), e => e.status === 409);
    assert.throws(() => ws.trash(moved.destination, latest), e => e.status === 409);
});

test('workspace trash keeps recoverable files and original paths outside discovery', t => {
    const ws = new Workspace(fixture(t)), source = ws.read('one.dbml').source;
    const version = ws.files().entries.find(e => e.path === 'one.dbml').version;
    const result = ws.trash('one.dbml', version);
    assert.ok(!fs.existsSync(path.join(ws.root, 'one.dbml')));
    assert.equal(fs.readFileSync(path.join(ws.root, result.trashPath), 'utf8'), source);
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws.root, result.trashPath, '..', '..', 'restore.json'), 'utf8')).path, 'one.dbml');
    assert.ok(ws.files().entries.every(e => !e.path.startsWith('.dbml-studio-trash')));
    fs.writeFileSync(path.join(ws.root, 'restore.json'), 'user data');
    const metadataFile = ws.files().entries.find(e => e.path === 'restore.json');
    const metadataResult = ws.trash(metadataFile.path, metadataFile.version);
    assert.equal(fs.readFileSync(path.join(ws.root, metadataResult.trashPath), 'utf8'), 'user data');
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws.root, metadataResult.trashPath, '..', '..', 'restore.json'), 'utf8')).path, 'restore.json');
});

test('explorer mutations reject hidden paths, traversal, directories, and symlink ancestors', t => {
    const ws = new Workspace(fixture(t));
    const version = ws.files().entries.find(e => e.path === 'one.dbml').version;
    for (const destination of ['../escape.dbml', '/tmp/escape.dbml', '.hidden.dbml', 'dist/escape.dbml', 'nested/../escape.dbml', 'nested\\escape.dbml'])
        assert.throws(() => ws.move('one.dbml', destination, version));
    assert.throws(() => ws.trash('nested', version), e => e.status === 403);
    fs.symlinkSync(path.join(ws.root, 'nested'), path.join(ws.root, 'alias'));
    assert.throws(() => ws.move('one.dbml', 'alias/escape.dbml', version), e => e.status === 403);
    assert.throws(() => ws.trash('alias/two.dbml', version), e => e.status === 403);
    fs.symlinkSync(path.join(ws.root, 'missing'), path.join(ws.root, 'dangling.dbml'));
    assert.throws(() => ws.move('one.dbml', 'dangling.dbml', version), e => e.status === 409);
    fs.symlinkSync(path.join(ws.root, 'nested'), path.join(ws.root, '.dbml-studio-trash'));
    assert.throws(() => ws.trash('one.dbml', version), e => e.status === 403);
    assert.ok(ws.read('one.dbml').source);
});

test('explorer mutation API requires a token, preserves collisions, and broadcasts moves and trash', async t => {
    const studio = await studioFixture(t);
    const version = studio.workspace.files().entries.find(e => e.path === 'one.dbml').version;
    const data = { path: 'one.dbml', destination: 'nested/new.dbml', version };
    assert.equal((await request(studio, '/api/files/move', 'POST', data, 'invalid')).status, 403);
    assert.equal((await request(studio, '/api/files/trash', 'POST', data, 'invalid')).status, 403);
    assert.equal((await request(studio, '/api/files/move', 'POST', { ...data, destination: 'nested/two.dbml' })).status, 409);
    const response = await fetch(studio.url + '/api/workspace/events'), reader = response.body.getReader();
    await reader.read();
    const timeout = setTimeout(() => reader.cancel(), 3000);
    try {
        const moved = await request(studio, '/api/files/move', 'POST', data);
        assert.equal(moved.status, 200);
        assert.match(new TextDecoder().decode((await reader.read()).value), /"type":"moved"/);
        const current = await moved.json();
        assert.equal((await request(studio, '/api/files/trash', 'POST', { path: current.destination, version: current.version })).status, 200);
        assert.match(new TextDecoder().decode((await reader.read()).value), /"type":"trashed"/);
        assert.equal((await fetch(studio.url + '/api/file?path=nested/new.dbml')).status, 404);
    } finally { clearTimeout(timeout); await reader.cancel(); }
});


test('workspace creates nested directories exclusively and rejects unsafe paths', t => {
    const ws = new Workspace(fixture(t));
    assert.equal(ws.createDirectory('empty').path, 'empty');
    ws.createDirectory('empty/child');
    assert.ok(ws.files().entries.some(e => e.path === 'empty/child' && e.kind === 'directory'));
    for (const name of ['empty', 'one.dbml']) assert.throws(() => ws.createDirectory(name), e => e.status === 409);
    for (const name of ['', '../escape', '.hidden', 'dist/folder', 'nested/../escape', '/tmp/escape']) assert.throws(() => ws.createDirectory(name));
    fs.symlinkSync(path.join(ws.root, 'empty'), path.join(ws.root, 'alias'));
    assert.throws(() => ws.createDirectory('alias/escape'), e => e.status === 403);
});

test('folder trash preserves nested and hidden contents and never follows contained symlinks', t => {
    const ws = new Workspace(fixture(t));
    ws.createDirectory('nested/child');
    fs.writeFileSync(path.join(ws.root, 'nested/child/notes.txt'), 'notes');
    fs.writeFileSync(path.join(ws.root, 'nested/.hidden'), 'hidden');
    fs.symlinkSync(path.join(ws.root, 'one.dbml'), path.join(ws.root, 'nested/link'));
    const info = ws.directoryInfo('nested');
    assert.equal(info.count, 5);
    const result = ws.trash('nested', info.version, { directory: true });
    assert.equal(result.kind, 'directory');
    assert.ok(!fs.existsSync(path.join(ws.root, 'nested')));
    assert.equal(fs.readFileSync(path.join(ws.root, result.trashPath, '.hidden'), 'utf8'), 'hidden');
    assert.equal(fs.readFileSync(path.join(ws.root, result.trashPath, 'child/notes.txt'), 'utf8'), 'notes');
    assert.ok(fs.lstatSync(path.join(ws.root, result.trashPath, 'link')).isSymbolicLink());
    assert.ok(ws.read('one.dbml').source);
    for (const name of ['', '.', '../outside', '.dbml-studio-trash', 'one.dbml']) assert.throws(() => ws.directoryInfo(name));
});

test('folder trash rejects changes to descendants and newly added hidden files', t => {
    const ws = new Workspace(fixture(t));
    const info = ws.directoryInfo('nested');
    fs.writeFileSync(path.join(ws.root, 'nested/two.dbml'), 'external change');
    assert.throws(() => ws.trash('nested', info.version, { directory: true }), e => e.status === 409);
    const next = ws.directoryInfo('nested');
    fs.writeFileSync(path.join(ws.root, 'nested/.hidden'), 'new');
    assert.throws(() => ws.trash('nested', next.version, { directory: true }), e => e.status === 409);
    assert.ok(fs.existsSync(path.join(ws.root, 'nested/two.dbml')));
});

test('directory API creates and recursively trashes folders with token and snapshot checks', async t => {
    const studio = await studioFixture(t);
    assert.equal((await request(studio, '/api/directories', 'POST', { path: 'new' }, 'bad')).status, 403);
    assert.equal((await request(studio, '/api/directories', 'POST', { path: 'new' })).status, 201);
    assert.equal((await request(studio, '/api/directories', 'POST', { path: 'new' })).status, 409);
    const info = await (await fetch(studio.url + '/api/directory?path=nested')).json();
    assert.equal(info.count, 1);
    assert.equal((await request(studio, '/api/directories/trash', 'POST', { path: '', version: info.version })).status, 400);
    assert.equal((await request(studio, '/api/directories/trash', 'POST', { path: 'nested', version: info.version }, 'bad')).status, 403);
    const response = await fetch(studio.url + '/api/workspace/events'), reader = response.body.getReader();
    await reader.read();
    const timeout = setTimeout(() => reader.cancel(), 3000);
    try {
        assert.equal((await request(studio, '/api/directories/trash', 'POST', { path: 'nested', version: 'stale' })).status, 409);
        assert.equal((await request(studio, '/api/directories/trash', 'POST', { path: 'nested', version: info.version })).status, 200);
        const event = new TextDecoder().decode((await reader.read()).value);
        assert.match(event, /"kind":"directory"/);
        assert.match(event, /"type":"trashed"/);
        assert.equal((await fetch(studio.url + '/api/file?path=nested/two.dbml')).status, 404);
    } finally { clearTimeout(timeout); await reader.cancel(); }
});


test('folder rename preserves descendants and rejects collisions and stale snapshots', t => {
    const ws = new Workspace(fixture(t));
    fs.writeFileSync(path.join(ws.root, 'nested/.hidden'), 'hidden');
    fs.symlinkSync(path.join(ws.root, 'one.dbml'), path.join(ws.root, 'nested/link'));
    const info = ws.directoryInfo('nested');
    ws.createDirectory('taken');
    for (const destination of ['taken', 'one.dbml']) assert.throws(() => ws.renameDirectory('nested', destination, info.version), e => e.status === 409);
    assert.throws(() => ws.renameDirectory('nested', '../escape', info.version));
    assert.throws(() => ws.renameDirectory('nested', 'nested/child', info.version));
    assert.throws(() => ws.renameDirectory('', 'root', info.version));
    assert.throws(() => ws.renameDirectory('nested', 'renamed', 'stale'), e => e.status === 409);
    const result = ws.renameDirectory('nested', 'renamed', info.version);
    assert.equal(result.kind, 'directory');
    assert.ok(!fs.existsSync(path.join(ws.root, 'nested')));
    assert.ok(ws.read('renamed/two.dbml').source);
    assert.equal(fs.readFileSync(path.join(ws.root, 'renamed/.hidden'), 'utf8'), 'hidden');
    assert.ok(fs.lstatSync(path.join(ws.root, 'renamed/link')).isSymbolicLink());
    assert.ok(ws.read('one.dbml').source);
    const current = ws.directoryInfo('renamed');
    fs.writeFileSync(path.join(ws.root, 'renamed/two.dbml'), 'external');
    assert.throws(() => ws.renameDirectory('renamed', 'again', current.version), e => e.status === 409);
});

test('directory rename API requires a token and broadcasts descendant path remapping', async t => {
    const studio = await studioFixture(t), info = studio.workspace.directoryInfo('nested');
    const data = { path: 'nested', destination: 'renamed', version: info.version };
    assert.equal((await request(studio, '/api/directories/rename', 'POST', data, 'bad')).status, 403);
    const response = await fetch(studio.url + '/api/workspace/events'), reader = response.body.getReader();
    await reader.read();
    const timeout = setTimeout(() => reader.cancel(), 3000);
    try {
        assert.equal((await request(studio, '/api/directories/rename', 'POST', data)).status, 200);
        const event = new TextDecoder().decode((await reader.read()).value);
        assert.match(event, /"type":"moved"/);
        assert.match(event, /"kind":"directory"/);
        assert.match(event, /"destination":"renamed"/);
        assert.equal((await fetch(studio.url + '/api/file?path=renamed/two.dbml')).status, 200);
        assert.equal((await fetch(studio.url + '/api/file?path=nested/two.dbml')).status, 404);
    } finally { clearTimeout(timeout); await reader.cancel(); }
});
