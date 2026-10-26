import readline from 'node:readline';
import crypto from 'node:crypto';
import path from 'node:path';
import { startStudio } from './src/studio-server.mjs';
const args = process.argv.slice(2).filter(arg => arg !== '--headless');
if (args.length > 1) throw new Error('Pass one workspace directory');
let studio, stopping = false;
let pickDirectory;
if (process.env.DBML_NATIVE_HOST === '1') {
  let pending;
  const input = readline.createInterface({ input: process.stdin });
  input.on('line', line => {
    try {
      const reply = JSON.parse(line);
      if (pending && reply.id === pending.id) { pending.resolve(reply.directory || null); pending = null; }
    } catch {}
  });
  input.on('close', () => stop());
  pickDirectory = () => new Promise(resolve => {
    const id = crypto.randomUUID();
    pending = { id, resolve };
    console.log('DBML Pick Workspace: ' + id);
  });
}
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(0), 2500);
  deadline.unref();
  await studio?.close();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
try {
  studio = await startStudio({ directory: path.resolve(args[0] ?? process.cwd()), port: 0, ...(pickDirectory ? { pickDirectory } : {}) });
  console.log('DBML Studio: ' + studio.url);
  console.log('Workspace: ' + studio.workspace.root);
  console.log('Press Ctrl+C to stop.');
} catch (error) {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
}
