import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const ignored = new Set(['node_modules', '.git', 'artifacts', 'dist', 'build', '.cache']);
export class WorkspaceError extends Error {
    constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export class Workspace {
    constructor(directory) { this.root = fs.realpathSync(path.resolve(directory)); if (!fs.statSync(this.root).isDirectory())
        throw new WorkspaceError(400, 'Choose a directory'); }
    relative(file) { return path.relative(this.root, file).split(path.sep).join('/'); }
    resolve(relative = '', { directory = false, create = false } = {}) {
        if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative))
            throw new WorkspaceError(400, 'Use a workspace-relative path');
        const file = path.resolve(this.root, relative);
        const within = p => p === this.root || p.startsWith(this.root + path.sep);
        if (!within(file))
            throw new WorkspaceError(403, 'Path is outside the workspace');
        if (!directory && path.extname(file).toLowerCase() !== '.dbml')
            throw new WorkspaceError(400, 'Only .dbml files can be opened or saved');
        try {
            const real = fs.realpathSync(create ? path.dirname(file) : file);
            if (!within(real))
                throw new WorkspaceError(403, 'Path is outside the workspace');
            if (directory && !fs.statSync(file).isDirectory())
                throw new WorkspaceError(400, 'Choose a directory');
            if (!directory && !create && (!fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()))
                throw new WorkspaceError(403, 'Choose a regular DBML file');
        }
        catch (error) {
            if (error instanceof WorkspaceError)
                throw error;
            throw new WorkspaceError(error.code === 'ENOENT' ? 404 : 400, 'File or directory is unavailable');
        }
        return file;
    }
    directories(relative = '') {
        const dir = this.resolve(relative, { directory: true });
        return { path: this.relative(dir), name: path.basename(dir), parent: dir === this.root ? null : this.relative(path.dirname(dir)), directories: fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && !ignored.has(e.name)).sort((a, b) => a.name.localeCompare(b.name)).map(e => ({ name: e.name, path: this.relative(path.join(dir, e.name)) })) };
    }
    files(relative = '') {
        const directory = this.resolve(relative, { directory: true }), files = [], entries = [];
        const visit = dir => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
                if (e.name.startsWith('.') || ignored.has(e.name) || e.isSymbolicLink())
                    continue;
                const file = path.join(dir, e.name);
                if (entries.length >= 10000) throw new WorkspaceError(400, 'This folder contains more than 10,000 entries. Choose a smaller folder.');
                if (e.isDirectory()) {
                    entries.push({ path: this.relative(file), name: e.name, kind: 'directory' });
                    visit(file);
                }
                else if (e.isFile()) {
                    const entry = { path: this.relative(file), name: e.name, kind: 'file', dbml: /\.dbml$/i.test(e.name), size: fs.statSync(file).size };
                    entries.push(entry);
                    if (entry.dbml) files.push(entry);
                    if (files.length > 2000)
                        throw new WorkspaceError(400, 'This folder contains more than 2,000 DBML files. Choose a smaller folder.');
                }
            }
        };
        visit(directory);
        return { directory: this.relative(directory), name: path.basename(directory), files, entries };
    }
    read(relative) {
        const file = this.resolve(relative), stat = fs.statSync(file);
        if (stat.size > 2 * 1024 * 1024)
            throw new WorkspaceError(413, 'DBML files must be smaller than 2 MB');
        const source = fs.readFileSync(file, 'utf8');
        return { path: this.relative(file), source, version: hash(source), fileId: hash(file).slice(0, 20) };
    }
    save(relative, source, version) {
        if (typeof source !== 'string' || Buffer.byteLength(source) > 2 * 1024 * 1024)
            throw new WorkspaceError(413, 'DBML files must be smaller than 2 MB');
        const file = this.resolve(relative), current = this.read(relative);
        if (typeof version !== 'string' || version !== current.version)
            throw new WorkspaceError(409, 'This file changed on disk. Reload it or explicitly overwrite with your edits.', { current });
        const temp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
        try {
            fs.writeFileSync(temp, source, { flag: 'wx', mode: fs.statSync(file).mode & 0o777 });
            if (this.read(relative).version !== version)
                throw new WorkspaceError(409, 'This file changed while saving.', { current: this.read(relative) });
            fs.renameSync(temp, file);
        }
        finally {
            if (fs.existsSync(temp))
                fs.unlinkSync(temp);
        }
        return this.read(relative);
    }
    create(relative, source = 'Table example {\n  id integer [pk]\n}\n') {
        if (typeof source !== 'string' || Buffer.byteLength(source) > 2 * 1024 * 1024)
            throw new WorkspaceError(413, 'DBML files must be smaller than 2 MB');
        const file = this.resolve(relative, { create: true });
        try {
            fs.writeFileSync(file, source, { flag: 'wx', mode: 0o644 });
        }
        catch (error) {
            if (error.code === 'EEXIST')
                throw new WorkspaceError(409, 'A file with that name already exists');
            throw error;
        }
        return this.read(relative);
    }
}
