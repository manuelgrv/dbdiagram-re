import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parserRuntime, parseModel } from '../src/runtime.mjs';
import { compileWorkspace } from '../src/dbml-project.mjs';
import { Workspace } from '../src/workspace.mjs';
import { startStudio } from '../src/studio-server.mjs';
import { startViewer } from '../src/server.mjs';
const runtime = parserRuntime();
const main = "use { table sales.orders as orders } from './sales/orders'\nuse * from './common/index.dbml'\nTable totals {\n id int [pk]\n}\nRef: orders.user_id > users.id\nDep: orders.id -> totals.id\n";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-modules-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['sales', 'common']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'main.dbml'), main);
  fs.writeFileSync(path.join(root, 'sales/orders.dbml'), 'Table sales.orders {\n id int [pk]\n user_id int\n}\n');
  fs.writeFileSync(path.join(root, 'common/index.dbml'), "reuse * from './users'\n");
  fs.writeFileSync(path.join(root, 'common/users.dbml'), 'Table users {\n id int [pk]\n}\n');
  return new Workspace(root);
}
const names = result => Object.values(result.database.tables).map(table => table.name).sort();
test('project imports resolve relative to each importing file, with aliases, reuse, references and lineage', t => {
  const ws = fixture(t), result = compileWorkspace(runtime, ws, 'main.dbml');
  assert.deepEqual(names(result), ['orders', 'totals', 'users']);
  assert.equal(Object.keys(result.database.refs).length, 1);
  assert.equal(Object.keys(result.database.depEdges).length, 1);
  assert.deepEqual(Object.values(parseModel(path.join(ws.root, 'main.dbml')).tables).map(t => t.name).sort(), ['orders', 'totals', 'users']);
});
test('parent-relative paths inside the workspace and extensionless imports work', t => {
  const ws = fixture(t);
  fs.writeFileSync(path.join(ws.root, 'sales/entry.dbml'), "use * from '../common/users'\n");
  assert.deepEqual(names(compileWorkspace(runtime, ws, 'sales/entry.dbml')), ['users']);
});
test('use remains private while reuse re-exports imported definitions', t => {
  const ws = fixture(t);
  fs.writeFileSync(path.join(ws.root, 'common/index.dbml'), "use * from './users'\n");
  assert.throws(() => compileWorkspace(runtime, ws, 'main.dbml'), error => error.diags.some(d => /users/i.test(d.message)));
});
test('unsaved imported buffers participate in preview without disk changes or cross-project cache leakage', t => {
  const ws = fixture(t), original = ws.read('common/users.dbml').source;
  const draft = 'Table users {\n id int [pk]\n email varchar\n}\n';
  const result = compileWorkspace(runtime, ws, 'main.dbml', main, [{ path: 'common/users.dbml', source: draft }]);
  assert.ok(Object.values(result.database.fields).some(field => field.name === 'email'));
  assert.equal(ws.read('common/users.dbml').source, original);
  assert.ok(!Object.values(compileWorkspace(runtime, ws, 'main.dbml').database.fields).some(field => field.name === 'email'));
  const other = fixture(t);
  fs.writeFileSync(path.join(other.root, 'common/users.dbml'), 'Table users {\n id int [pk]\n phone varchar\n}\n');
  assert.ok(Object.values(compileWorkspace(runtime, other, 'main.dbml').database.fields).some(field => field.name === 'phone'));
});
test('module diagnostics retain the imported file path; missing paths report an error', t => {
  const ws = fixture(t);
  fs.writeFileSync(path.join(ws.root, 'common/users.dbml'), 'Table {');
  assert.throws(() => compileWorkspace(runtime, ws, 'main.dbml'), error => error.diags.some(d => d.path === 'common/users.dbml'));
  fs.unlinkSync(path.join(ws.root, 'common/users.dbml'));
  assert.throws(() => compileWorkspace(runtime, ws, 'main.dbml'), error => error.diags.length > 0);
});
test('module reads and unsaved overrides cannot escape the selected workspace', t => {
  const ws = fixture(t), outside = fixture(t);
  fs.symlinkSync(path.join(outside.root, 'common/users.dbml'), path.join(ws.root, 'outside.dbml'));
  assert.throws(() => compileWorkspace(runtime, ws, 'main.dbml', "use * from './outside'"));
  assert.throws(() => compileWorkspace(runtime, ws, 'main.dbml', main, [{ path: '../outside.dbml', source: 'Table stolen { id int }' }]), error => error.status === 403);
});
test('Studio compiles module entrypoints and dirty dependency buffers through the preview API', async t => {
  const ws = fixture(t), studio = await startStudio({ directory: ws.root, port: 0, watch: false });
  t.after(() => studio.close());
  const preview = async buffers => {
    const response = await fetch(studio.url + '/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-Token': studio.token }, body: JSON.stringify({ path: 'main.dbml', source: main, buffers }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const result = await preview([{ path: 'common/users.dbml', source: 'Table users {\n id int [pk]\n email varchar\n}\n' }]);
  assert.deepEqual(result.update.errors, []); assert.equal(result.stats.tables, 3);
  assert.ok(Object.values(result.update.database.fields).some(field => field.name === 'email'));
  const invalid = await preview([{ path: 'common/users.dbml', source: 'Table {' }]);
  assert.ok(invalid.update.errors.some(error => error.path === 'common/users.dbml'));
});
test('legacy viewer refreshes when an imported module changes', async t => {
  const ws = fixture(t), viewer = await startViewer({ file: path.join(ws.root, 'main.dbml'), port: 0 });
  t.after(() => viewer.close());
  assert.equal(viewer.getSnapshot().update.errors.length, 0);
  assert.equal(Object.keys(viewer.getSnapshot().update.database.tables).length, 3);
  fs.writeFileSync(path.join(ws.root, 'common/users.dbml'), 'Table users {\n id int [pk]\n email varchar\n}\n');
  const deadline = Date.now() + 5000;
  while (!Object.values(viewer.getSnapshot().update.database.fields ?? {}).some(field => field.name === 'email') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(Object.values(viewer.getSnapshot().update.database.fields).some(field => field.name === 'email'));
});
