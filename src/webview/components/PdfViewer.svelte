<script lang="ts">
  import { onDestroy } from "svelte";
  import { PDFViewer, ZoomMode, SpreadMode } from "@embedpdf/svelte-pdf-viewer";
  import { pdfState } from "../state/pdfStore.svelte.js";
  import { vscodeService } from "../services/vscode.js";
  import { createViewerRuntime } from "../viewer/runtime.js";

  const viewerRuntime = createViewerRuntime({ pdfState, vscodeService });
  const initialViewState = $derived(pdfState.persistedViewState || {});
  const renderBufferSize = $derived(pdfState.messageConfig?.renderBufferSize ?? 0);
  const renderTileSize = $derived(pdfState.messageConfig?.renderTileSize ?? 1024);

  $effect(() => {
    if (pdfState.container) {
      console.log("[Webview] Syncing theme preference:", pdfState.themePreference);
      pdfState.container.setTheme({ preference: pdfState.themePreference });
    }
  });

  onDestroy(() => {
    viewerRuntime.destroy();
  });
</script>

<div id="pdf-container" class="viewer-wrapper">
  <PDFViewer
    oninit={viewerRuntime.handleInit}
    onready={viewerRuntime.handleReady}
    config={{
      src: pdfState.pdfSrc,
      wasmUrl: pdfState.wasmUrl,
      theme: { preference: pdfState.themePreference },
      tabBar: pdfState.messageConfig?.tabBar,
      disabledCategories: [
        "print",
        "export",
        "redaction",
        "document",
        "mode-annotate",
        "mode-shapes",
        "mode-insert",
        "mode-form",
      ],
      annotations: {
        autoOpenLinks: false,
      },
      worker: true,
      render: {
        defaultImageType: "image/bmp",
      },
      tiling: {
        tileSize: renderTileSize,
        overlapPx: 1,
        extraRings: 0,
        defaultImageType: "image/bmp",
      },
      scroll: {
        defaultStrategy: initialViewState.scrollStrategy || pdfState.messageConfig?.scrollStrategy || "vertical",
        defaultBufferSize: renderBufferSize,
      },
      rotation: {
        defaultRotation:
          typeof initialViewState.rotation === "number"
            ? initialViewState.rotation
            : pdfState.messageConfig?.rotation || 0,
      },
      spread: {
        defaultSpreadMode: initialViewState.spreadMode || pdfState.messageConfig?.spreadMode || SpreadMode.None,
      },
      zoom: {
        defaultZoomLevel: initialViewState.zoomLevel || pdfState.messageConfig?.zoomLevel || ZoomMode.FitWidth,
      },
    }}
    style="width: 100%; height: 100%;"
  />
</div>

<style>
  .viewer-wrapper {
    width: 100%;
    height: 100%;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--vscode-editorWidget-background) 60%, transparent), transparent 34rem),
      var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    -webkit-font-smoothing: antialiased;
  }

  :global(#pdf-container button),
  :global(#pdf-container [role="button"]) {
    border-radius: 6px;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      opacity 120ms ease;
  }

  :global(#pdf-container button:hover),
  :global(#pdf-container [role="button"]:hover) {
    background-color: var(--vscode-toolbar-hoverBackground);
  }

  :global(#pdf-container input),
  :global(#pdf-container select) {
    border-radius: 6px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
  }

  :global(#pdf-container img) {
    image-rendering: auto;
  }
</style>
