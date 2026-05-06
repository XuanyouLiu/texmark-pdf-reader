import { buildViewState, getPageCoordinates } from "./viewState.js";

const RESTORE_SETTLE_MS = 700;
const VIEW_ANNOTATION_TOOLBAR = "annotation-toolbar";
const HIDDEN_ANNOTATION_TOOLBAR_ITEMS = new Set([
  "add-highlight",
  "add-strikeout",
  "add-underline",
  "add-squiggly",
  "add-insert-text",
  "add-replace-text",
  "annotation:add-insert-text",
  "annotation:add-replace-text",
]);

export function createViewerRuntime({ pdfState, vscodeService }) {
  let registryDisposables = [];
  let extensionSyncTimeout;
  let checkpointSyncTimeout;
  let settleTimeout;
  let restoreFinalizeTimeout;
  let restoreRetryTimeout;
  let scrollSyncTimeout;
  let restoreCompleted = false;
  let restoreAttemptCount = 0;
  let isRestoring = false;
  let settleUntil = 0;
  let lastScrollStrategy = null;
  let lastSidebarState = null;

  let scrollCapability = null;
  let viewportCapability = null;
  let zoomCapability = null;
  let spreadCapability = null;
  let rotateCapability = null;
  let uiCapability = null;
  let annotationCapability = null;
  let interactionCapability = null;

  function clearTimers() {
    clearTimeout(extensionSyncTimeout);
    clearTimeout(checkpointSyncTimeout);
    clearTimeout(settleTimeout);
    clearTimeout(scrollSyncTimeout);
    clearTimeout(restoreFinalizeTimeout);
    clearTimeout(restoreRetryTimeout);
  }

  function resetRuntimeState() {
    restoreCompleted = false;
    restoreAttemptCount = 0;
    isRestoring = false;
    settleUntil = 0;
    lastScrollStrategy = null;
    lastSidebarState = null;
    scrollCapability = null;
    viewportCapability = null;
    zoomCapability = null;
    spreadCapability = null;
    rotateCapability = null;
    uiCapability = null;
    annotationCapability = null;
    interactionCapability = null;
  }

  function clearRegistryDisposables() {
    clearTimers();
    for (const dispose of registryDisposables) {
      try {
        dispose();
      } catch (error) {
        console.error("[Webview] Failed to dispose registry listener", error);
      }
    }
    registryDisposables = [];
    resetRuntimeState();
  }

  function buildCurrentViewState(overrides = {}) {
    return buildViewState({
      baseViewState: pdfState.persistedViewState,
      scrollCapability,
      zoomCapability,
      spreadCapability,
      rotateCapability,
      uiCapability,
      lastScrollStrategy,
      lastSidebarState,
      overrides,
    });
  }

  function queueViewStateSync(overrides = {}, options = {}) {
    const { flush = false, immediate = false, force = false } = options;
    const settlingDelay = Math.max(0, settleUntil - Date.now());

    if (isRestoring && !force) {
      return;
    }

    const syncState = buildCurrentViewState(overrides);
    pdfState.syncViewState(syncState, { notifyExtension: false, persistLocally: false });

    if (flush) {
      clearTimeout(extensionSyncTimeout);
      clearTimeout(checkpointSyncTimeout);
      pdfState.syncViewState(syncState, {
        notifyExtension: true,
        flush: true,
        persistLocally: true,
      });
      return;
    }

    clearTimeout(extensionSyncTimeout);
    extensionSyncTimeout = window.setTimeout(() => {
      pdfState.syncViewState(buildCurrentViewState(), {
        notifyExtension: true,
        persistLocally: true,
      });
    }, immediate ? 0 : 180);

    clearTimeout(checkpointSyncTimeout);
    checkpointSyncTimeout = window.setTimeout(() => {
      pdfState.syncViewState(buildCurrentViewState(), {
        notifyExtension: true,
        flush: true,
        persistLocally: true,
      });
    }, settlingDelay > 0 ? settlingDelay + 150 : 1600);
  }

  function restoreViewState() {
    if (restoreCompleted) {
      return;
    }

    const savedViewState = pdfState.persistedViewState;
    if (!savedViewState) {
      restoreCompleted = true;
      queueViewStateSync();
      return;
    }

    restoreAttemptCount += 1;
    isRestoring = true;
    restoreCompleted = true;
    vscodeService.postMessage({
      command: "log",
      message: `[Restore] Attempt ${restoreAttemptCount} for page ${savedViewState.pageNumber ?? "unknown"}`,
    });

    try {
      const sidebar = savedViewState.sidebar;

      if (sidebar?.placement && sidebar?.slot && sidebar?.sidebarId && uiCapability) {
        lastSidebarState = {
          placement: sidebar.placement,
          slot: sidebar.slot,
          sidebarId: sidebar.sidebarId,
          tabId: sidebar.tabId || null,
        };
        uiCapability.setActiveSidebar(
          sidebar.placement,
          sidebar.slot,
          sidebar.sidebarId,
          undefined,
          sidebar.tabId || undefined
        );
      }

      if (savedViewState.scrollStrategy && scrollCapability) {
        scrollCapability.setScrollStrategy(savedViewState.scrollStrategy);
      }

      if (savedViewState.spreadMode && spreadCapability) {
        spreadCapability.setSpreadMode(savedViewState.spreadMode);
      }

      if (typeof savedViewState.rotation === "number" && rotateCapability) {
        rotateCapability.setRotation(savedViewState.rotation);
      }

      if (savedViewState.zoomLevel !== undefined && savedViewState.zoomLevel !== null && zoomCapability) {
        zoomCapability.requestZoom(savedViewState.zoomLevel);
      }

      if (savedViewState.pageNumber && scrollCapability) {
        scrollCapability.scrollToPage({
          pageNumber: savedViewState.pageNumber,
          pageCoordinates: savedViewState.pageCoordinates || undefined,
          behavior: "instant",
        });
      }
    } finally {
      clearTimeout(restoreRetryTimeout);
      restoreRetryTimeout = window.setTimeout(() => {
        const targetPage = savedViewState.pageNumber;
        const currentPage = scrollCapability?.getCurrentPage();

        if (targetPage && currentPage && currentPage !== targetPage && restoreAttemptCount < 3) {
          restoreCompleted = false;
          restoreViewState();
          return;
        }

        clearTimeout(restoreFinalizeTimeout);
        restoreFinalizeTimeout = window.setTimeout(() => {
          isRestoring = false;
          settleUntil = Date.now() + RESTORE_SETTLE_MS;
          clearTimeout(settleTimeout);
          settleTimeout = window.setTimeout(() => {
            settleUntil = 0;
            queueViewStateSync({}, { flush: true, force: true });
          }, RESTORE_SETTLE_MS);
          queueViewStateSync({}, { force: true });
        }, 250);
      }, 200);
    }
  }

  function bindScrollEvents() {
    if (!scrollCapability) {
      restoreViewState();
      return;
    }

    restoreAttemptCount = 0;
    isRestoring = !!pdfState.persistedViewState;

    if (pdfState.persistedViewState) {
      clearTimeout(restoreRetryTimeout);
      restoreRetryTimeout = window.setTimeout(() => {
        if (!restoreCompleted) {
          restoreViewState();
        }
      }, 250);
    }

    registryDisposables.push(
      scrollCapability.onLayoutReady((event) => {
        if (event.isInitial || !restoreCompleted) {
          restoreViewState();
        }
      })
    );

    registryDisposables.push(
      scrollCapability.onPageChange((event) => {
        queueViewStateSync(
          {
            pageNumber: event.pageNumber,
          },
          { immediate: true }
        );
      })
    );

    registryDisposables.push(
      scrollCapability.onScroll((event) => {
        clearTimeout(scrollSyncTimeout);
        scrollSyncTimeout = window.setTimeout(() => {
          queueViewStateSync({
            pageNumber: event.metrics.currentPage,
            pageCoordinates: getPageCoordinates(event.metrics, event.metrics.currentPage),
          });
        }, 180);
      })
    );

    registryDisposables.push(
      scrollCapability.onStateChange((state) => {
        lastScrollStrategy = state.strategy;
        queueViewStateSync({
          scrollStrategy: state.strategy,
        });
      })
    );
  }

  function bindCapabilityEvents() {
    if (zoomCapability) {
      registryDisposables.push(
        zoomCapability.onZoomChange((event) => {
          queueViewStateSync(
            {
              zoomLevel: event.level,
            },
            { immediate: true }
          );
        })
      );
    }

    if (spreadCapability) {
      registryDisposables.push(
        spreadCapability.onSpreadChange((event) => {
          queueViewStateSync(
            {
              spreadMode: event.spreadMode,
            },
            { immediate: true }
          );
        })
      );
    }

    if (rotateCapability) {
      registryDisposables.push(
        rotateCapability.onRotateChange((event) => {
          queueViewStateSync(
            {
              rotation: event.rotation,
            },
            { immediate: true }
          );
        })
      );
    }

    if (uiCapability) {
      registryDisposables.push(
        uiCapability.onSidebarChanged((event) => {
          const uiState = uiCapability?.getState?.();
          lastSidebarState = {
            placement: event.placement,
            slot: event.slot,
            sidebarId: event.sidebarId,
            tabId: uiState?.sidebarTabs?.[event.sidebarId] || null,
          };

          queueViewStateSync(
            {
              sidebar: lastSidebarState,
            },
            { immediate: true }
          );
        })
      );
    }

    if (annotationCapability) {
      registryDisposables.push(
        annotationCapability.onNavigate((event) => {
          if (event.result.outcome === "navigated") {
            return;
          }

          vscodeService.postMessage({
            command: "open-link",
            result: event.result,
            target: event.target,
          });
        })
      );

      registryDisposables.push(
        annotationCapability.onStateChange((event) => {
          if (!event.state?.hasPendingChanges) {
            return;
          }

          pdfState.markDirty();
        })
      );

      registryDisposables.push(
        annotationCapability.onAnnotationEvent((event) => {
          if (event.type !== "create") {
            return;
          }

          switchToViewMode(event.documentId);
        })
      );
    }
  }

  function bindReverseSyncTeX() {
    const handler = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.button !== 0) {
        return;
      }

      if (!isEventInsidePdfContainer(event)) {
        return;
      }

      const target = getReverseSyncTeXTarget(event);
      if (!target) {
        vscodeService.postMessage({
          command: "warning",
          message: "Could not map this click to a PDF page for SyncTeX.",
        });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      vscodeService.postMessage({
        command: "reverse-synctex",
        documentKey: pdfState.currentDocumentKey,
        ...target,
      });
    };

    window.addEventListener("click", handler, true);
    registryDisposables.push(() => window.removeEventListener("click", handler, true));
  }

  function getReverseSyncTeXTarget(event) {
    const scrollContainer = getScrollContainer(event);
    const targetFromLayout = getReverseSyncTeXTargetFromLayout(event, scrollContainer);
    if (targetFromLayout) {
      return targetFromLayout;
    }

    const metrics = scrollCapability?.getMetrics?.(viewportCapability?.getMetrics?.());
    const pageMetrics = metrics?.pageVisibilityMetrics || [];

    if (!scrollContainer || pageMetrics.length === 0) {
      return null;
    }

    const viewportRect = scrollContainer.getBoundingClientRect();
    const viewportX = event.clientX - viewportRect.left;
    const viewportY = event.clientY - viewportRect.top;
    const metric = pageMetrics.find((item) => {
      const left = item.viewportX;
      const top = item.viewportY;
      const right = left + item.scaled.visibleWidth;
      const bottom = top + item.scaled.visibleHeight;

      return viewportX >= left && viewportX <= right && viewportY >= top && viewportY <= bottom;
    });

    if (!metric?.scaled?.scale) {
      return null;
    }

    const pageX = metric.original.pageX + (viewportX - metric.viewportX) / metric.scaled.scale;
    const pageYFromTop = metric.original.pageY + (viewportY - metric.viewportY) / metric.scaled.scale;

    return {
      page: metric.pageNumber,
      x: pageX,
      y: pageYFromTop,
    };
  }

  function getReverseSyncTeXTargetFromLayout(event, scrollContainer) {
    const layout = scrollCapability?.getLayout?.();
    const activeDocument = getActiveDocumentState();
    const scale = activeDocument?.scale || 1;
    const virtualItems = layout?.virtualItems || [];
    const contentRoot = getRenderedContentRoot(scrollContainer, layout, scale);

    if (!scrollContainer || !contentRoot || virtualItems.length === 0) {
      return null;
    }

    const totalWidth = (layout.totalContentSize?.width || 0) * scale;
    const totalHeight = (layout.totalContentSize?.height || 0) * scale;
    const contentRect = contentRoot.getBoundingClientRect();
    const contentX = event.clientX - contentRect.left;
    const contentY = event.clientY - contentRect.top;
    const strategy = lastScrollStrategy || pdfState.messageConfig?.scrollStrategy || "vertical";

    for (const item of virtualItems) {
      const itemLeft = item.x * scale;
      const itemTop = item.y * scale;
      const centerX =
        strategy === "vertical"
          ? Math.max(0, (totalWidth - item.width * scale) / 2)
          : 0;
      const centerY =
        strategy === "horizontal"
          ? Math.max(0, (totalHeight - item.height * scale) / 2)
          : 0;

      for (const pageLayout of item.pageLayouts || []) {
        const pageLeft = itemLeft + centerX + pageLayout.x * scale;
        const pageTop = itemTop + centerY + pageLayout.y * scale;
        const pageWidth = pageLayout.rotatedWidth * scale;
        const pageHeight = pageLayout.rotatedHeight * scale;

        if (
          contentX < pageLeft ||
          contentX > pageLeft + pageWidth ||
          contentY < pageTop ||
          contentY > pageTop + pageHeight
        ) {
          continue;
        }

        const point = convertRotatedPointToPagePoint(
          {
            x: (contentX - pageLeft) / scale,
            y: (contentY - pageTop) / scale,
          },
          pageLayout,
          activeDocument
        );

        return {
          page: pageLayout.pageNumber,
          x: point.x,
          y: point.y,
        };
      }
    }

    return null;
  }

  function getRenderedContentRoot(scrollContainer, layout, scale) {
    if (!scrollContainer || !layout?.totalContentSize) {
      return null;
    }

    const expectedWidth = (layout.totalContentSize.width || 0) * scale;
    const expectedHeight = (layout.totalContentSize.height || 0) * scale;
    if (!expectedWidth || !expectedHeight) {
      return null;
    }

    let bestMatch = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const candidates = scrollContainer.querySelectorAll("div");

    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      const widthScore = Math.abs(rect.width - expectedWidth);
      const heightScore = Math.abs(rect.height - expectedHeight);
      const score = widthScore + heightScore;

      if (score < bestScore) {
        bestMatch = element;
        bestScore = score;
      }
    }

    return bestMatch;
  }

  function convertRotatedPointToPagePoint(point, pageLayout, activeDocument) {
    const page = activeDocument?.document?.pages?.[pageLayout.pageIndex];
    const rotation = ((page?.rotation || 0) + (activeDocument?.rotation || 0)) % 4;
    const pageWidth = pageLayout.width;
    const pageHeight = pageLayout.height;

    switch (rotation) {
      case 1:
        return { x: point.y, y: pageHeight - point.x };
      case 2:
        return { x: pageWidth - point.x, y: pageHeight - point.y };
      case 3:
        return { x: pageWidth - point.y, y: point.x };
      default:
        return point;
    }
  }

  function isEventInsidePdfContainer(event) {
    return event.composedPath?.().some((node) => node?.id === "pdf-container") ||
      !!event.target?.closest?.("#pdf-container");
  }

  function getScrollContainer(event) {
    const pdfContainer = getPdfContainer(event);
    const path = event.composedPath?.() || [];
    for (const node of path) {
      if (node instanceof Element && isScrollableElement(node)) {
        return node;
      }
    }

    let current = event.target instanceof Element ? event.target : event.target?.parentElement;

    while (current && current !== document.body) {
      if (isScrollableElement(current)) {
        return current;
      }

      current = current.parentElement;
    }

    return pdfContainer?.querySelector?.("*") ? findScrollableDescendant(pdfContainer) : null;
  }

  function getPdfContainer(event) {
    const pathMatch = event.composedPath?.().find((node) => node?.id === "pdf-container");
    return pathMatch instanceof Element ? pathMatch : document.getElementById("pdf-container");
  }

  function findScrollableDescendant(root) {
    const descendants = root.querySelectorAll("*");
    for (const element of descendants) {
      if (isScrollableElement(element)) {
        return element;
      }
    }

    return null;
  }

  function isScrollableElement(element) {
    const style = window.getComputedStyle(element);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    const canScrollX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;

    return canScrollY || canScrollX;
  }

  function getActiveDocumentState() {
    const coreState = pdfState.registry?.getStore?.()?.getState?.()?.core;
    return coreState?.documents?.[coreState.activeDocumentId] || null;
  }

  function getUiScope(documentId) {
    try {
      return uiCapability?.forDocument?.(documentId) || null;
    } catch (error) {
      console.error("[Webview] Failed to read UI scope", error);
      return null;
    }
  }

  function showAnnotationToolbarInView(documentId) {
    if (!documentId) {
      uiCapability?.setActiveToolbar?.("top", "secondary", VIEW_ANNOTATION_TOOLBAR);
      return;
    }

    getUiScope(documentId)?.setActiveToolbar?.("top", "secondary", VIEW_ANNOTATION_TOOLBAR);
  }

  function switchToViewMode(documentId) {
    annotationCapability?.forDocument?.(documentId)?.setActiveTool(null);
    interactionCapability?.forDocument?.(documentId)?.activateDefaultMode();
    showAnnotationToolbarInView(documentId);
  }

  function removeRedundantMarkupToolbarItems() {
    const schema = uiCapability?.getSchema?.();
    const toolbar = schema?.toolbars?.[VIEW_ANNOTATION_TOOLBAR];
    if (!toolbar?.items) {
      return;
    }

    uiCapability.mergeSchema({
      toolbars: {
        [VIEW_ANNOTATION_TOOLBAR]: {
          ...toolbar,
          items: filterToolbarItems(toolbar.items),
        },
      },
    });
  }

  function filterToolbarItems(items) {
    return items
      .filter((item) => !HIDDEN_ANNOTATION_TOOLBAR_ITEMS.has(item.id))
      .map((item) => {
        if (item.type !== "group" || !Array.isArray(item.items)) {
          return item;
        }

        return {
          ...item,
          items: filterToolbarItems(item.items),
        };
      });
  }

  function handleInit(container) {
    console.log("[Webview] PDF Viewer Initialized");
    pdfState.container = container;
  }

  function handleReady(registry) {
    clearRegistryDisposables();

    console.log("[Webview] PDF Viewer Ready with Registry");
    pdfState.registry = registry;

    const scrollPlugin = registry.getPlugin("scroll");
    const viewportPlugin = registry.getPlugin("viewport");
    const zoomPlugin = registry.getPlugin("zoom");
    const spreadPlugin = registry.getPlugin("spread");
    const rotatePlugin = registry.getPlugin("rotate");
    const uiPlugin = registry.getPlugin("ui");
    const annotationPlugin = registry.getPlugin("annotation");
    const interactionPlugin = registry.getPlugin("interaction-manager");

    scrollCapability = scrollPlugin?.provides() || null;
    viewportCapability = viewportPlugin?.provides() || null;
    zoomCapability = zoomPlugin?.provides() || null;
    spreadCapability = spreadPlugin?.provides() || null;
    rotateCapability = rotatePlugin?.provides() || null;
    uiCapability = uiPlugin?.provides() || null;
    annotationCapability = annotationPlugin?.provides() || null;
    interactionCapability = interactionPlugin?.provides() || null;

    removeRedundantMarkupToolbarItems();
    bindScrollEvents();
    bindCapabilityEvents();
    bindReverseSyncTeX();
    showAnnotationToolbarInView();

    if (!scrollCapability) {
      queueViewStateSync();
    }
  }

  function destroy() {
    queueViewStateSync({}, { flush: true, force: true });
    clearRegistryDisposables();
  }

  return {
    handleInit,
    handleReady,
    destroy,
  };
}
