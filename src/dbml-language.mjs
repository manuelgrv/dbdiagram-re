// Tolerant editor metadata only. The bundled DBML compiler remains the validation authority.
const declarations = new Map(['Table', 'Enum', 'TablePartial', 'TableGroup', 'Project', 'Ref', 'Dep', 'DiagramView', 'Note'].map(name => [name.toLowerCase(), name]));
const word = token => token && ['word', 'quoted'].includes(token.kind);
const quoted = name => /^[A-Za-z_$][\w$]*$/.test(name) ? name : '"' + name.replaceAll('"', '\\"') + '"';
const location = (a, b = a) => ({ startLineNumber: a.line, startColumn: a.column, endLineNumber: b.endLine, endColumn: b.endColumn });
export function scanDbml(source) {
    const starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
    const point = offset => {
        let lo = 0, hi = starts.length;
        while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid; }
        return { line: lo + 1, column: offset - starts[lo] + 1 };
    };
    const tokens = [];
    let i = 0;
    while (i < source.length) {
        if (/\s/.test(source[i])) { i++; continue; }
        const start = i;
        let kind = 'punctuation', value, closed = true;
        if (source.startsWith('//', i)) {
            kind = 'comment'; const end = source.indexOf('\n', i); i = end < 0 ? source.length : end;
        } else if (source.startsWith('/*', i)) {
            kind = 'comment'; const end = source.indexOf('*/', i + 2); closed = end >= 0; i = closed ? end + 2 : source.length;
        } else if (source.startsWith("'''", i)) {
            kind = 'string'; const end = source.indexOf("'''", i + 3); closed = end >= 0; i = closed ? end + 3 : source.length;
        } else if (['"', "'", '`'].includes(source[i])) {
            const delimiter = source[i++]; kind = delimiter === '"' ? 'quoted' : 'string'; closed = false;
            while (i < source.length) { if (source[i] === '\\') { i = Math.min(i + 2, source.length); continue; } if (source[i++] === delimiter) { closed = true; break; } }
            value = source.slice(start + 1, closed ? i - 1 : i).replace(/\\(["'\\])/g, '$1');
        } else if (/[A-Za-z_$]/.test(source[i])) {
            kind = 'word'; i++; while (i < source.length && /[\w$]/.test(source[i])) i++;
        } else i++;
        const a = point(start), b = point(i);
        tokens.push({ kind, value: value ?? source.slice(start, i), start, end: i, ...a, endLine: b.line, endColumn: b.column, closed });
    }
    return { tokens, point, lineCount: starts.length };
}
function nameAt(tokens, index) {
    if (!word(tokens[index])) return null;
    const first = tokens[index], parts = [first.value];
    let last = first;
    while (tokens[index + 1]?.value === '.' && word(tokens[index + 2])) { index += 2; last = tokens[index]; parts.push(last.value); }
    return { name: parts.at(-1), schema: parts.length > 1 ? parts.slice(0, -1).join('.') : '', qualified: parts.map(quoted).join('.'), range: location(first, last), index: index + 1 };
}
export function analyzeDbml(source, path = '') {
    const scan = scanDbml(source), tokens = scan.tokens.filter(t => t.kind !== 'comment');
    const folds = [], pairs = new Map(), depth = [], stack = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]; depth[i] = stack.length;
        if (t.kind !== 'punctuation') continue;
        if (t.value === '{' || t.value === '[') stack.push(i);
        else if (t.value === '}' || t.value === ']') {
            const open = stack.at(-1);
            if (open !== undefined && tokens[open].value === (t.value === '}' ? '{' : '[')) { stack.pop(); pairs.set(open, i); }
        }
    }
    for (const open of stack) pairs.set(open, tokens.length);
    for (const [open, close] of pairs) {
        const start = tokens[open].line, end = tokens[close]?.line ?? scan.lineCount;
        if (end > start) folds.push({ start, end });
    }
    for (const t of scan.tokens) if ((t.kind === 'comment' || t.kind === 'string') && t.endLine > t.line) folds.push({ start: t.line, end: t.endLine, kind: t.kind === 'comment' ? 'comment' : 'region' });
    const symbols = [], imports = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (depth[i] !== 0 || t.kind !== 'word') continue;
        if (['use', 'reuse'].includes(t.value)) {
            let from = i + 1;
            while (from < tokens.length && !(tokens[from].kind === 'word' && tokens[from].value === 'from')) { if (depth[from] === 0 && declarations.has(tokens[from].value.toLowerCase())) break; from++; }
            const target = tokens[from + 1];
            if (tokens[from]?.value === 'from' && target?.kind === 'string') {
                const specs = [];
                if (tokens[i + 1]?.value !== '*') {
                    let j = i + 2;
                    while (j < from) {
                        if ([',', '}'].includes(tokens[j]?.value)) { j++; continue; }
                        let kind;
                        if (['table', 'enum', 'tablepartial', 'tablegroup'].includes(tokens[j]?.value.toLowerCase())) kind = tokens[j++].value.toLowerCase();
                        const name = nameAt(tokens, j);
                        if (!name) { j++; continue; }
                        j = name.index;
                        let alias;
                        if (tokens[j]?.value === 'as' && word(tokens[j + 1])) { alias = tokens[j + 1].value; j += 2; }
                        specs.push({ ...name, kind, alias });
                    }
                }
                imports.push({ target: target.value, reexport: t.value === 'reuse', specs, wildcard: tokens[i + 1]?.value === '*' });
                i = from + 1;
            }
            continue;
        }
        const kind = declarations.get(t.value.toLowerCase());
        if (!kind) continue;
        const parsed = nameAt(tokens, i + 1);
        let j = parsed?.index ?? i + 1, alias;
        if (tokens[j]?.value === 'as' && word(tokens[j + 1])) { alias = tokens[j + 1].value; j += 2; }
        if (tokens[j]?.value === ':') continue;
        while (j < tokens.length && tokens[j].value !== '{') {
            if (tokens[j].value === '[') j = (pairs.get(j) ?? j) + 1;
            else if (tokens[j].line > t.line + 2 || tokens[j].value === '}') break;
            else j++;
        }
        if (tokens[j]?.value !== '{') continue;
        const close = pairs.get(j) ?? tokens.length, last = tokens[close] ?? tokens.at(-1) ?? t;
        const symbol = { kind, name: parsed?.name ?? kind, schema: parsed?.schema ?? '', qualified: parsed?.qualified ?? kind, alias, path, range: location(t, last), selectionRange: parsed?.range ?? location(t), start: t.start, bodyStart: tokens[j].end, end: tokens[close]?.end ?? source.length, children: [] };
        if (['Table', 'TablePartial', 'Enum'].includes(kind)) {
            let previousLine = -1;
            for (let k = j + 1; k < close; k++) {
                const field = tokens[k];
                if (depth[k] !== depth[j] + 1 || field.line === previousLine) continue;
                previousLine = field.line;
                if (!word(field) && !(kind === 'Enum' && field.kind === 'string')) continue;
                if (/^(note|indexes|checks|records)$/i.test(field.value) || tokens[k + 1]?.value === ':') continue;
                const next = tokens[k + 1];
                if (kind !== 'Enum' && (!word(next) || next.line !== field.line)) continue;
                const child = { kind: kind === 'Enum' ? 'EnumMember' : 'Field', name: field.value, qualified: field.value, detail: kind === 'Enum' ? 'Enum value' : next.value, path, range: location(field, kind === 'Enum' ? field : next), selectionRange: location(field), children: [] };
                symbol.children.push(child);
            }
        }
        symbols.push(symbol);
    }
    return { ...scan, symbols, imports, folds: folds.sort((a, b) => a.start - b.start || b.end - a.end) };
}
function resolveImport(path, target, files) {
    if (!target || target.startsWith('/') || target.includes('\\')) return null;
    const parts = path.split('/').slice(0, -1);
    for (const part of target.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { if (!parts.length) return null; parts.pop(); }
        else parts.push(part);
    }
    const joined = parts.join('/');
    return files.has(joined) ? joined : files.has(joined + '.dbml') ? joined + '.dbml' : null;
}
export function projectLanguage(entry, sources) {
    const files = new Map(sources.map(([path, source]) => [path.replace(/^\/workspace\//, ''), source]));
    const parsed = new Map(), visiting = new Set(), cache = new Map();
    const get = path => { if (!parsed.has(path)) parsed.set(path, analyzeDbml(files.get(path) ?? '', path)); return parsed.get(path); };
    function visit(path) {
        if (cache.has(path)) return cache.get(path);
        const own = get(path).symbols;
        if (visiting.has(path)) return { visible: own, exports: own };
        visiting.add(path);
        const visible = [...own], exported = [...own];
        for (const imp of get(path).imports) {
            const target = resolveImport(path, imp.target, files);
            if (!target) continue;
            const available = visit(target).exports;
            const selected = imp.wildcard ? available : imp.specs.flatMap(spec => available.filter(s => (!spec.kind || s.kind.toLowerCase() === spec.kind) && (s.qualified === spec.qualified || (!spec.schema && (s.name === spec.name || s.alias === spec.name)))).map(s => spec.alias ? { ...s, name: spec.alias, schema: '', qualified: quoted(spec.alias), alias: spec.alias } : s));
            visible.push(...selected);
            if (imp.reexport) exported.push(...selected);
        }
        visiting.delete(path);
        const unique = values => [...new Map(values.map(s => [s.kind + ':' + s.qualified + ':' + (s.alias ?? '') + ':' + s.path, s])).values()];
        const result = { visible: unique(visible), exports: unique(exported) }; cache.set(path, result); return result;
    }
    return { symbols: visit(entry).visible };
}
const types = ['int', 'integer', 'bigint', 'smallint', 'serial', 'bigserial', 'varchar', 'char', 'text', 'boolean', 'decimal', 'numeric', 'float', 'double', 'date', 'datetime', 'timestamp', 'time', 'uuid', 'json', 'jsonb', 'binary', 'blob'];
const settings = ['pk', 'primary key', 'not null', 'null', 'unique', 'increment', 'default:', 'note:', 'ref:', 'check:'];
const snippets = {
    Table: 'Table ${1:table_name} {\n  ${2:id} bigint [pk]\n}',
    Enum: 'Enum ${1:enum_name} {\n  ${2:value}\n}',
    TablePartial: 'TablePartial ${1:partial_name} {\n  ${2:id} bigint [pk]\n}',
    TableGroup: 'TableGroup ${1:group_name} {\n  ${2:table_name}\n}',
    Project: "Project ${1:project_name} {\n  database_type: '${2:PostgreSQL}'\n}",
    Ref: 'Ref: ${1:child}.${2:parent_id} > ${3:parent}.${4:id}',
    Dep: 'Dep: ${1:source_table} -> ${2:target_table}',
    DiagramView: 'DiagramView ${1:view_name} {\n  ${2:table_name}\n}',
    Note: "Note ${1:note_name} {\n  '${2:description}'\n}",
    use: "use * from '${1:./module.dbml}'", reuse: "reuse * from '${1:./module.dbml}'",
};
function relativeImport(path, target) {
    const parent = path.split('/').slice(0, -1), parts = target.split('/');
    while (parent.length && parts.length && parent[0] === parts[0]) { parent.shift(); parts.shift(); }
    const result = '../'.repeat(parent.length) + parts.join('/'); return result.startsWith('.') ? result : './' + result;
}
export function completions(source, path, offset, imported = [], files = []) {
    const analysis = analyzeDbml(source, path), line = source.slice(0, offset).split('\n').at(-1);
    const importMatch = line.match(/\bfrom\s+(['"])([^'"]*)$/);
    const partial = line.match(/[\w$]*$/)?.[0] ?? '';
    const result = { from: offset - partial.length, to: offset, items: [] };
    const add = (label, kind = 'Keyword', detail = '', insertText = label, snippet = false) => result.items.push({ label, kind, detail, insertText, snippet });
    const insideComment = analysis.tokens.some(t => t.kind === 'comment' && t.start < offset && (offset <= t.end));
    if (insideComment) return result;
    if (importMatch) {
        result.from = offset - importMatch[2].length;
        for (const file of files) if (file !== path) { const relative = relativeImport(path, file); add(relative, 'File', 'Workspace DBML module'); }
        return result;
    }
    if (analysis.tokens.some(t => ['comment', 'string', 'quoted'].includes(t.kind) && t.start < offset && (offset < t.end || (!t.closed && offset === t.end) || (t.kind === 'comment' && t.value.startsWith('//') && offset === t.end)))) return result;
    const symbols = [...analysis.symbols, ...imported.filter(s => s.path !== path)];
    const chain = line.slice(0, line.length - partial.length).match(/((?:"[^"\n]+"|[A-Za-z_$][\w$]*)(?:\s*\.\s*(?:"[^"\n]+"|[A-Za-z_$][\w$]*))*\s*)\.\s*$/)?.[1]?.replace(/\s*\.\s*/g, '.').trim();
    if (chain) {
        const table = symbols.find(s => [s.qualified, quoted(s.name), s.alias].includes(chain));
        if (table) for (const child of table.children ?? []) add(child.name, child.kind === 'Field' ? 'Field' : 'EnumMember', child.detail ?? table.qualified, quoted(child.name));
        else for (const symbol of symbols.filter(s => s.schema === chain)) add(symbol.name, symbol.kind === 'Enum' ? 'Enum' : 'Class', symbol.kind + ' ' + symbol.qualified, quoted(symbol.name));
        return result;
    }
    const block = analysis.symbols.find(s => s.bodyStart <= offset && offset <= s.end);
    const inlineRef = line.lastIndexOf('[') > line.lastIndexOf(']') && /\bref\s*:[^,\]]*$/i.test(line.slice(line.lastIndexOf('[') + 1));
    const reference = /\b(?:Ref|Dep)\b/i.test(line) || inlineRef || ['Ref', 'Dep'].includes(block?.kind);
    const inSettings = line.lastIndexOf('[') > line.lastIndexOf(']');
    if (/~[\w$]*$/.test(line) && ['Table', 'TablePartial'].includes(block?.kind)) {
        result.from--;
        for (const symbol of symbols.filter(s => s.kind === 'TablePartial')) add('~' + symbol.name, 'Struct', 'Table partial', '~' + quoted(symbol.name));
    } else if (inSettings && !inlineRef) {
        const tableHeader = /\b(?:Table|TablePartial|TableGroup)\b/i.test(line);
        for (const value of reference ? ['delete:', 'update:', 'color:'] : tableHeader ? ['headercolor:', 'note:'] : block?.kind === 'Enum' ? ['note:'] : settings) add(value, 'Property', 'DBML setting');
    } else if (reference || ['TableGroup', 'DiagramView'].includes(block?.kind)) {
        for (const symbol of symbols.filter(s => s.kind === 'Table')) {
            add(symbol.qualified, 'Class', 'Table · ' + (symbol.path || path));
            if (symbol.alias && symbol.alias !== symbol.qualified) add(symbol.alias, 'Class', 'Alias of ' + symbol.qualified);
            if (symbol.schema && symbol.name !== symbol.qualified) add(symbol.name, 'Class', 'Table ' + symbol.qualified, quoted(symbol.name));
        }
    } else if (block && ['Table', 'TablePartial'].includes(block.kind)) {
        const prior = source.slice(block.bodyStart, offset);
        if (/\bindexes\s*\{[^}]*$/i.test(prior)) {
            for (const field of block.children) add(field.name, 'Field', field.detail, quoted(field.name));
        } else if (/^\s*(?:"[^"\n]+"|[\w$]+)\s+[\w$]*$/.test(line)) {
            for (const type of types) add(type, 'TypeParameter', 'SQL column type');
            for (const symbol of symbols.filter(s => s.kind === 'Enum')) add(symbol.qualified, 'Enum', 'Enum type');
        } else {
            add('Indexes', 'Snippet', 'Index definitions', 'Indexes {\n  ${1:column_name} [${2:unique}]\n}', true);
            add('Note', 'Snippet', 'Table note', "Note: '${1:description}'", true);
            for (const symbol of symbols.filter(s => s.kind === 'TablePartial')) add('~' + symbol.name, 'Struct', 'Table partial', '~' + quoted(symbol.name));
        }
    } else if (block?.kind === 'Project') {
        for (const value of ['database_type:', 'Note:']) add(value, 'Property', 'Project setting');
    } else if (!block || block.kind === 'Note') {
        for (const [label, text] of Object.entries(snippets)) add(label, 'Snippet', 'DBML ' + label, text, true);
    }
    const seen = new Set(); result.items = result.items.filter(item => !seen.has(item.label) && seen.add(item.label));
    return result;
}
export function symbolAt(source, path, offset, imported = []) {
    const analysis = analyzeDbml(source, path), all = [...analysis.symbols, ...imported.filter(s => s.path !== path)];
    const tokens = analysis.tokens.filter(t => t.kind !== 'comment' && t.kind !== 'string');
    let index = tokens.findIndex(t => word(t) && t.start <= offset && offset <= t.end);
    if (index < 0) return null;
    let first = index;
    while (first >= 2 && tokens[first - 1].value === '.' && word(tokens[first - 2])) first -= 2;
    const qualified = nameAt(tokens, first);
    const names = tokens.slice(first, qualified.index).filter(word).map(t => t.value);
    const targetName = tokens[index].value;
    if (names.length === 1) {
        const owner = analysis.symbols.find(s => s.bodyStart <= offset && offset <= s.end);
        const field = owner?.children.find(child => child.name === targetName);
        if (field) return { ...field, detail: owner.qualified + '.' + quoted(field.name) + ' · ' + field.detail };
    }
    const tableName = names.slice(0, -1).map(quoted).join('.');
    if (names.length > 1) {
        const table = all.find(s => [s.qualified, s.name, s.alias].includes(tableName));
        const field = table?.children?.find(c => c.name === targetName);
        if (field) return { ...field, detail: table.qualified + '.' + quoted(field.name) + ' · ' + field.detail };
    }
    return all.find(s => [s.qualified, s.name, s.alias].includes(qualified.qualified) || s.name === targetName) ?? null;
}
