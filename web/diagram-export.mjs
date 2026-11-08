const maxPixels = 16 * 1024 * 1024;
const maxDimension = 16384;
export function exportPlan(stage, { scope = 'diagram', scale = 1, format = 'png' } = {}) {
    if (!['png', 'jpeg'].includes(format) || !['diagram', 'viewport'].includes(scope) || ![1, 2, 3].includes(scale)) throw new Error('Choose a supported image format, area and resolution.');
    const bounds = scope === 'viewport' ? { x: 0, y: 0, width: stage.width(), height: stage.height() } : stage.getClientRect({ relativeTo: stage });
    if (!['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) || bounds.width <= 0 || bounds.height <= 0) throw new Error('The diagram is empty or still rendering. Try again in a moment.');
    const padding = scope === 'diagram' ? 24 : 0;
    const x = Math.floor(bounds.x - padding), y = Math.floor(bounds.y - padding);
    const crop = { x, y, width: Math.ceil(bounds.x + bounds.width + padding) - x, height: Math.ceil(bounds.y + bounds.height + padding) - y };
    const width = crop.width * scale, height = crop.height * scale;
    if (width > maxDimension || height > maxDimension || width * height > maxPixels) throw new Error('The image is too large. Choose a lower resolution or export the visible area.');
    return { crop, width, height, scale, mimeType: format === 'png' ? 'image/png' : 'image/jpeg' };
}
function background(window, stage, theme) {
    for (let node = stage.container(); node; node = node.parentElement) {
        const color = window.getComputedStyle(node).backgroundColor;
        if (color && color !== 'transparent' && !/^rgba\([^)]*,\s*0\)$/.test(color)) return color;
    }
    return theme === 'light' ? '#ffffff' : '#141b25';
}
export async function captureDiagram(window, options = {}) {
    const stages = (window.Konva?.stages ?? []).filter(stage => stage.container()?.isConnected && stage.width() > 0 && stage.height() > 0);
    const stage = stages.sort((a, b) => b.width() * b.height() - a.width() * a.height())[0];
    if (!stage) throw new Error('The diagram canvas is not ready. Open a diagram and try again.');
    await window.document.fonts?.ready;
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    // Auto-arrangement can finish after the renderer acknowledges a snapshot.
    const started = window.performance.now();
    let signature = '', stableSince = started;
    while (true) {
        const next = JSON.stringify([stage.getClientRect({ relativeTo: stage }), stage.find('Shape').length]);
        const now = window.performance.now();
        if (next !== signature) { signature = next; stableSince = now; }
        if (now - started >= 700 && now - stableSince >= 400) break;
        if (now - started > 8000) throw new Error('The diagram is still arranging. Wait a moment and try exporting again.');
        await new Promise(resolve => window.requestAnimationFrame(resolve));
    }
    const plan = exportPlan(stage, options);
    let scene, canvas;
    try {
        const originalScale = stage.scale(), originalPosition = stage.position();
        try {
            if ((options.scope ?? 'diagram') === 'diagram') {
                // Custom renderer shapes cannot be cloned. Normalize the camera only for
                // synchronous offscreen drawing, restoring it before yielding to the browser.
                stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 });
            }
            scene = stage.toCanvas({ ...plan.crop, pixelRatio: plan.scale });
        } finally {
            stage.scale(originalScale); stage.position(originalPosition); stage.batchDraw();
        }
        canvas = window.document.createElement('canvas');
        canvas.width = plan.width; canvas.height = plan.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image export is unavailable in this browser.');
        // An opaque background keeps JPEG readable and preserves the selected diagram theme.
        context.fillStyle = background(window, stage, options.theme);
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(scene, 0, 0);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The browser could not encode the image. Try a lower resolution.')), plan.mimeType, 0.92));
        if (blob.type !== plan.mimeType) throw new Error('This browser does not support the selected image format.');
        return { blob, width: plan.width, height: plan.height };
    } catch (error) {
        if (error.name === 'SecurityError') throw new Error('The diagram contains an image that the browser cannot export. Remove that image and try again.');
        throw error;
    } finally {
        // Release large pixel buffers after encoding, without changing the original stage or view.
        if (scene) { scene.width = 0; scene.height = 0; }
        if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
}
