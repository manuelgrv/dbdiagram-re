import { compileWorkspace } from './dbml-project.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Workspace, WorkspaceError } from './workspace.mjs';
import { loadBundle } from './environment.mjs';
import { parserRuntime, layoutDecoder } from './runtime.mjs';
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
export async function startStudio({ directory = process.cwd(), port = 4174, version = '0.4.0', theme = 'dark', dev = false, watch = true, pickDirectory = chooseDirectory } = {}) {
    if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error('Port must be an integer from 0 to 65535');
    if (!['dark', 'light'].includes(theme))
        throw new Error('Theme must be dark or light');
    let workspace = new Workspace(directory);
    const bundle = loadBundle(version), runtime = parserRuntime(version), decodeLayout = layoutDecoder(version);
    const rendererRoot = path.join(bundle.root, 'dist/assets/dbrenderer-webview'), dist = path.join(project, 'dist/studio');
    let token = crypto.randomBytes(24).toString('hex');
    const clients = new Set();
    let choosing = false;
    let vite, watcher, debounce, closing = false;
    const features = { darkMode: true, colorHeader: true, colorPicker: false, dragAndDrop: true, tableGroup: true, detailLevelsEnabled: true, stickyNote: true, tableSearch: true, diagramView: true, diagramViewDropdown: true, diagramViewRestricted: false, tableRename: false, dbmlEditEnabled: false, relationshipModeEnabled: true };
    const send = (res, status, data, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(type.startsWith('application/json') ? JSON.stringify(data) : data); };
    const broadcast = changed => { for (const client of clients)
        client.write('data: ' + JSON.stringify({ type: 'changed', path: changed ?? null, time: Date.now() }) + '\n\n'); };
    const workspaceInfo = () => ({ name: path.basename(workspace.root), root: workspace.root, theme, token, rendererVersion: version, features, nativePicker: pickDirectory !== chooseDirectory || process.platform === 'darwin' || !!process.env.DBML_FOLDER_PICKER });
    function document(relative) {
        const doc = workspace.read(relative), sidecar = workspace.resolve(relative).replace(/\.dbml$/i, '.dbdiagram');
        let state;
        try {
            if (fs.existsSync(sidecar))
                state = decodeLayout(fs.readFileSync(sidecar, 'utf8'));
        }
        catch { }
        doc.state = state ?? { version: '3.0.0', darkMode: theme === 'dark', gridEnabling: false, currentViewName: null, defaultView: { detailLevel: 'All', relationshipMode: 'Dependency', tablePositions: [], tableGroupCollapseStates: [], stickyNoteLayouts: [], referencePaths: [] }, views: {} };
        return doc;
    }
    async function body(req, limit = 3 * 1024 * 1024) {
        if (!req.headers['content-type']?.startsWith('application/json'))
            throw new WorkspaceError(415, 'Send JSON');
        let data = '';
        for await (const chunk of req) {
            data += chunk;
            if (Buffer.byteLength(data) > limit)
                throw new WorkspaceError(413, 'Request is too large');
        }
        if (req.headers['x-workspace-token'] !== token) throw new WorkspaceError(409, 'Workspace changed. Reload before saving.');
        try {
            return JSON.parse(data);
        }
        catch {
            throw new WorkspaceError(400, 'Invalid JSON');
        }
    }
    function asset(res, base, relative) {
        const file = path.resolve(base, relative), realBase = fs.realpathSync(base);
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
            return send(res, 404, { error: 'Not found' });
        if (!fs.realpathSync(file).startsWith(realBase + path.sep))
            return send(res, 403, { error: 'Invalid asset path' });
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': /assets/.test(relative) ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        res.end(fs.readFileSync(file));
    }
    const server = http.createServer(async (req, res) => {
        try {
            const host = req.headers.host ?? '';
            if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
                return send(res, 403, { error: 'Localhost requests only' });
            if (req.headers.origin && req.headers.origin !== `http://${host}`)
                return send(res, 403, { error: 'Same-origin requests only' });
            const url = new URL(req.url, 'http://127.0.0.1'), relative = url.searchParams.get('path') ?? '';
            if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-workspace-token'] !== token)
                return send(res, 403, { error: 'Workspace token required' });
            if (url.pathname === '/api/workspace' && req.method === 'GET')
                return send(res, 200, workspaceInfo());
            if (url.pathname === '/api/workspace/open' && req.method === 'POST') {
                const data = await body(req);
                if (choosing) throw new WorkspaceError(409, 'A workspace picker is already open.');
                choosing = true;
                try {
                    const selected = data.directory ?? await pickDirectory(workspace.root);
                    if (!selected) return send(res, 200, { cancelled: true });
                    if (typeof selected !== 'string' || !path.isAbsolute(selected)) throw new WorkspaceError(400, 'Choose an absolute directory path');
                    const next = new Workspace(selected);
                    if (next.root === workspace.root) return send(res, 200, workspaceInfo());
                    next.files(); // Validate discovery before replacing a working workspace.
                    const nextWatcher = watch ? watchWorkspace(next) : undefined;
                    watcher?.close();
                    clearTimeout(debounce);
                    workspace = next;
                    watcher = nextWatcher;
                    token = crypto.randomBytes(24).toString('hex');
                    console.log('DBML Workspace: ' + JSON.stringify(workspace.root));
                    for (const client of clients) client.write('data: ' + JSON.stringify({ type: 'workspace', root: workspace.root }) + '\n\n');
                    return send(res, 200, workspaceInfo());
                } finally { choosing = false; }
            }
            if (url.pathname === '/api/directories' && req.method === 'GET')
                return send(res, 200, workspace.directories(relative));
            if (url.pathname === '/api/files' && req.method === 'GET')
                return send(res, 200, workspace.files(relative));
            if (url.pathname === '/api/file' && req.method === 'GET')
                return send(res, 200, document(relative));
            if (url.pathname === '/api/file' && req.method === 'PUT') {
                const data = await body(req), saved = workspace.save(relative, data.source, data.version);
                broadcast(saved.path);
                return send(res, 200, saved);
            }
            if (url.pathname === '/api/file' && req.method === 'POST') {
                const data = await body(req), created = workspace.create(relative, data.source);
                broadcast(created.path);
                return send(res, 201, document(created.path));
            }
            if (url.pathname === '/api/preview' && req.method === 'POST') {
                const data = await body(req, 16 * 1024 * 1024);
                workspace.resolve(data.path);
                if (typeof data.source !== 'string' || Buffer.byteLength(data.source) > 2 * 1024 * 1024)
                    throw new WorkspaceError(413, 'DBML files must be smaller than 2 MB');
                let database = {}, diagramViews = [], errors = [];
                try {
                    ({ database, diagramViews } = compileWorkspace(runtime, workspace, data.path, data.source, data.buffers));
                }
                catch (error) {
                    if (error instanceof WorkspaceError) throw error;
                    errors = (error.diags ?? [{ message: error.message }]).map(e => ({ path: e.path ?? data.path, message: e.message ?? e.diagnostic ?? String(e), startLine: e.location?.start?.line ?? 1, startColumn: e.location?.start?.column ?? 1, endLine: e.location?.end?.line ?? 1, endColumn: e.location?.end?.column ?? 1 }));
                }
                return send(res, 200, { path: data.path, requestId: data.requestId, update: { type: 'update', database, diagramViews: diagramViews ?? [], errors, dbmlSource: data.source }, stats: { tables: Object.keys(database.tables ?? {}).length, lineage: Object.keys(database.depEdges ?? {}).length, relationships: Object.keys(database.refs ?? {}).length } });
            }
            if (url.pathname === '/api/workspace/events' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
                res.write(': connected\n\n');
                clients.add(res);
                req.on('close', () => clients.delete(res));
                return;
            }
            if (url.pathname === '/health')
                return send(res, 200, { ok: true, kind: 'studio', workspace: path.basename(workspace.root) });
            if (url.pathname === '/studio-bridge.js')
                return send(res, 200, fs.readFileSync(path.join(project, 'web/studio-bridge.js'), 'utf8'), 'text/javascript; charset=utf-8');
            if (url.pathname === '/renderer/' || url.pathname === '/renderer') {
                let html = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
                html = html.replace('<head>', '<head><script src="/studio-bridge.js"></script><style>html,body,#app{height:100%;margin:0;overflow:hidden}</style>').replaceAll('src="/assets/', 'src="/renderer/assets/').replaceAll('href="/assets/', 'href="/renderer/assets/').replace('href="/favicon.ico"', 'href="/renderer/favicon.ico"');
                return send(res, 200, html, 'text/html; charset=utf-8');
            }
            if (url.pathname.startsWith('/renderer/'))
                return asset(res, rendererRoot, decodeURIComponent(url.pathname.slice('/renderer/'.length)));
            if (url.pathname.startsWith('/api/'))
                return send(res, 404, { error: 'Unknown API route' });
            if (!['GET', 'HEAD'].includes(req.method))
                return send(res, 405, { error: 'Method not allowed' });
            if (vite)
                return vite.middlewares(req, res, () => send(res, 404, { error: 'Not found' }));
            if (url.pathname === '/')
                return send(res, 200, fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
            return asset(res, dist, decodeURIComponent(url.pathname.slice(1)));
        }
        catch (error) {
            if (!res.headersSent)
                send(res, error.status ?? 500, { error: error.message, details: error.details });
            else
                res.end();
        }
    });
    if (dev || !fs.existsSync(path.join(dist, 'index.html'))) {
        const { createServer } = await import('vite');
        vite = await createServer({ configFile: path.join(project, 'vite.config.mjs'), server: { middlewareMode: true, hmr: { server }, watch: { ignored: ['**/artifacts/**'] } }, appType: 'spa' });
    }
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    }
    catch (error) {
        await vite?.close();
        throw error;
    }
    function watchWorkspace(target) {
        return fs.watch(target.root, { recursive: true }, (_event, name) => {
            const changed = name?.toString().split(path.sep).join('/');
            if (changed && changed.split('/').some(p => p.startsWith('.') || ['node_modules', 'artifacts', 'dist', 'build'].includes(p))) return;
            clearTimeout(debounce);
            debounce = setTimeout(() => broadcast(changed), 180);
        });
    }
    if (watch) watcher = watchWorkspace(workspace);
    const heartbeat = setInterval(() => { for (const client of clients)
        client.write(': heartbeat\n\n'); }, 15000);
    heartbeat.unref();
    return { server, get workspace() { return workspace; }, get token() { return token; }, url: `http://127.0.0.1:${server.address().port}`, async close() { if (closing)
            return; closing = true; clearInterval(heartbeat); clearTimeout(debounce); watcher?.close(); for (const client of clients)
            client.end(); await vite?.close(); await new Promise(resolve => server.close(resolve)); } };
}

async function chooseDirectory(current) {
    const run = promisify(execFile);
    try {
        if (process.env.DBML_FOLDER_PICKER) {
            const { stdout } = await run(process.env.DBML_FOLDER_PICKER, ['--choose-folder', current]);
            return stdout.trim() || null;
        }
        if (process.platform !== 'darwin') throw new WorkspaceError(400, 'Enter the absolute path of the workspace directory.');
        const { stdout } = await run('/usr/bin/osascript', ['-e', 'on run argv\ntry\nreturn POSIX path of (choose folder with prompt "Choose your DBML workspace" default location (POSIX file (item 1 of argv)))\non error number -128\nreturn ""\nend try\nend run', current]);
        return stdout.trim() || null;
    } catch (error) { throw new WorkspaceError(error.status ?? 500, error.message); }
}
