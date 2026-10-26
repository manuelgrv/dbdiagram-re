import fs from 'node:fs';
import path from 'node:path';
import { Workspace, WorkspaceError } from './workspace.mjs';
const virtualRoot = '/workspace/';
const maxProjectBytes = 64 * 1024 * 1024;

export function projectRootForFile(file, cwd = process.cwd()) {
    const relative = path.relative(cwd, path.resolve(file));
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? cwd : path.dirname(path.resolve(file));
}
export function compileFile(file, runtime) {
    const absolute = fs.realpathSync(path.resolve(file));
    const workspace = new Workspace(projectRootForFile(absolute));
    return compileWorkspace(runtime, workspace, workspace.relative(absolute));
}
export function compileWorkspace(runtime, workspace, entry, source, buffers = []) {
    workspace.resolve(entry);
    if (!Array.isArray(buffers) || buffers.length > 2000) throw new WorkspaceError(400, 'Invalid unsaved module buffers');
    const overrides = new Map();
    function override(file, value) {
        workspace.resolve(file);
        if (typeof value !== 'string' || Buffer.byteLength(value) > 2 * 1024 * 1024) throw new WorkspaceError(413, 'DBML files must be smaller than 2 MB');
        overrides.set(file.split(path.sep).join('/'), value);
    }
    for (const buffer of buffers) {
        if (!buffer || typeof buffer.path !== 'string') throw new WorkspaceError(400, 'Invalid unsaved module buffer');
        override(buffer.path, buffer.source);
    }
    if (source !== undefined) override(entry, source);
    let bytes = 0;
    const sources = workspace.files().files.map(file => {
        const text = overrides.get(file.path) ?? workspace.read(file.path).source;
        bytes += Buffer.byteLength(text);
        if (bytes > maxProjectBytes) throw new WorkspaceError(413, 'Workspace DBML sources exceed 64 MB. Choose a smaller workspace.');
        return [virtualRoot + file.path, text];
    });
    try { return runtime.compileProject(virtualRoot + entry.split(path.sep).join('/'), sources); }
    catch (error) {
        if (error.diags) error.diags = error.diags.map(diag => ({ ...diag, path: diag.filepath?.startsWith(virtualRoot) ? diag.filepath.slice(virtualRoot.length) : entry }));
        throw error;
    }
}
