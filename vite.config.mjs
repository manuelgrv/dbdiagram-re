import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
    root: fileURLToPath(new URL('./ui/', import.meta.url)),
    build: { outDir: fileURLToPath(new URL('./dist/studio/', import.meta.url)), emptyOutDir: true },
    worker: { format: 'es' },
    resolve: { alias: { 'monaco-editor/esm/vs/editor/editor.api': fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url)), 'monaco-editor/esm/vs/editor/common/commands/shiftCommand': fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs/editor/common/commands/shiftCommand.js', import.meta.url)), 'monaco-vim': fileURLToPath(new URL('./node_modules/monaco-vim/dist/index.mjs', import.meta.url)) } },
});
