import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbml-portable-'));
let child;
try {
  const app = path.join(temp, 'Moved App', 'DBML Studio.app');
  fs.cpSync(path.join(root, `dist/macos-${process.arch}/DBML Studio.app`), app, { recursive: true });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const dependencies = execFileSync('/usr/bin/otool', ['-L', path.join(app, 'Contents/Resources/node')], { encoding: 'utf8' });
  assert(!dependencies.includes('/opt/homebrew/') && !dependencies.includes('/usr/local/'), 'Runtime must not depend on Homebrew');
  const workspace = path.join(temp, 'Workspace with spaces');
  const home = path.join(temp, 'Empty home');
  fs.mkdirSync(workspace); fs.mkdirSync(home);
  fs.copyFileSync(path.join(root, 'examples/retail_lineage.dbml'), path.join(workspace, 'model.dbml'));
  child = spawn(path.join(app, 'Contents/MacOS/DBML Studio'), [workspace, '--headless'], { cwd: temp, env: { HOME: home, PATH: '/usr/bin:/bin', TMPDIR: temp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Startup timed out: ' + log)), 30000);
    child.stderr.on('data', data => { log += data; });
    child.stdout.on('data', data => { log += data; const match = log.match(/DBML Studio: (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error('Exited ' + code + ': ' + log)); });
  });
  async function get(route) { const response = await fetch(url + route); assert.equal(response.status, 200, route); return response; }
  const shell = await (await get('/')).text();
  for (const match of shell.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)) await get(match[1]);
  const renderer = await (await get('/renderer/')).text();
  for (const match of renderer.matchAll(/(?:src|href)="(\/renderer\/assets\/[^" ]+)"/g)) await get(match[1]);
  const settings = await (await get('/api/workspace')).json();
  const document = await (await get('/api/file?path=model.dbml')).json();
  const preview = await fetch(url + '/api/preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-token': settings.token }, body: JSON.stringify({ path: 'model.dbml', source: document.source, requestId: 1 }) });
  assert.equal(preview.status, 200);
  const model = await preview.json();
  assert.deepEqual(model.update.errors, []);
  assert(model.stats.tables > 0 && model.stats.lineage > 0);
  const source = document.source + '\n// Portable package save test\n';
  const saved = await fetch(url + '/api/file?path=model.dbml', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-workspace-token': settings.token }, body: JSON.stringify({ source, version: document.version }) });
  assert.equal(saved.status, 200);
  assert.equal(fs.readFileSync(path.join(workspace, 'model.dbml'), 'utf8'), source);
  console.log('PASS: relocated signed app; isolated HOME/PATH; frontend + renderer assets; lineage compilation; disk save.');
  console.log(JSON.stringify(model.stats));
} finally {
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  fs.rmSync(temp, { recursive: true, force: true });
}
