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
                    const entry = { path: this.relative(file), name: e.name, kind: 'file', dbml: /\.dbml$/i.test(e.name), size: fs.statSync(file).size, version: this.entryVersion(file) };
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
    entryVersion(file) {
        const stat = fs.statSync(file, { bigint: true });
        return hash(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`);
    }
    // Explorer mutations accept visible regular files only, never symlink ancestors.
    entryPath(relative, { create = false, directory = false } = {}) {
        if (typeof relative !== 'string' || !relative || relative.includes('\0') || relative.includes('\\') || path.isAbsolute(relative))
            throw new WorkspaceError(400, 'Use a workspace-relative file path');
        const parts = relative.split('/');
        if (parts.some(part => !part || part === '..' || part.startsWith('.') || ignored.has(part) || /[<>:"|?*]/.test(part) || /[. ]$/.test(part)))
            throw new WorkspaceError(403, 'Choose a visible file inside the workspace');
        let current = this.root;
        for (const [index, part] of parts.entries()) {
            current = path.join(current, part);
            if (create && index === parts.length - 1) break;
            let stat;
            try { stat = fs.lstatSync(current); }
            catch { throw new WorkspaceError(404, 'File or directory is unavailable'); }
            if (stat.isSymbolicLink() || (index < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile()))
                throw new WorkspaceError(403, 'Choose a regular file inside the workspace');
        }
        return current;
    }
    createDirectory(relative) {
        const target = this.entryPath(relative, { create: true });
        try { fs.mkdirSync(target); }
        catch (error) {
            if (error.code === 'EEXIST') throw new WorkspaceError(409, 'A file or directory with that name already exists');
            throw new WorkspaceError(400, 'Cannot create this folder');
        }
        return { path: this.relative(target), name: path.basename(target), kind: 'directory' };
    }
    directoryInfo(relative) {
        const directory = this.entryPath(relative, { directory: true });
        const digest = crypto.createHash('sha256');
        let count = 0;
        const visit = file => {
            if (++count > 100000) throw new WorkspaceError(400, 'This folder contains too many entries to trash in Studio');
            const stat = fs.lstatSync(file, { bigint: true });
            digest.update(JSON.stringify([this.relative(file), String(stat.mode), String(stat.dev), String(stat.ino), String(stat.size), String(stat.mtimeNs), String(stat.ctimeNs)]));
            // Include hidden contents and links in the snapshot, without following links.
            if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
        };
        visit(directory);
        return { path: relative, kind: 'directory', version: digest.digest('hex'), count: count - 1 };
    }
    renameDirectory(relative, destination, version) {
        const source = this.entryPath(relative, { directory: true });
        const target = this.entryPath(destination, { create: true });
        if (path.dirname(source) !== path.dirname(target))
            throw new WorkspaceError(400, 'Rename folders inside their current parent directory');
        if (typeof version !== 'string' || this.directoryInfo(relative).version !== version)
            throw new WorkspaceError(409, 'This folder or its contents changed. Close this dialog and try again.');
        if (source === target) return { path: relative, destination, kind: 'directory' };
        // Reserve an empty destination exclusively before renaming; never replace an existing entry.
        try { fs.mkdirSync(target); }
        catch (error) {
            if (error.code === 'EEXIST') throw new WorkspaceError(409, 'A file or directory with that name already exists');
            throw new WorkspaceError(400, 'Cannot rename this folder');
        }
        const reserved = fs.lstatSync(target);
        try {
            // Windows refuses directory renames onto any existing destination, even an empty directory.
            if (process.platform === 'win32') fs.rmdirSync(target);
            fs.renameSync(source, target);
        }
        catch (error) {
            try {
                const current = fs.lstatSync(target);
                if (current.ino === reserved.ino && current.dev === reserved.dev && !current.isSymbolicLink()) fs.rmdirSync(target);
            } catch {}
            throw new WorkspaceError(400, 'Cannot rename this folder. Check permissions and close programs using it.');
        }
        return { path: relative, destination, kind: 'directory' };
    }
    checkedEntry(relative, version) {
        const file = this.entryPath(relative);
        if (typeof version !== 'string' || this.entryVersion(file) !== version)
            throw new WorkspaceError(409, 'This file changed on disk. Refresh the explorer and try again.');
        return file;
    }
    move(relative, destination, version) {
        const source = this.checkedEntry(relative, version), target = this.entryPath(destination, { create: true });
        if (/\.dbml$/i.test(relative) && !/\.dbml$/i.test(destination))
            throw new WorkspaceError(400, 'Diagram filenames must keep the .dbml extension');
        if (source === target) return { path: relative, destination, version };
        // Exclusive linking prevents replacing an existing destination, including dangling symlinks.
        try { fs.linkSync(source, target); }
        catch (error) {
            if (error.code === 'EEXIST') throw new WorkspaceError(409, 'A file or directory with that name already exists');
            throw new WorkspaceError(400, 'Cannot move this file. The destination must be on the same filesystem.');
        }
        try { fs.unlinkSync(source); }
        catch (error) { fs.unlinkSync(target); throw error; }
        return { path: relative, destination, version: this.entryVersion(target) };
    }
    trash(relative, version, { directory = false } = {}) {
        let source;
        if (directory) {
            source = this.entryPath(relative, { directory: true });
            if (typeof version !== 'string' || this.directoryInfo(relative).version !== version)
                throw new WorkspaceError(409, 'This folder or its contents changed. Close this dialog and try again.');
        } else source = this.checkedEntry(relative, version);
        const trash = path.join(this.root, '.dbml-studio-trash');
        try { fs.mkdirSync(trash, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        if (fs.lstatSync(trash).isSymbolicLink() || !fs.lstatSync(trash).isDirectory())
            throw new WorkspaceError(403, 'Workspace trash must be a regular directory');
        const bucket = fs.mkdtempSync(path.join(trash, 'item-'));
        fs.mkdirSync(path.join(bucket, 'files'));
        const target = path.join(bucket, 'files', path.basename(source));
        try {
            fs.writeFileSync(path.join(bucket, 'restore.json'), JSON.stringify({ path: relative, trashedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
            fs.renameSync(source, target);
        } catch (error) { fs.rmSync(bucket, { recursive: true, force: true }); throw error; }
        return { path: relative, trashPath: this.relative(target), ...(directory ? { kind: 'directory' } : {}) };
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
