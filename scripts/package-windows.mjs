import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extensionRoot } from '../src/environment.mjs';
import { inspectWindowsPE } from './windows-pe.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const arch = process.argv[2] ?? 'x64';
if (!['x64', 'arm64'].includes(arch)) throw new Error('Architecture must be x64 or arm64');
const native = process.platform === 'win32';
if (!native && process.platform !== 'darwin') throw new Error('Build on Windows or macOS');
if (native && !process.env.VCToolsInstallDir) throw new Error('Open the x64 Native Tools Command Prompt for Visual Studio (Desktop development with C++ and Windows SDK), then run this command again.');
const cache = path.join(root, 'artifacts/windows-build');
fs.mkdirSync(cache, { recursive: true });
async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'DBML-Studio-local-builder' } });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
let nodeArchive, toolRoot, release, runtime, compiler, localNode;
if (native) {
  localNode = process.env.DBML_NODE_DIR ?? path.dirname(process.execPath);
  const executable = path.join(localNode, 'node.exe');
  const license = path.join(localNode, 'LICENSE');
  if (!fs.existsSync(executable) || !fs.existsSync(license)) throw new Error('Node runtime and LICENSE are required. Set DBML_NODE_DIR to an approved Node distribution directory containing node.exe and LICENSE.');
  if (inspectWindowsPE(fs.readFileSync(executable)).arch !== arch) throw new Error('The bundled Node architecture must match the requested target. Set DBML_NODE_DIR to a matching distribution.');
  runtime = { source: 'local Node distribution', version: process.env.DBML_NODE_DIR ? 'see bundled runtime' : process.version, sha256: sha(fs.readFileSync(executable)) };
  compiler = { name: 'Microsoft C++', staticRuntime: true };
} else {
const base = 'https://nodejs.org/dist/latest-v22.x/';
const sums = (await download(base + 'SHASUMS256.txt')).toString();
const row = sums.split('\n').find(line => line.endsWith(`-win-${arch}.zip`));
if (!row) throw new Error('Official Windows Node runtime not found');
const [checksum, filename] = row.trim().split(/\s+/);
nodeArchive = path.join(cache, filename);
if (!fs.existsSync(nodeArchive)) fs.writeFileSync(nodeArchive, await download(base + filename));
if (sha(fs.readFileSync(nodeArchive)) !== checksum) throw new Error('Node runtime checksum mismatch');
// The official compiler project publishes a macOS universal cross-compilation toolchain.
const metadataFile = path.join(cache, 'toolchain-release.json');

if (fs.existsSync(metadataFile)) release = JSON.parse(fs.readFileSync(metadataFile));
else {
  release = JSON.parse((await download('https://api.github.com/repos/mstorsjo/llvm-mingw/releases/latest')).toString());
  fs.writeFileSync(metadataFile, JSON.stringify(release, null, 2));
}
const asset = release.assets.find(item => /ucrt-macos-universal\.tar\.xz$/.test(item.name));
if (!asset) throw new Error('macOS LLVM-MinGW toolchain not found');
const toolArchive = path.join(cache, asset.name);
if (!fs.existsSync(toolArchive)) { console.log('Downloading Windows cross-compiler: ' + asset.name); fs.writeFileSync(toolArchive, await download(asset.browser_download_url)); }
const toolHash = sha(fs.readFileSync(toolArchive));
if (asset.digest && asset.digest !== 'sha256:' + toolHash) throw new Error('Toolchain digest mismatch');
toolRoot = path.join(cache, asset.name.replace(/\.tar\.xz$/, ''));
if (!fs.existsSync(path.join(toolRoot, 'bin'))) execFileSync('/usr/bin/tar', ['-xJf', toolArchive, '-C', cache]);
runtime = { url: base + filename, sha256: checksum };
compiler = { release: release.tag_name, url: asset.browser_download_url, sha256: toolHash };
}
const output = path.join(root, 'dist', `windows-${arch}`);
const app = path.join(output, 'DBML Studio');
const resources = path.join(app, 'resources');
const project = path.join(resources, 'project');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(project, { recursive: true });
for (const item of ['src', 'web', 'dist/studio']) fs.cpSync(path.join(root, item), path.join(project, item), { recursive: true });
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ type: 'module', private: true }));
fs.copyFileSync(path.join(root, 'scripts/macos-launch.mjs'), path.join(project, 'launch.mjs'));
fs.copyFileSync(path.join(root, 'scripts/check-windows.mjs'), path.join(project, 'check-windows.mjs'));
fs.cpSync(extensionRoot('0.4.0'), path.join(resources, 'extension'), { recursive: true });
const require = createRequire(import.meta.url);
let acorn;
for (const candidate of [process.env.ACORN_PATH, 'acorn', '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/ms-vscode.js-debug/src/vendor/acorn.js'].filter(Boolean)) {
  try { acorn = require.resolve(candidate); break; } catch {}
}
if (!acorn) throw new Error('Acorn not found');
fs.mkdirSync(path.join(resources, 'vendor'), { recursive: true });
fs.copyFileSync(acorn, path.join(resources, 'vendor/acorn.cjs'));
const triplet = arch === 'x64' ? 'x86_64' : 'aarch64';
if (native) {
  fs.copyFileSync(path.join(localNode, 'node.exe'), path.join(resources, 'node.exe'));
  fs.copyFileSync(path.join(localNode, 'LICENSE'), path.join(resources, 'NODE-LICENSE'));
  try {
    execFileSync('cl.exe', ['/nologo', '/std:c++17', '/O2', '/EHsc', '/MT', '/utf-8', '/DUNICODE', '/D_UNICODE', path.join(root, 'windows/StudioTray.cpp'), '/Fo' + path.join(cache, 'StudioTray.obj'), '/Fe' + path.join(app, 'DBML Studio.exe'), '/link', '/SUBSYSTEM:WINDOWS', 'ole32.lib', 'shell32.lib', 'uuid.lib', 'user32.lib'], { stdio: 'inherit', cwd: cache });
  } catch (error) { throw new Error('Microsoft C++ build failed. Use a Native Tools prompt for the requested architecture with the Windows SDK installed.', { cause: error }); }
} else {
  execFileSync('python3', ['-c', 'import zipfile,sys,pathlib\nz=zipfile.ZipFile(sys.argv[1])\nout=pathlib.Path(sys.argv[2])\nfor name in ["node.exe","LICENSE"]:\n matches=[p for p in z.namelist() if p.count("/")==1 and p.endswith("/"+name)]\n assert len(matches)==1,name\n (out/("node.exe" if name=="node.exe" else "NODE-LICENSE")).write_bytes(z.read(matches[0]))', nodeArchive, resources]);
  execFileSync(path.join(toolRoot, `bin/${triplet}-w64-mingw32-clang++`), [path.join(root, 'windows/StudioTray.cpp'), '-std=c++17', '-O2', '-static', '-municode', '-mwindows', '-o', path.join(app, 'DBML Studio.exe'), '-lole32', '-lshell32', '-luuid', '-luser32'], { stdio: 'inherit' });
}
fs.copyFileSync(path.join(root, 'windows/StudioTray.cpp'), path.join(resources, 'StudioTray.cpp'));
const notices = path.join(resources, 'licenses');
fs.mkdirSync(notices, { recursive: true });
if (!native) {
fs.copyFileSync(path.join(toolRoot, 'LICENSE.TXT'), path.join(notices, 'LLVM.txt'));
const mingwNotices = path.join(toolRoot, `${triplet}-w64-mingw32/share/mingw32`);
for (const name of fs.readdirSync(mingwNotices).filter(name => name.startsWith('COPYING'))) fs.copyFileSync(path.join(mingwNotices, name), path.join(notices, name));
}
for (const [packageName, names] of [['monaco-editor', ['LICENSE']], ['monaco-vim', ['LICENSE', 'LICENSE.codemirror.txt']], ['dompurify', ['LICENSE']]]) {
  for (const name of names) {
    const source = path.join(root, 'node_modules', packageName, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(notices, packageName + '-' + name.replaceAll('/', '-')));
  }
}
const inspection = inspectWindowsPE(fs.readFileSync(path.join(app, 'DBML Studio.exe')));
if (inspection.arch !== arch || inspection.subsystem !== 2) throw new Error('Launcher PE target mismatch. Use a Native Tools prompt matching the requested architecture.');
const imports = inspection.imports;
if (imports.some(name => /libstdc|libwinpthread|libc\+\+|vcruntime|msvcp/i.test(name))) throw new Error('Unexpected external compiler runtime dependency');
fs.writeFileSync(path.join(resources, 'BUILD-CHECKS.json'), JSON.stringify({ target: `windows-${arch}`, nativeGUI: true, imports, compilerRuntimeStaticallyLinked: true, builtOn: `${process.platform}/${process.arch}`, executedOnWindows: false }, null, 2));
fs.writeFileSync(path.join(resources, 'PROVENANCE.json'), JSON.stringify({ target: `windows-${arch}`, runtime, compiler, renderer: { version: '0.4.0', source: 'Official dbdiagram VS Code extension; original package notices retained' } }, null, 2));
fs.writeFileSync(path.join(app, 'Check Windows.cmd'), '@echo off\r\nsetlocal\r\n"%~dp0resources\\node.exe" "%~dp0resources\\project\\check-windows.mjs"\r\nset "DBML_CHECK_RESULT=%ERRORLEVEL%"\r\npause\r\nexit /b %DBML_CHECK_RESULT%\r\n');
fs.writeFileSync(path.join(app, 'Studio CLI.cmd'), '@echo off\r\nsetlocal\r\nset "DBDIAGRAM_EXTENSION_DIR=%~dp0resources\\extension"\r\nset "ACORN_PATH=%~dp0resources\\vendor\\acorn.cjs"\r\n"%~dp0resources\\node.exe" "%~dp0resources\\project\\launch.mjs" %*\r\n');
fs.writeFileSync(path.join(app, 'README.txt'), `DBML Studio for Windows ${arch}\r\n\r\nExtract the entire ZIP, then double-click DBML Studio.exe.\r\nNo Node.js, npm, VS Code, administrator rights, or installer required.\r\nThe browser opens automatically. Open folder selects a workspace using the native Windows picker.\r\nUse the DBML Studio notification-area (tray) icon to reopen Studio or Quit. It may appear under the hidden-icons arrow.\r\nClosing the browser keeps the server running; Quit stops it.\r\nThe last workspace is stored under %LOCALAPPDATA%\\DBML Studio.\r\nRun Check Windows.cmd for an automated backend smoke test.\r\nStudio CLI.cmd [DIRECTORY] starts the bundled backend in a terminal; Ctrl+C stops it.\r\n\r\nThis is an unsigned portable build targeting Windows 10/11 ${arch}.\r\n${native ? "Built locally using Microsoft C++." : "Cross-compiled on macOS."} Windows GUI execution is not automatically verified by packaging.\r\nThe original renderer/package notices, Node license, and compiler provenance are included.\r\n`);
const zip = path.join(root, 'dist', `DBML-Studio-windows-${arch}.zip`);
if (native) {
  if (fs.existsSync(zip)) fs.unlinkSync(zip);
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:DBML_ZIP_SOURCE, $env:DBML_ZIP_DESTINATION)'], { stdio: 'inherit', env: { ...process.env, DBML_ZIP_SOURCE: output, DBML_ZIP_DESTINATION: zip } });
} else {
execFileSync('python3', ['-c', 'import pathlib,zipfile,sys\nbase=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for p in sorted(base.rglob("*")):\n  if p.is_file(): z.write(p,p.relative_to(base.parent).as_posix())', app, zip]);
}

console.log(JSON.stringify({ app, zip, arch, runtime, compiler }, null, 2));
