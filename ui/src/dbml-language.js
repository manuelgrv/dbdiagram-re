import { analyzeDbml, completions, symbolAt } from '../../src/dbml-language.mjs';

export function registerDbmlIntelligence(monaco, { editor, documentForModel, files, uriForPath, openPath }) {
    const cache = new WeakMap();
    const analyze = model => {
        const path = documentForModel(model)?.path ?? '', version = model.getVersionId();
        const cached = cache.get(model);
        if (cached?.version === version && cached.path === path) return cached.analysis;
        const analysis = analyzeDbml(model.getValue(), path);
        cache.set(model, { version, path, analysis });
        return analysis;
    };
    const kinds = { Table: monaco.languages.SymbolKind.Class, TablePartial: monaco.languages.SymbolKind.Struct, Enum: monaco.languages.SymbolKind.Enum, EnumMember: monaco.languages.SymbolKind.EnumMember, Field: monaco.languages.SymbolKind.Field, TableGroup: monaco.languages.SymbolKind.Namespace, Ref: monaco.languages.SymbolKind.Event, Dep: monaco.languages.SymbolKind.Event };
    monaco.languages.registerCompletionItemProvider('dbml', {
        triggerCharacters: ['.', '[', ':', '~', "'", '"', '/'],
        provideCompletionItems(model, position) {
            const doc = documentForModel(model);
            if (!doc || doc.missing) return { suggestions: [] };
            const result = completions(model.getValue(), doc.path, model.getOffsetAt(position), doc.language?.symbols, files());
            const start = model.getPositionAt(result.from), end = model.getPositionAt(result.to);
            const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
            return { suggestions: result.items.map(item => ({ ...item, kind: monaco.languages.CompletionItemKind[item.kind] ?? monaco.languages.CompletionItemKind.Keyword, range, insertTextRules: item.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined })) };
        },
    });
    monaco.languages.registerFoldingRangeProvider('dbml', {
        provideFoldingRanges(model) {
            const byStart = new Map();
            for (const fold of analyze(model).folds) if (!byStart.has(fold.start)) byStart.set(fold.start, { ...fold, kind: fold.kind === 'comment' ? monaco.languages.FoldingRangeKind.Comment : fold.kind === 'region' ? monaco.languages.FoldingRangeKind.Region : undefined });
            return [...byStart.values()];
        },
    });
    monaco.languages.registerDocumentSymbolProvider('dbml', {
        provideDocumentSymbols(model) {
            const convert = symbol => ({ name: symbol.qualified, detail: symbol.detail ?? symbol.kind, kind: kinds[symbol.kind] ?? monaco.languages.SymbolKind.Object, tags: [], range: symbol.range, selectionRange: symbol.selectionRange, children: symbol.children.map(convert) });
            return analyze(model).symbols.map(convert);
        },
    });
    function target(model, position) {
        const doc = documentForModel(model);
        return doc && !doc.missing ? symbolAt(model.getValue(), doc.path, model.getOffsetAt(position), doc.language?.symbols) : null;
    }
    monaco.languages.registerHoverProvider('dbml', {
        provideHover(model, position) {
            const symbol = target(model, position);
            if (!symbol) return;
            const word = model.getWordAtPosition(position);
            return { range: word ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : undefined, contents: [{ language: 'dbml', value: symbol.detail ?? `${symbol.kind} ${symbol.qualified}` }, { language: 'plaintext', value: `${symbol.path}:${symbol.selectionRange.startLineNumber}` }] };
        },
    });
    editor.addAction({
        id: 'dbml.goToDefinition', label: 'DBML: Go to Definition',
        keybindings: [monaco.KeyCode.F12], contextMenuGroupId: 'navigation', contextMenuOrder: 1.1,
        run: instance => {
            const model = instance.getModel(), position = instance.getPosition();
            const symbol = model && position ? target(model, position) : null;
            if (symbol) return openPath(uriForPath(symbol.path), symbol.selectionRange);
        },
    });
    monaco.languages.registerDefinitionProvider('dbml', {
        provideDefinition(model, position) {
            const symbol = target(model, position);
            if (symbol) return { uri: uriForPath(symbol.path), range: symbol.selectionRange };
        },
    });
    monaco.editor.registerEditorOpener({
        async openCodeEditor(_source, resource, selection) {
            return openPath(resource, selection);
        },
    });
}
