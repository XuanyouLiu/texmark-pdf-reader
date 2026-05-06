const vscode = require('vscode');

function clampNumber(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, value));
}

/**
 * Fetches and maps configurations for the PDF webview.
 * @returns {Object}
 */
export function getPdfConfiguration() {
    const config = vscode.workspace.getConfiguration('texmarkPdfReader');

    // Map VS Code enum values to @embedpdf/snippet values
    const zoomMap = {
        'page-width': 'fit-width',
        'page-fit': 'fit-page',
        'page-height': 'fit-page', // fit-height is not supported by default, fallback to fit-page
        'auto': 'automatic'
    };

    const pageLayoutMap = {
        'single': 'none',
        'two-page': 'odd'
    };

    const spreadMap = {
        'none': 'none',
        'odd': 'odd',
        'even': 'even'
    };

    let zoomLevel = config.get('defaultZoomLevel', 'page-width');
    const pageLayout = config.get('defaultPageLayout', 'single');
    const spreadMode = pageLayout === 'advanced'
        ? config.get('defaultSpreadMode', 'none')
        : pageLayoutMap[pageLayout] || 'none';

    const tabBar = config.get('tabBar', 'never');
    const renderBufferSize = clampNumber(config.get('renderBufferSize', 0), 0, 0, 4);
    const renderTileSize = clampNumber(config.get('renderTileSize', 1024), 1024, 512, 1536);

    // Handle percentage strings (e.g., "100%")
    if (typeof zoomLevel === 'string' && zoomLevel.endsWith('%')) {
        const percent = parseFloat(zoomLevel);
        if (!isNaN(percent)) {
            zoomLevel = percent / 100;
        }
    } else {
        zoomLevel = zoomMap[zoomLevel] || zoomLevel;
    }

    return {
        zoomLevel: zoomLevel,
        spreadMode: spreadMap[spreadMode] || spreadMode,
        scrollStrategy: 'vertical',
        rotation: 0,
        tabBar: tabBar,
        renderBufferSize: renderBufferSize,
        renderTileSize: renderTileSize,
    };
}
