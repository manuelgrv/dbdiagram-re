import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export function extensionRoot(version = '0.4.0') {
  const explicit = process.env.DBDIAGRAM_EXTENSION_DIR;
  if (explicit && JSON.parse(fs.readFileSync(path.join(explicit, 'package.json'), 'utf8')).version === version) return explicit;
  const homes = [path.join(os.homedir(), '.vscode/extensions'), path.join(os.homedir(), '.vscode-insiders/extensions'), path.join(os.homedir(), '.cursor/extensions')];
  for (const home of homes) {
    if (!fs.existsSync(home)) continue;
    const name = fs.readdirSync(home).find(n => n === `dbdiagram.dbdiagram-vscode-${version}` || n.startsWith(`dbdiagram.dbdiagram-vscode-${version}-`));
    if (name) return path.join(home, name);
  }
  const reference=fileURLToPath(new URL(`../artifacts/reference/${version}/extension/`,import.meta.url));
  if (fs.existsSync(path.join(reference,'package.json'))) return reference;
  throw new Error(`Installed dbdiagram ${version} not found. Set DBDIAGRAM_EXTENSION_DIR to its directory.`);
}
export function loadAcorn() {
  const candidates = [process.env.ACORN_PATH, 'acorn', '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/ms-vscode.js-debug/src/vendor/acorn.js'];
  for (const candidate of candidates.filter(Boolean)) {
    try { return require(candidate); } catch {}
  }
  throw new Error('Acorn is required for static extraction. Set ACORN_PATH or install acorn locally.');
}
export function loadTypeScript() {
  for (const candidate of [process.env.TYPESCRIPT_PATH, 'typescript', '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js'].filter(Boolean)) {
    try { return require(candidate); } catch {}
  }
  return null;
}
const bundleCache = new Map();
export function loadBundle(version = '0.4.0') {
  if (bundleCache.has(version)) return bundleCache.get(version);
  const root = extensionRoot(version);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const hostFile = path.join(root, manifest.main);
  const webRoot = path.join(root, 'dist/assets/dbrenderer-webview');
  const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  const entry = html.match(/<script[^>]+src="([^"]+\.js)"/);
  if (!entry) throw new Error('Webview entry not found in index.html');
  const rendererFile = path.join(webRoot, entry[1].replace(/^\//, ''));
  const bundle = { version, root, manifest, hostFile, rendererFile, host: fs.readFileSync(hostFile, 'utf8'), renderer: fs.readFileSync(rendererFile, 'utf8') };
  bundleCache.set(version,bundle);
  return bundle;
}
