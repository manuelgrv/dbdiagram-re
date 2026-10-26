import { initVimMode, VimMode } from 'monaco-vim';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2.js';
import './style.css';
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
const shapes = { folder: 'M3 7h6l2-3h4l2 3h4v13H3z', file: 'M6 3h8l4 4v14H6z M14 3v5h5', plus: 'M12 5v14M5 12h14', sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', moon: 'M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5', save: 'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8', chevron: 'm9 5 7 7-7 7', close: 'M6 6l12 12M6 18 18 6', code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16', search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15m5.5 13 5 5', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' };
Object.assign(shapes, { sidebar: 'M4 4h16v16H4z M9 4v16', editor: 'M4 4h16v16H4z M14 4v16 M7 9l3 3-3 3' });
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${shapes[name]}"/></svg>`;
document.querySelector('#app').innerHTML = `
<header class="app-header"><div class="brand"><span class="brand-mark">${icon('code', 21)}</span><span>DBML<span class="brand-sub">STUDIO</span></span></div><span class="header-divider"></span><span id="workspace-name" class="workspace-name">Opening workspace…</span><div class="panel-toggles" role="group" aria-label="Panel visibility"><button id="toggle-sidebar" class="button ghost panel-toggle" aria-controls="sidebar" aria-expanded="true" aria-label="Hide sidebar" title="Hide sidebar">${icon('sidebar', 17)}<span>Sidebar</span></button><button id="toggle-editor" class="button ghost panel-toggle" aria-controls="editor-pane" aria-expanded="true" aria-label="Hide code editor" title="Hide code editor">${icon('editor', 17)}<span>Editor</span></button></div><div class="header-actions"><button id="vim-toggle" class="button ghost" aria-pressed="false" title="Enable Vim mode">Vim off</button><button id="theme-toggle" class="button ghost"></button><span class="header-divider"></span><button id="save" class="button primary" disabled>${icon('save')}Save<kbd>⌘ S</kbd></button></div></header>
<main class="workspace"><aside class="sidebar" id="sidebar"><div class="sidebar-heading"><span>EXPLORER</span><button id="new-file" class="icon-button" title="New diagram" aria-label="New diagram">${icon('plus')}</button></div><button id="open-folder" class="button folder-button">${icon('folder')}Open folder</button><label class="file-filter">${icon('search', 15)}<input id="file-search" aria-label="Filter DBML files" placeholder="Find a diagram…"></label><div class="folder-label" id="folder-label"></div><nav id="file-tree" aria-label="DBML files"></nav><div class="sidebar-bottom"><span class="tiny-dot"></span><span>Local workspace</span><span id="file-count"></span></div></aside>
<section class="workbench"><div id="tabs" class="tabs" role="tablist" aria-label="Open diagrams"></div><div id="conflict" class="conflict" hidden><span>This file changed on disk.</span><button id="reload-file">Reload from disk</button><button id="overwrite-file">Overwrite with my edits</button></div><div class="panels" id="panels"><section class="editor-pane" id="editor-pane"><div class="pane-heading"><span>${icon('code', 15)}<span id="editor-heading">Editor</span></span><span id="dirty-label" class="subtle"></span></div><div id="editor"></div><div id="editor-empty" class="editor-empty"><span class="empty-icon">${icon('code', 32)}</span><h1>A clear view of your data.</h1><p>Open a DBML diagram from the explorer,<br>or create one to start modeling.</p><button id="empty-new" class="button primary">${icon('plus')}New diagram</button><span class="empty-hint">Edit on the left. See the connections on the right.</span></div><section id="problems" class="problems" hidden><div class="problems-title" id="problem-count"></div><div id="problem-list"></div></section></section><div id="splitter" class="splitter" role="separator" aria-label="Resize editor and diagram" tabindex="0"></div><section class="preview-pane"><div class="pane-heading"><span>${icon('grid', 15)}Diagram</span><span id="preview-status" class="preview-status">Waiting for a diagram</span></div><div class="preview-content"><div id="preview-empty" class="preview-empty"><span class="diagram-symbol">${icon('grid', 36)}</span><p>Your model, connected.</p><span>The diagram updates as you type.</span></div><iframe id="diagram" title="Interactive DBML diagram" hidden></iframe></div></section></div></section></main>
<footer class="status-bar"><span id="connection"><span class="tiny-dot"></span>Connecting</span><span id="status-message">Ready</span><span class="status-spacer"></span><span id="vim-status" hidden></span><span id="cursor-position"></span><span>DBML</span><span>UTF-8</span></footer>
<dialog id="folder-dialog"><div class="dialog-header"><div><h2>Open a folder</h2><p>Enter the absolute path of your workspace folder.</p></div><button class="icon-button" id="close-folder" aria-label="Close folder picker">${icon('close')}</button></div><label class="new-label">Workspace directory<input id="workspace-path" placeholder="/path/to/diagrams" autocomplete="off"></label><p id="folder-error" class="dialog-error" hidden></p><div class="dialog-footer"><button id="cancel-folder" class="button ghost">Cancel</button><button id="select-folder" class="button primary">Open this folder</button></div></dialog>
<dialog id="new-dialog"><form id="new-form"><div class="dialog-header"><div><h2>New diagram</h2><p>Create a DBML file in the current folder.</p></div><button type="button" id="close-new" class="icon-button" aria-label="Close new diagram dialog">${icon('close')}</button></div><label class="new-label">File name<input id="new-name" placeholder="my-diagram.dbml" required autocomplete="off"></label><p id="new-error" class="dialog-error" hidden></p><div class="dialog-footer"><button type="button" id="cancel-new" class="button ghost">Cancel</button><button class="button primary" type="submit">Create diagram</button></div></form></dialog>`;
const $ = id => document.getElementById(id), documents = new Map();
let workspace, theme = 'dark', folder = '', files = [], active = null, previewTimer, previewSequence = 0, rendererReady = false, lastSnapshot = null, refreshTimer, entries = [], switchingWorkspace = false, workspaceStale = false;
const dirty = doc => doc.model.getValue() !== doc.savedText;
const message = text => { $('status-message').textContent = text; };
const button = (text, action, className = '') => { const b = document.createElement('button'); b.textContent = text; b.className = className; b.onclick = action; return b; };
async function api(url, options = {}) { if (workspaceStale && url !== '/api/workspace/open') throw new Error('Workspace changed in another tab. Reload this page; your unsaved edits are still here.'); const response = await fetch(url, { ...options, headers: options.method ? { 'Content-Type': 'application/json', 'X-Workspace-Token': workspace?.token } : undefined }); const value = await response.json(); if (!response.ok) {
    const error = new Error(value.error ?? 'Request failed');
    error.status = response.status;
    error.details = value.details;
    throw error;
} return value; }
monaco.languages.register({ id: 'dbml' });
monaco.languages.setLanguageConfiguration('dbml', { comments: { lineComment: '//', blockComment: ['/*', '*/'] }, brackets: [['{', '}'], ['[', ']'], ['(', ')']], autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: "'", close: "'" }, { open: '"', close: '"' }] });
monaco.languages.setMonarchTokensProvider('dbml', { keywords: ['Table', 'Ref', 'Dep', 'Project', 'TableGroup', 'Enum', 'Note', 'Indexes', 'Records', 'TablePartial', 'DiagramView', 'use', 'reuse', 'from', 'pk', 'primary', 'key', 'unique', 'null', 'not', 'increment', 'default', 'note', 'headercolor', 'color', 'indexes', 'as'], tokenizer: { root: [[/\/\/.*$/, 'comment'], [/\/\*/, 'comment', '@comment'], [/'{3}/, 'string', '@multiline'], [/'/, 'string', '@single'], [/"/, 'string', '@double'], [/#[0-9a-fA-F]{3,8}\b/, 'number.hex'], [/\b\d+(\.\d+)?\b/, 'number'], [/[a-zA-Z_$][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }], [/[{}\[\]()]/, '@brackets'], [/[-<>:=.,]/, 'delimiter']], comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']], multiline: [[/'{3}/, 'string', '@pop'], [/./, 'string']], single: [[/\\./, 'string.escape'], [/'/, 'string', '@pop'], [/[^'\\]+/, 'string']], double: [[/\\./, 'string.escape'], [/"/, 'string', '@pop'], [/[^"\\]+/, 'string']] } });
monaco.languages.registerCompletionItemProvider('dbml', { provideCompletionItems: () => ({ suggestions: [{ label: 'Table', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'Table ${1:table_name} {\n  ${2:id} bigint [pk]\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }, { label: 'Dep', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'Dep: ${1:source_table} -> ${2:target_table}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }, { label: 'Ref', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'Ref: ${1:child}.${2:parent_id} > ${3:parent}.${4:id}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }] }) });
monaco.editor.defineTheme('studio-dark', { base: 'vs-dark', inherit: true, rules: [{ token: 'keyword', foreground: '83DCC5' }, { token: 'string', foreground: 'D6B57A' }, { token: 'comment', foreground: '637286' }, { token: 'number', foreground: 'B5A0E3' }], colors: { 'editor.background': '#141B25', 'editor.foreground': '#D3DDE9', 'editorLineNumber.foreground': '#4D5B6F', 'editorLineNumber.activeForeground': '#ACBBCD', 'editor.lineHighlightBackground': '#1B2432', 'editor.selectionBackground': '#29483F', 'editorCursor.foreground': '#80DDC0', 'editorGutter.background': '#141B25' } });
monaco.editor.defineTheme('studio-light', { base: 'vs', inherit: true, rules: [{ token: 'keyword', foreground: '087F65' }, { token: 'string', foreground: '97651C' }, { token: 'comment', foreground: '7F8A99' }, { token: 'number', foreground: '7954AD' }], colors: { 'editor.background': '#FFFFFF', 'editor.foreground': '#263449', 'editorLineNumber.foreground': '#B0B8C3', 'editorLineNumber.activeForeground': '#596B80', 'editor.lineHighlightBackground': '#F4F7F9', 'editor.selectionBackground': '#D7EEE6', 'editorCursor.foreground': '#087F65', 'editorGutter.background': '#FFFFFF' } });
const editor = monaco.editor.create($('editor'), { model: null, theme: 'studio-dark', automaticLayout: true, fontSize: 13, lineHeight: 23, fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",monospace', minimap: { enabled: false }, padding: { top: 18, bottom: 18 }, scrollBeyondLastLine: false, tabSize: 2, insertSpaces: true, overviewRulerBorder: false, bracketPairColorization: { enabled: true } });
editor.onDidChangeCursorPosition(({ position }) => { $('cursor-position').textContent = `Ln ${position.lineNumber}, Col ${position.column}`; });
let vimEnabled = false, vimAdapter;
try { vimEnabled = localStorage.getItem('dbml-studio:vim') === 'true'; } catch {}
VimMode.Vim.defineEx('write', 'w', () => { saveDocument(); });
function syncVim() {
    vimAdapter?.dispose();
    vimAdapter = null;
    $('vim-status').replaceChildren();
    const enabled = vimEnabled && !!editor.getModel();
    $('vim-status').hidden = !enabled || !panelVisibility.editor;
    if (enabled) vimAdapter = initVimMode(editor, $('vim-status'));
    $('vim-toggle').textContent = vimEnabled ? 'Vim on' : 'Vim off';
    $('vim-toggle').setAttribute('aria-pressed', String(vimEnabled));
    $('vim-toggle').title = vimEnabled ? 'Disable Vim mode' : 'Enable Vim mode';
}
$('vim-toggle').onclick = () => {
    vimEnabled = !vimEnabled;
    try { localStorage.setItem('dbml-studio:vim', String(vimEnabled)); } catch {}
    syncVim();
    if (panelVisibility.editor && editor.getModel()) editor.focus();
};
function setTheme(next) { theme = next; document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; try {
    localStorage.setItem('dbml-studio:theme', theme);
}
catch { } monaco.editor.setTheme(theme === 'dark' ? 'studio-dark' : 'studio-light'); $('theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon') + `<span>${theme === 'dark' ? 'Light' : 'Dark'} mode</span>`; $('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`); $('diagram').contentWindow?.postMessage({ type: 'studio:theme', theme }, location.origin); if (lastSnapshot)
    lastSnapshot.theme = theme; }
function renderTabs() { const container = $('tabs'); container.replaceChildren(); if (!documents.size) {
    const label = document.createElement('span');
    label.className = 'tabs-placeholder';
    label.textContent = 'Your diagrams, one workspace.';
    container.append(label);
} for (const [name, doc] of documents) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (active === name ? ' active' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(active === name));
    tab.tabIndex = 0;
    tab.title = name;
    const glyph = document.createElement('span');
    glyph.innerHTML = icon('file', 14);
    tab.append(glyph);
    const label = document.createElement('span');
    label.textContent = name.split('/').at(-1);
    tab.append(label);
    const close = button(dirty(doc) ? '●' : '×', e => { e.stopPropagation(); closeDocument(name); }, 'tab-close');
    close.setAttribute('aria-label', 'Close ' + name);
    tab.append(close);
    tab.onclick = () => activate(name);
    tab.onkeydown = e => { if (e.key === 'Enter')
        activate(name); };
    container.append(tab);
} const doc = documents.get(active); $('save').disabled = !doc || !dirty(doc) || doc.saving; $('dirty-label').textContent = doc ? (doc.saving ? 'Saving…' : dirty(doc) ? 'Unsaved changes' : 'Saved') : ''; }
const collapsedDirectories = new Set();
function renderTree() {
    const tree = $('file-tree');
    tree.replaceChildren();
    const search = $('file-search').value.trim().toLowerCase();
    const matching = entries.filter(entry => entry.path.toLowerCase().includes(search));
    const nodes = new Map();
    function directory(name, key, parent) {
        const details = document.createElement('details');
        details.open = search ? true : !collapsedDirectories.has(key);
        const summary = document.createElement('summary');
        summary.innerHTML = icon('chevron', 12) + icon('folder', 15);
        const label = document.createElement('span');
        label.textContent = name;
        summary.append(label);
        summary.title = key ? workspace.root + '/' + key : workspace.root;
        details.append(summary);
        const content = document.createElement('div');
        content.className = 'tree-directory';
        details.append(content);
        details.addEventListener('toggle', () => {
            if (!search) details.open ? collapsedDirectories.delete(key) : collapsedDirectories.add(key);
        });
        parent.append(details);
        return content;
    }
    const root = directory(workspace?.name ?? 'Workspace', '', tree);
    nodes.set('', root);
    function parentFor(path) {
        if (nodes.has(path)) return nodes.get(path);
        const parts = path.split('/');
        const name = parts.pop();
        const parent = parentFor(parts.join('/'));
        const content = directory(name, path, parent);
        nodes.set(path, content);
        return content;
    }
    const sorted = [...matching].sort((a, b) => (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'directory' ? -1 : 1));
    for (const entry of sorted) {
        if (entry.kind === 'directory') { parentFor(entry.path); continue; }
        const parts = entry.path.split('/');
        parts.pop();
        const item = button('', () => openFile(entry.path), 'tree-file' + (active === entry.path ? ' selected' : ''));
        item.innerHTML = icon('file', 15);
        const label = document.createElement('span');
        label.textContent = entry.name;
        item.append(label);
        item.disabled = !entry.dbml;
        item.title = entry.path + (entry.dbml ? '' : ' · Only DBML files can be edited');
        parentFor(parts.join('/')).append(item);
    }
    if (!matching.length) {
        const empty = document.createElement('p');
        empty.className = 'tree-empty';
        empty.textContent = search ? 'No matching files.' : 'This workspace is empty.';
        root.append(empty);
    }
    $('file-count').textContent = String(files.length);
    $('folder-label').textContent = 'WORKSPACE';
}
async function refreshFiles() {
    if (workspaceStale || switchingWorkspace) return;
    const result = await api('/api/files');
    files = result.files;
    entries = result.entries;
    renderTree();
}
async function openFile(name) { if (documents.has(name)) {
    activate(name);
    return;
} try {
    const file = await api('/api/file?path=' + encodeURIComponent(name)), model = monaco.editor.createModel(file.source, 'dbml', monaco.Uri.from({ scheme: 'file', path: '/' + name })), doc = { ...file, model, savedText: file.source, viewState: null, errors: [], saving: false };
    doc.listener = model.onDidChangeContent(() => { renderTabs(); if (active === name)
        schedulePreview(); });
    documents.set(name, doc);
    activate(name);
}
catch (error) {
    message(error.message);
} }
function activate(name) { if (active === name && name !== null) {
    if (panelVisibility.editor) editor.focus();
    return;
} const previous = documents.get(active); if (previous)
    previous.viewState = editor.saveViewState(); active = name; const doc = documents.get(name); vimAdapter?.dispose(); vimAdapter = null; editor.setModel(doc?.model ?? null); syncVim(); if (doc?.viewState)
    editor.restoreViewState(doc.viewState); $('editor-empty').hidden = !!doc; $('editor-heading').textContent = doc ? name.split('/').at(-1) : 'Editor'; $('problems').hidden = true; rendererReady = false; lastSnapshot = null; previewSequence++; clearTimeout(previewTimer); $('diagram').hidden = !doc; $('preview-empty').hidden = false; $('preview-status').textContent = doc ? 'Updating…' : 'Waiting for a diagram'; if (doc) {
    $('diagram').src = '/renderer/?file=' + encodeURIComponent(name);
    schedulePreview(0);
    if (panelVisibility.editor) editor.focus();
}
else {
    $('diagram').removeAttribute('src');
    $('cursor-position').textContent = '';
} renderTabs(); renderTree(); renderConflict(); }
function closeDocument(name) { const doc = documents.get(name); if (dirty(doc) && !confirm('Discard unsaved changes in ' + name.split('/').at(-1) + '?'))
    return; documents.delete(name); doc.listener.dispose(); if (active === name) {
    vimAdapter?.dispose(); vimAdapter = null;
    editor.setModel(null);
    activate([...documents.keys()].at(-1) ?? null);
} doc.model.dispose(); renderTabs(); }
function schedulePreview(delay = 350) { previewSequence++; clearTimeout(previewTimer); previewTimer = setTimeout(preview, delay); $('preview-status').textContent = 'Updating…'; }
async function preview() { const name = active, doc = documents.get(name); if (!doc)
    return; const requestId = ++previewSequence; try {
    const result = await api('/api/preview', { method: 'POST', body: JSON.stringify({ path: name, source: doc.model.getValue(), buffers: [...documents.values()].filter(dirty).map(buffer => ({ path: buffer.path, source: buffer.model.getValue() })), requestId }) });
    if (requestId !== previewSequence || name !== active)
        return;
    doc.errors = result.update.errors;
    renderProblems(doc);
    if (doc.errors.length) {
        $('preview-status').textContent = 'Fix errors to update preview';
        message(`${doc.errors.length} DBML ${doc.errors.length === 1 ? 'error' : 'errors'}`);
        return;
    }
    lastSnapshot = { ...result, fileId: doc.fileId, state: doc.state, features: workspace.features, theme };
    $('preview-status').textContent = `${result.stats.tables} tables · ${result.stats.lineage} lineage edges`;
    message(dirty(doc) ? 'Preview updated · unsaved changes' : 'Preview up to date');
    sendSnapshot();
}
catch (error) {
    if (name === active) {
        $('preview-status').textContent = 'Preview unavailable';
        message(error.message);
    }
} }
function sendSnapshot() { if (rendererReady && lastSnapshot) {
    $('diagram').contentWindow.postMessage({ type: 'studio:snapshot', snapshot: lastSnapshot }, location.origin);
    $('preview-empty').hidden = true;
} }
window.addEventListener('message', event => { if (event.origin !== location.origin || event.source !== $('diagram').contentWindow)
    return; if (event.data?.type === 'studio:ready') {
    rendererReady = true;
    sendSnapshot();
}
else if (event.data?.type === 'studio:error')
    message('Diagram: ' + event.data.message);
else if (event.data?.type === 'studio:reveal')
    reveal(event.data.startLine, event.data.startColumn); });
function reveal(line, column = 1) { if (!panelVisibility.editor) { panelVisibility.editor = true; applyPanelVisibility(); } editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column }); if (panelVisibility.editor) editor.focus(); }
function renderProblems(doc) {
    for (const target of documents.values()) {
        const errors = doc.errors.filter(error => (error.path ?? doc.path) === target.path);
        monaco.editor.setModelMarkers(target.model, 'dbml', errors.map(error => ({ message: error.message, severity: monaco.MarkerSeverity.Error, startLineNumber: Math.min(error.startLine, target.model.getLineCount()), startColumn: error.startColumn, endLineNumber: Math.min(error.endLine, target.model.getLineCount()), endColumn: Math.max(error.endColumn, error.startColumn + 1) })));
    }
    $('problems').hidden = !doc.errors.length;
    $('problem-count').textContent = `Problems (${doc.errors.length})`;
    $('problem-list').replaceChildren(...doc.errors.map(error => button(`${error.path ?? doc.path}:${error.startLine}:${error.startColumn}  ${error.message}`, async () => {
        if (error.path && error.path !== active) await openFile(error.path);
        reveal(error.startLine, error.startColumn);
    }, 'problem')));
}
function renderConflict() { $('conflict').hidden = !documents.get(active)?.conflict; }
async function saveDocument(overwrite = false) { const doc = documents.get(active); if (!doc || doc.saving)
    return; if (doc.conflict && !overwrite) {
    message('Resolve the disk conflict above before saving.');
    return;
} const source = doc.model.getValue(); doc.saving = true; renderTabs(); try {
    const saved = await api('/api/file?path=' + encodeURIComponent(doc.path), { method: 'PUT', body: JSON.stringify({ source, version: overwrite ? doc.conflict.version : doc.version }) });
    doc.version = saved.version;
    doc.savedText = source;
    doc.conflict = null;
    message('Saved ' + doc.path);
    renderConflict();
}
catch (error) {
    if (error.status === 409) {
        doc.conflict = error.details?.current;
        renderConflict();
    }
    message(error.message);
}
finally {
    doc.saving = false;
    renderTabs();
} }
async function reloadDocument() { const doc = documents.get(active); if (!doc)
    return; if (dirty(doc) && !confirm('Reload this file and discard your unsaved changes?'))
    return; try {
    const file = await api('/api/file?path=' + encodeURIComponent(doc.path));
    doc.savedText = file.source;
    doc.version = file.version;
    doc.conflict = null;
    doc.model.setValue(file.source);
    renderConflict();
    renderTabs();
    schedulePreview(0);
    message('Reloaded from disk');
}
catch (error) {
    message(error.message);
} }
async function externalChange(changed) { try {
    await refreshFiles();
    for (const doc of documents.values()) {
        if (changed && doc.path !== changed)
            continue;
        try {
            const disk = await api('/api/file?path=' + encodeURIComponent(doc.path));
            if (disk.version === doc.version || doc.saving)
                continue;
            if (dirty(doc)) {
                doc.conflict = disk;
                if (active === doc.path)
                    renderConflict();
            }
            else {
                doc.savedText = disk.source;
                doc.version = disk.version;
                doc.model.setValue(disk.source);
                if (active === doc.path) {
                    schedulePreview(0);
                    message('Updated from disk');
                }
            }
        }
        catch (error) {
            if (active === doc.path)
                message(error.message);
        }
    }
    if (active) schedulePreview(0);
}
catch (error) {
    message(error.message);
} }
async function switchWorkspace(directory) {
    if (switchingWorkspace) return;
    if ([...documents.values()].some(dirty) && !confirm('Switch workspaces and discard unsaved changes?')) return;
    switchingWorkspace = true;
    $('open-folder').disabled = true;
    clearTimeout(refreshTimer);
    clearTimeout(previewTimer);
    try {
        const next = await api('/api/workspace/open', { method: 'POST', body: JSON.stringify(directory ? { directory } : {}) });
        if (next.cancelled) return;
        previewSequence++;
        vimAdapter?.dispose(); vimAdapter = null;
    editor.setModel(null);
        for (const doc of documents.values()) { doc.listener.dispose(); doc.model.dispose(); }
        documents.clear();
        workspace = next;
        workspaceStale = false;
        active = null;
        folder = '';
        collapsedDirectories.clear();
        $('workspace-name').textContent = workspace.name;
        $('workspace-name').title = workspace.root;
        $('file-search').value = '';
        $('folder-dialog').close();
        switchingWorkspace = false;
        await refreshFiles();
        activate(null);
        if (files[0]) await openFile(files[0].path);
        message('Opened ' + workspace.root);
    } catch (error) {
        message(error.message);
        if ($('folder-dialog').open) { $('folder-error').hidden = false; $('folder-error').textContent = error.message; }
    } finally {
        switchingWorkspace = false;
        $('open-folder').disabled = false;
    }
}
$('open-folder').onclick = () => {
    if (workspace.nativePicker) switchWorkspace();
    else { $('workspace-path').value = workspace.root; $('folder-error').hidden = true; $('folder-dialog').showModal(); }
};
$('close-folder').onclick = $('cancel-folder').onclick = () => $('folder-dialog').close();
$('select-folder').onclick = () => switchWorkspace($('workspace-path').value.trim());
function showNew() { $('new-name').value = ''; $('new-error').hidden = true; $('new-dialog').showModal(); $('new-name').focus(); }
$('new-file').onclick = $('empty-new').onclick = showNew;
$('close-new').onclick = $('cancel-new').onclick = () => $('new-dialog').close();
$('new-form').onsubmit = async (event) => { event.preventDefault(); let name = $('new-name').value.trim(); if (!name)
    return; if (!/\.dbml$/i.test(name))
    name += '.dbml'; try {
    const created = await api('/api/file?path=' + encodeURIComponent((folder ? folder + '/' : '') + name), { method: 'POST', body: '{}' });
    $('new-dialog').close();
    await refreshFiles();
    await openFile(created.path);
}
catch (error) {
    $('new-error').hidden = false;
    $('new-error').textContent = error.message;
} };
$('file-search').oninput = renderTree;
$('theme-toggle').onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
$('save').onclick = () => saveDocument();
$('reload-file').onclick = reloadDocument;
$('overwrite-file').onclick = () => saveDocument(true);
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    event.stopPropagation();
    saveDocument();
} }, true);
window.addEventListener('beforeunload', event => { if ([...documents.values()].some(dirty)) {
    event.preventDefault();
    event.returnValue = '';
} });
const panelVisibility = { sidebar: true, editor: true };
try {
    const saved = JSON.parse(localStorage.getItem('dbml-studio:panels'));
    for (const panel of ['sidebar', 'editor']) {
        if (typeof saved?.[panel] === 'boolean') panelVisibility[panel] = saved[panel];
    }
} catch { }
function applyPanelVisibility() {
    $('sidebar').hidden = !panelVisibility.sidebar;
    $('editor-pane').hidden = !panelVisibility.editor;
    $('vim-status').hidden = !vimEnabled || !editor.getModel() || !panelVisibility.editor;
    $('splitter').hidden = !panelVisibility.editor;
    $('panels').classList.toggle('editor-collapsed', !panelVisibility.editor);
    for (const [panel, label] of [['sidebar', 'sidebar'], ['editor', 'code editor']]) {
        const toggle = $('toggle-' + panel);
        const action = (panelVisibility[panel] ? 'Hide ' : 'Show ') + label;
        toggle.setAttribute('aria-expanded', String(panelVisibility[panel]));
        toggle.setAttribute('aria-label', action);
        toggle.title = action;
    }
    try { localStorage.setItem('dbml-studio:panels', JSON.stringify(panelVisibility)); } catch { }
    requestAnimationFrame(() => editor.layout());
}
$('toggle-sidebar').onclick = () => {
    panelVisibility.sidebar = !panelVisibility.sidebar;
    applyPanelVisibility();
};
$('toggle-editor').onclick = () => {
    panelVisibility.editor = !panelVisibility.editor;
    applyPanelVisibility();
};
applyPanelVisibility();
syncVim();
const splitter = $('splitter');
splitter.onpointerdown = event => { splitter.setPointerCapture(event.pointerId); document.body.classList.add('resizing'); };
splitter.onpointermove = event => { if (splitter.hasPointerCapture(event.pointerId)) {
    const rect = $('panels').getBoundingClientRect(), ratio = Math.max(25, Math.min(75, (event.clientX - rect.left) / rect.width * 100));
    $('panels').style.setProperty('--editor-width', ratio + '%');
} };
splitter.onpointerup = event => { splitter.releasePointerCapture(event.pointerId); document.body.classList.remove('resizing'); };
splitter.onkeydown = event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const current = parseFloat($('panels').style.getPropertyValue('--editor-width') || '48');
    $('panels').style.setProperty('--editor-width', Math.max(25, Math.min(75, current + (event.key === 'ArrowLeft' ? -3 : 3))) + '%');
} };
try {
    workspace = await api('/api/workspace');
    $('workspace-name').textContent = workspace.name;
    $('workspace-name').title = workspace.root;
    let preference;
    try {
        preference = localStorage.getItem('dbml-studio:theme');
    }
    catch { }
    setTheme(['dark', 'light'].includes(preference) ? preference : workspace.theme);
    await refreshFiles();
    renderTabs();
    if (files[0])
        await openFile(files[0].path);
    const stream = new EventSource('/api/workspace/events');
    stream.onopen = () => { $('connection').innerHTML = '<span class="tiny-dot"></span>Connected'; };
    stream.onerror = () => { $('connection').textContent = 'Reconnecting…'; };
    stream.onmessage = event => { const change = JSON.parse(event.data); if (change.type === 'workspace') { if (!switchingWorkspace && change.root !== workspace.root) { workspaceStale = true; clearTimeout(previewTimer); clearTimeout(refreshTimer); previewSequence++; message('Workspace changed in another tab. Reload to continue; unsaved edits are preserved here.'); } return; } if (workspaceStale) return; clearTimeout(refreshTimer); refreshTimer = setTimeout(() => externalChange(change.path), 100); };
    window.addEventListener('pagehide', () => stream.close());
}
catch (error) {
    message(error.message);
    $('workspace-name').textContent = 'Workspace unavailable';
}
