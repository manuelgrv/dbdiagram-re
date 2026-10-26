(() => {
    let ready = false, current = null, pending = null;
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
        if (event.data?.type === 'studio:theme')
            emit({ type: 'themeChange', isDark: event.data.theme === 'dark' });
    });
    window.addEventListener('error', e => parentMessage({ type: 'studio:error', message: e.message }));
    window.addEventListener('unhandledrejection', e => parentMessage({ type: 'studio:error', message: e.reason?.message ?? String(e.reason) }));
})();
