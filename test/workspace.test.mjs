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
