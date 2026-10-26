import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extensionRoot } from '../src/environment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const arch = process.argv[2] ?? process.arch;
if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(arch)) throw new Error('Build on macOS; architecture must be arm64 or x64');
const output = path.join(root, 'dist', `macos-${arch}`);
const app = path.join(output, 'DBML Studio.app');
const resources = path.join(app, 'Contents/Resources');
const project = path.join(resources, 'project');
const cache = path.join(root, 'artifacts/runtime');
fs.mkdirSync(cache, { recursive: true });
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
// Use an official relocatable binary, rather than a Homebrew executable linked to Homebrew libraries.
const base = 'https://nodejs.org/dist/latest-v22.x/';
const sums = (await download(base + 'SHASUMS256.txt')).toString();
const row = sums.split('\n').find(line => line.endsWith(`-darwin-${arch}.tar.gz`));
if (!row) throw new Error('Official macOS runtime not found');
const [checksum, filename] = row.trim().split(/\s+/);
const archive = path.join(cache, filename);
if (!fs.existsSync(archive)) fs.writeFileSync(archive, await download(base + filename));
if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== checksum) throw new Error('Runtime checksum mismatch');
const unpacked = path.join(cache, filename.slice(0, -7));
execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', cache]);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(project, { recursive: true });
for (const item of ['src', 'web', 'dist/studio']) fs.cpSync(path.join(root, item), path.join(project, item), { recursive: true });
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ type: 'module', private: true }));
fs.copyFileSync(path.join(root, 'scripts/macos-launch.mjs'), path.join(project, 'launch.mjs'));
const extension = extensionRoot('0.4.0');
// Preserve the original package and its notices without depending on a VS Code installation.
fs.cpSync(extension, path.join(resources, 'extension'), { recursive: true });
const require = createRequire(import.meta.url);
const candidates = [process.env.ACORN_PATH, 'acorn', '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/ms-vscode.js-debug/src/vendor/acorn.js'].filter(Boolean);
let acorn;
for (const candidate of candidates) { try { acorn = require.resolve(candidate); break; } catch {} }
if (!acorn) throw new Error('Acorn not found');
fs.mkdirSync(path.join(resources, 'vendor'), { recursive: true });
fs.copyFileSync(acorn, path.join(resources, 'vendor/acorn.cjs'));
fs.copyFileSync(path.join(unpacked, 'bin/node'), path.join(resources, 'node'));
fs.chmodSync(path.join(resources, 'node'), 0o755);
fs.copyFileSync(path.join(unpacked, 'LICENSE'), path.join(resources, 'NODE-LICENSE'));
fs.writeFileSync(path.join(resources, 'PROVENANCE.json'), JSON.stringify({ runtime: { url: base + filename, sha256: checksum }, renderer: { version: '0.4.0', source: 'Official dbdiagram VS Code extension; original package notices retained' } }, null, 2));
const macos = path.join(app, 'Contents/MacOS');
fs.mkdirSync(macos, { recursive: true });
fs.copyFileSync(path.join(root, 'macos/StudioMenu.swift'), path.join(resources, 'StudioMenu.swift'));
execFileSync('/usr/bin/xcrun', ['swiftc', path.join(root, 'macos/StudioMenu.swift'), '-O', '-target', `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx12.0`, '-framework', 'AppKit', '-o', path.join(macos, 'DBML Studio')], { stdio: 'inherit' });
fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>DBML Studio</string><key>CFBundleIdentifier</key><string>local.dbml.studio</string><key>CFBundleName</key><string>DBML Studio</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>`);
fs.writeFileSync(path.join(output, 'README.txt'), `DBML Studio — macOS ${arch}\n\nMove DBML Studio.app anywhere and double-click it. Use Open folder in the browser to choose your diagrams folder.\nThe browser opens automatically. Use the DBML Studio menu bar icon to reopen the browser or quit.\nNode.js, npm, and VS Code are not required on the destination machine.\nThis is a local ad-hoc signed build; it is not signed with a Developer ID or notarized.\nThe original renderer assets remain bundled with their package notices.\n\nTerminal usage:\n"DBML Studio.app/Contents/MacOS/DBML Studio" /path/to/diagrams\nUse --headless for terminal-only operation (Ctrl+C stops it).\n`);
// Ad-hoc signing seals this local bundle; it does not provide Developer ID / notarization.
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
const zip = path.join(root, 'dist', `DBML-Studio-macos-${arch}.zip`);
if (fs.existsSync(zip)) fs.unlinkSync(zip);
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', output, zip]);
console.log(JSON.stringify({ app, zip, runtime: filename, arch }, null, 2));
