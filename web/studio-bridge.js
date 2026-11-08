(() => {
    let ready = false, current = null, pending = null, exporting = false;
    const parentMessage = data => window.parent.postMessage(data, location.origin);
    const emit = data => window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin }));
    function apply(snapshot) {
        if (!ready) {
            pending = snapshot;
            return;
        }
        const initial = !current || current.fileId !== snapshot.fileId;
        current = snapshot;
        if (initial) {
            let state = snapshot.state;
            try {
                state = JSON.parse(localStorage.getItem('dbml-studio:layout:' + snapshot.fileId)) ?? state;
            }
            catch { }
            emit({ type: 'loadState', state });
        }
        emit({ type: 'themeChange', isDark: snapshot.theme === 'dark' });
        emit({ type: 'setFeaturesToggle', featuresToggle: snapshot.features, shouldShowProTag: { stickyNote: false, detailLevel: false, tableSearchPanelTableGroup: false, colorHeader: false } });
        emit(snapshot.update);
        parentMessage({ type: 'studio:applied', fileId: snapshot.fileId, requestId: snapshot.requestId });
    }
    window.acquireVsCodeApi = () => ({ postMessage(message) {
            if (message.type === 'ready') {
                ready = true;
                parentMessage({ type: 'studio:ready' });
                if (pending) {
                    apply(pending);
                    pending = null;
                }
            }
            else if (message.type === 'saveState' && current) {
                try {
                    localStorage.setItem('dbml-studio:layout:' + current.fileId, JSON.stringify(message.state));
                }
                catch { }
            }
            else if (message.type === 'revealError')
                parentMessage({ ...message, type: 'studio:reveal' });
        }, getState() { return null; }, setState(value) { return value; } });
    window.addEventListener('message', event => {
        if (event.source !== window.parent || event.origin !== location.origin)
            return;
        if (event.data?.type === 'studio:snapshot')
            apply(event.data.snapshot);
        if (event.data?.type === 'studio:theme') {
            if (current) current.theme = event.data.theme;
            emit({ type: 'themeChange', isDark: event.data.theme === 'dark' });
        }
        if (event.data?.type === 'studio:export') {
            const request = event.data;
            (async () => {
                let ownsExport = false;
                try {
                    if (exporting) throw new Error('An image export is already running.');
                    if (!current || current.fileId !== request.fileId) throw new Error('The diagram changed. Try exporting again.');
                    exporting = true; ownsExport = true;
                    const { captureDiagram } = await import('/diagram-export.mjs');
                    const result = await captureDiagram(window, { format: request.format, scope: request.scope, scale: request.scale, theme: current.theme });
                    parentMessage({ type: 'studio:exported', requestId: request.requestId, ...result });
                } catch (error) { parentMessage({ type: 'studio:exported', requestId: request.requestId, error: error.message }); }
                finally { if (ownsExport) exporting = false; }
            })();
        }
    });
    window.addEventListener('error', e => parentMessage({ type: 'studio:error', message: e.message }));
    window.addEventListener('unhandledrejection', e => parentMessage({ type: 'studio:error', message: e.reason?.message ?? String(e.reason) }));
})();
