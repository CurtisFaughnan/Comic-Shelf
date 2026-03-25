const LIBRARY_PATH = "./comics/library.json";
const DEFAULT_IMAGE_SIZE = { width: 1600, height: 2533 };
const UI_HIDE_DELAY_MS = 1600;
const PANEL_PADDING_PX = 34;
const MAX_GUIDED_ZOOM = 10;
const SWIPE_THRESHOLD = 70;
const DOUBLE_TAP_DELAY_MS = 280;
const DOUBLE_TAP_DISTANCE_PX = 28;
const PANEL_OVERRIDE_PREFIX = "faughnan-panels:";
const MIN_EDITOR_PANEL_SIZE = 0.02;
const EDITOR_RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const GUIDED_TOP_ALIGN_MIN_WIDTH = 760;

const dom = {
  body: document.body,
  siteTitle: document.querySelector("#siteTitle"),
  siteTagline: document.querySelector("#siteTagline"),
  shareHint: document.querySelector("#shareHint"),
  libraryView: document.querySelector("#libraryView"),
  readerView: document.querySelector("#readerView"),
  readerTopbar: document.querySelector("#readerTopbar"),
  pageBrowser: document.querySelector("#pageBrowser"),
  pageBrowserBackdrop: document.querySelector("#pageBrowserBackdrop"),
  pageBrowserCloseBtn: document.querySelector("#pageBrowserCloseBtn"),
  panelEditor: document.querySelector("#panelEditor"),
  panelEditorBackdrop: document.querySelector("#panelEditorBackdrop"),
  panelEditorTitle: document.querySelector("#panelEditorTitle"),
  panelEditorMeta: document.querySelector("#panelEditorMeta"),
  panelEditorPrevBtn: document.querySelector("#panelEditorPrevBtn"),
  panelEditorNextBtn: document.querySelector("#panelEditorNextBtn"),
  panelEditorResetBtn: document.querySelector("#panelEditorResetBtn"),
  panelEditorClearBtn: document.querySelector("#panelEditorClearBtn"),
  panelEditorCopyBtn: document.querySelector("#panelEditorCopyBtn"),
  panelEditorDownloadBtn: document.querySelector("#panelEditorDownloadBtn"),
  panelEditorCloseBtn: document.querySelector("#panelEditorCloseBtn"),
  panelEditorStage: document.querySelector("#panelEditorStage"),
  panelEditorImage: document.querySelector("#panelEditorImage"),
  panelEditorOverlay: document.querySelector("#panelEditorOverlay"),
  panelEditorDraft: document.querySelector("#panelEditorDraft"),
  panelEditorCount: document.querySelector("#panelEditorCount"),
  panelEditorList: document.querySelector("#panelEditorList"),
  bookGrid: document.querySelector("#bookGrid"),
  openFirstBookBtn: document.querySelector("#openFirstBookBtn"),
  backToShelfBtn: document.querySelector("#backToShelfBtn"),
  readerTitle: document.querySelector("#readerTitle"),
  readerByline: document.querySelector("#readerByline"),
  readerPageStatus: document.querySelector("#readerPageStatus"),
  readerPanelStatus: document.querySelector("#readerPanelStatus"),
  guidedModeBtn: document.querySelector("#guidedModeBtn"),
  pageModeBtn: document.querySelector("#pageModeBtn"),
  pageDrawerToggleBtn: document.querySelector("#pageDrawerToggleBtn"),
  fullscreenBtn: document.querySelector("#fullscreenBtn"),
  prevPageBtn: document.querySelector("#prevPageBtn"),
  nextPageBtn: document.querySelector("#nextPageBtn"),
  pageStage: document.querySelector("#pageStage"),
  pageDebugOverlay: document.querySelector("#pageDebugOverlay"),
  pageImage: document.querySelector("#pageImage"),
  guidedWindow: document.querySelector("#guidedWindow"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  pageScrubber: document.querySelector("#pageScrubber"),
  pageBrowserCount: document.querySelector("#pageBrowserCount"),
  thumbnailDrawer: document.querySelector("#thumbnailDrawer"),
  thumbnailRail: document.querySelector("#thumbnailRail")
};

const state = {
  library: null,
  currentBook: null,
  currentManifest: null,
  pages: [],
  currentPage: 1,
  currentPanels: [],
  currentPanelIndex: 0,
  preferredMode: "guided",
  panelCache: new Map(),
  pageRequestId: 0,
  ui: {
    chromeVisible: true,
    drawerOpen: false,
    devMode: false,
    hideTimer: null,
    suppressClickUntil: 0,
    gesture: null,
    centerTap: null
  },
  editor: {
    open: false,
    pageNumber: 1,
    requestId: 0,
    panels: [],
    selectedId: null,
    draft: null,
    pointerId: null,
    interaction: null,
    imgBox: { left: 0, top: 0, width: 1, height: 1 }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initialize().catch((error) => {
    console.error(error);
    dom.bookGrid.innerHTML = `
      <article class="book-card">
        <h3>Library unavailable</h3>
        <p class="book-description">The comic library could not be loaded right now.</p>
      </article>
    `;
  });
});

async function initialize() {
  dom.readerView.dataset.chrome = "visible";
  dom.readerView.dataset.browser = "closed";
  dom.readerView.dataset.dev = "off";
  dom.readerView.dataset.editor = "closed";
  state.library = await fetchJson(LIBRARY_PATH);
  renderLibrary();
  await syncToUrl();
}

function bindEvents() {
  dom.openFirstBookBtn.addEventListener("click", async () => {
    const firstBook = state.library && state.library.books ? state.library.books[0] : null;
    if (!firstBook) {
      return;
    }
    await openBook(firstBook.slug, { page: 1, historyMode: "push" });
  });

  dom.backToShelfBtn.addEventListener("click", () => {
    closeBook({ historyMode: "push" });
  });

  dom.guidedModeBtn.addEventListener("click", () => {
    setPreferredMode("guided");
  });

  dom.pageModeBtn.addEventListener("click", () => {
    setPreferredMode("page");
  });

  dom.pageDrawerToggleBtn.addEventListener("click", () => {
    togglePageDrawer();
  });

  dom.pageBrowserCloseBtn.addEventListener("click", () => {
    togglePageDrawer(false);
  });

  dom.pageBrowserBackdrop.addEventListener("click", () => {
    togglePageDrawer(false);
  });

  dom.panelEditorCloseBtn.addEventListener("click", () => {
    closePanelEditor();
  });

  dom.panelEditorBackdrop.addEventListener("click", () => {
    closePanelEditor();
  });

  dom.panelEditorPrevBtn.addEventListener("click", async () => {
    await loadPanelEditorPage(state.editor.pageNumber - 1);
  });

  dom.panelEditorNextBtn.addEventListener("click", async () => {
    await loadPanelEditorPage(state.editor.pageNumber + 1);
  });

  dom.panelEditorResetBtn.addEventListener("click", async () => {
    await resetPanelEditorPage();
  });

  dom.panelEditorClearBtn.addEventListener("click", () => {
    clearPanelEditorPage();
  });

  dom.panelEditorCopyBtn.addEventListener("click", async () => {
    await copyCurrentEditorJson();
  });

  dom.panelEditorDownloadBtn.addEventListener("click", () => {
    downloadCurrentEditorJson();
  });

  dom.fullscreenBtn.addEventListener("click", async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (dom.readerView.requestFullscreen) {
      await dom.readerView.requestFullscreen();
    }
  });

  dom.prevPageBtn.addEventListener("click", async () => {
    await stepBackward();
  });

  dom.nextPageBtn.addEventListener("click", async () => {
    await stepForward();
  });

  dom.pageScrubber.addEventListener("input", async () => {
    revealChrome();
    await setPage(Number(dom.pageScrubber.value), {
      historyMode: "replace",
      panelStrategy: "reset",
      shouldScrollThumb: false
    });
  });

  document.addEventListener("fullscreenchange", () => {
    dom.fullscreenBtn.textContent = document.fullscreenElement ? "Exit" : "Full";
    revealChrome();
  });

  document.addEventListener("keydown", async (event) => {
    if (dom.readerView.hidden) {
      return;
    }

    if (state.editor.open) {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          closePanelEditor();
          break;
        case "ArrowLeft":
          event.preventDefault();
          await loadPanelEditorPage(state.editor.pageNumber - 1);
          break;
        case "ArrowRight":
          event.preventDefault();
          await loadPanelEditorPage(state.editor.pageNumber + 1);
          break;
        case "Delete":
        case "Backspace":
          if (state.editor.selectedId) {
            event.preventDefault();
            removeEditorPanel(state.editor.selectedId);
          }
          break;
        default:
          break;
      }
      return;
    }

    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        event.preventDefault();
        await stepForward();
        break;
      case "ArrowLeft":
      case "PageUp":
        event.preventDefault();
        await stepBackward();
        break;
      case "Home":
        event.preventDefault();
        await setPage(1, { historyMode: "replace", panelStrategy: "reset" });
        break;
      case "End":
        event.preventDefault();
        await setPage(state.pages.length, { historyMode: "replace", panelStrategy: "last" });
        break;
      case "Escape":
        event.preventDefault();
        if (state.ui.drawerOpen) {
          togglePageDrawer(false);
        } else {
          closeBook({ historyMode: "push" });
        }
        break;
      case "f":
      case "F":
        event.preventDefault();
        dom.fullscreenBtn.click();
        break;
      case "m":
      case "M":
        event.preventDefault();
        togglePreferredMode();
        break;
      default:
        break;
    }
  });

  dom.pageImage.addEventListener("load", () => {
    dom.loadingOverlay.hidden = true;
    applyViewTransform();
    scheduleChromeHide();
    preloadNearbyPages();
    preloadNearbyPanels();
  });

  dom.panelEditorImage.addEventListener("load", () => {
    if (!state.editor.open) {
      return;
    }
    renderPanelEditor();
  });

  dom.pageStage.addEventListener("click", (event) => {
    if (performance.now() < state.ui.suppressClickUntil) {
      return;
    }
    if (isInteractiveTarget(event.target)) {
      return;
    }
    if (state.ui.drawerOpen) {
      togglePageDrawer(false);
      return;
    }

    if (getStageZoneFromClientX(event.clientX) !== "center") {
      return;
    }

    handleCenterStageTap(event);
  });

  dom.pageStage.addEventListener("pointerdown", (event) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    state.ui.gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };

    if (dom.pageStage.setPointerCapture) {
      dom.pageStage.setPointerCapture(event.pointerId);
    }
  });

  dom.pageStage.addEventListener("pointermove", (event) => {
    if (!state.ui.gesture || state.ui.gesture.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - state.ui.gesture.startX;
    const dy = event.clientY - state.ui.gesture.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      state.ui.gesture.moved = true;
    }
  });

  const finishGesture = async (event) => {
    if (!state.ui.gesture || state.ui.gesture.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - state.ui.gesture.startX;
    const dy = event.clientY - state.ui.gesture.startY;
    const moved = state.ui.gesture.moved;

    if (dom.pageStage.releasePointerCapture) {
      try {
        dom.pageStage.releasePointerCapture(event.pointerId);
      } catch (error) {
        console.debug("Pointer release skipped.", error);
      }
    }

    state.ui.gesture = null;

    if (moved && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
      state.ui.suppressClickUntil = performance.now() + 350;
      if (dx < 0) {
        await stepForward();
      } else {
        await stepBackward();
      }
    }
  };

  dom.pageStage.addEventListener("pointerup", (event) => {
    void finishGesture(event);
  });

  dom.pageStage.addEventListener("pointercancel", (event) => {
    void finishGesture(event);
  });

  dom.pageDebugOverlay.addEventListener("click", async (event) => {
    const box = event.target.closest(".page-debug-box");
    if (!box || !state.ui.devMode || dom.readerView.hidden) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const selectedIndex = Number(box.dataset.panelIndex);
    if (!Number.isFinite(selectedIndex)) {
      return;
    }

    await openPanelEditor(state.currentPage, { selectedIndex });
  });

  window.addEventListener("resize", () => {
    applyViewTransform();
    if (state.editor.open) {
      renderPanelEditor();
    }
  });

  window.addEventListener("popstate", () => {
    syncToUrl().catch((error) => {
      console.error(error);
    });
  });

  dom.panelEditorStage.addEventListener("pointerdown", (event) => {
    handlePanelEditorPointerDown(event);
  });

  dom.panelEditorStage.addEventListener("pointermove", (event) => {
    handlePanelEditorPointerMove(event);
  });

  dom.panelEditorStage.addEventListener("pointerup", (event) => {
    handlePanelEditorPointerUp(event);
  });

  dom.panelEditorStage.addEventListener("pointercancel", (event) => {
    cancelPanelEditorPointer(event);
  });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }
  return response.json();
}

function renderLibrary() {
  dom.siteTitle.textContent = state.library.siteTitle || "Comic Library";
  dom.siteTagline.textContent = state.library.siteTagline || "Tap a book cover to start reading.";
  dom.shareHint.textContent = state.library.shareHint || "Share this page as a link or QR code.";

  dom.bookGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const book of state.library.books || []) {
    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <div class="book-cover">
        <img src="${book.shelfCover}" alt="${book.title} cover" loading="lazy" />
      </div>
      <div>
        <h3>${book.title}</h3>
        <p class="book-byline">${book.byline}</p>
      </div>
      <p class="book-description">${book.description || ""}</p>
      <div class="book-footer">
        <span class="book-pill">${book.badge || "Digital edition"}</span>
        <button class="book-open" type="button">Read now</button>
      </div>
    `;

    card.querySelector(".book-open").addEventListener("click", async () => {
      await openBook(book.slug, { page: 1, historyMode: "push" });
    });

    card.querySelector(".book-cover").addEventListener("click", async () => {
      await openBook(book.slug, { page: 1, historyMode: "push" });
    });

    fragment.appendChild(card);
  }

  dom.bookGrid.appendChild(fragment);
}

async function syncToUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("book");
  const page = Number(params.get("page") || 1);
  const panel = Number(params.get("panel") || 1);
  const mode = params.get("mode");

  setDevMode(false, { syncHistory: false });

  if (!slug) {
    showLibrary();
    updateHistory("replace");
    return;
  }

  const book = (state.library.books || []).find((item) => item.slug === slug);
  if (!book) {
    showLibrary();
    updateHistory("replace");
    return;
  }

  await openBook(slug, {
    page,
    panel: Number.isFinite(panel) ? panel - 1 : 0,
    mode: mode === "page" ? "page" : "guided",
    dev: false,
    historyMode: "none"
  });
  updateHistory("replace");
}

async function openBook(slug, { page = 1, panel = 0, mode = null, dev = null, historyMode = "replace" } = {}) {
  const book = (state.library.books || []).find((item) => item.slug === slug);
  if (!book) {
    return;
  }

  if (!state.currentBook || state.currentBook.slug !== slug) {
    state.currentBook = book;
    state.currentManifest = await fetchJson(book.manifest);
    state.pages = buildPages(state.currentManifest);
    state.panelCache.clear();
    renderReaderShell();
    renderThumbnails();
  }

  state.preferredMode = mode || state.currentManifest.defaultMode || "guided";
  if (typeof dev === "boolean") {
    setDevMode(dev, { syncHistory: false });
  } else {
    updateDevModeButton();
  }
  showReader();
  await setPage(page, {
    historyMode,
    panelStrategy: "specific",
    panelIndex: panel,
    shouldScrollThumb: false
  });
}

function closeBook({ historyMode = "replace" } = {}) {
  closePanelEditor({ restoreFocus: false });
  state.currentBook = null;
  state.currentManifest = null;
  state.pages = [];
  state.currentPanels = [];
  state.currentPanelIndex = 0;
  togglePageDrawer(false);
  setChromeVisible(true);
  clearUiTimers();
  showLibrary();
  updateHistory(historyMode);
}

function showLibrary() {
  dom.body.classList.remove("reader-mode");
  dom.readerView.hidden = true;
  dom.libraryView.hidden = false;
}

function showReader() {
  dom.body.classList.add("reader-mode");
  dom.libraryView.hidden = true;
  dom.readerView.hidden = false;
  dom.pageStage.focus();
  togglePageDrawer(false);
  closePanelEditor({ restoreFocus: false });
  clearPendingCenterTap();
  clearTimeout(state.ui.hideTimer);
  if (state.ui.devMode) {
    revealChrome({ immediate: true });
    return;
  }
  setChromeVisible(false);
}

function renderReaderShell() {
  const manifest = state.currentManifest;
  const writerText = (manifest.writers || []).join(", ");
  const artistText = (manifest.artists || []).join(", ");

  dom.readerTitle.textContent = manifest.title || state.currentBook.title;
  dom.readerByline.textContent = [writerText ? `Written by ${writerText}` : "", artistText ? `Art by ${artistText}` : ""]
    .filter(Boolean)
    .join(" | ");

  dom.pageScrubber.max = String(state.pages.length);
  dom.readerPageStatus.textContent = `Page 1 / ${state.pages.length}`;
  dom.readerPanelStatus.textContent = "Guided view";
  dom.pageBrowserCount.textContent = `Page 1 / ${state.pages.length}`;
  updateDevModeButton();
}

function setDevMode(enabled, { syncHistory = true } = {}) {
  state.ui.devMode = Boolean(enabled);
  dom.readerView.dataset.dev = state.ui.devMode ? "on" : "off";
  updateDevModeButton();
  renderPageDebugOverlay();
  applyViewTransform();

  if (!dom.readerView.hidden && !state.editor.open) {
    if (state.ui.devMode || state.ui.drawerOpen) {
      revealChrome({ immediate: true });
    } else {
      clearPendingCenterTap();
      setChromeVisible(false);
    }
  }

  if (syncHistory) {
    updateHistory("replace");
  }
}

function toggleDevMode() {
  setDevMode(!state.ui.devMode);
}

function updateDevModeButton() {
  if (!dom.devModeBtn) {
    return;
  }
  dom.devModeBtn.setAttribute("aria-pressed", String(state.ui.devMode));
  dom.devModeBtn.classList.toggle("is-active", state.ui.devMode);
}

function buildPages(manifest) {
  return Array.from({ length: manifest.pageCount || 0 }, (_, index) => {
    const pageNumber = index + 1;
    const padded = String(pageNumber).padStart(2, "0");
    const panelId = manifest.panelIds && manifest.panelIds[padded]
      ? String(manifest.panelIds[padded])
      : String(pageNumber);

    return {
      number: pageNumber,
      padded,
      panelId,
      image: resolvePattern(manifest.pageImagePattern, { page: padded, panelId }),
      thumbnail: resolvePattern(manifest.thumbnailPattern, { page: padded, panelId }),
      panelPath: manifest.panelPattern ? resolvePattern(manifest.panelPattern, { page: padded, panelId }) : "",
      panels: manifest.panels && manifest.panels[padded] ? normalizePanels(manifest.panels[padded]) : null
    };
  });
}

function resolvePattern(pattern, values) {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

function renderThumbnails() {
  dom.thumbnailRail.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const page of state.pages) {
    const button = document.createElement("button");
    button.className = "thumbnail-button";
    button.type = "button";
    button.dataset.page = String(page.number);
    button.innerHTML = `
      <img src="${page.thumbnail}" alt="Thumbnail for page ${page.number}" loading="lazy" />
      <span>${page.number}</span>
    `;
    button.addEventListener("click", async () => {
      togglePageDrawer(false);
      await setPage(page.number, { historyMode: "replace", panelStrategy: "reset" });
    });
    fragment.appendChild(button);
  }

  dom.thumbnailRail.appendChild(fragment);
}

async function setPage(
  pageNumber,
  {
    historyMode = "replace",
    panelStrategy = "reset",
    panelIndex = 0,
    shouldScrollThumb = true
  } = {}
) {
  if (!state.pages.length) {
    return;
  }

  const totalPages = state.pages.length;
  const nextPage = clamp(Math.round(pageNumber), 1, totalPages);
  const page = state.pages[nextPage - 1];
  const requestId = ++state.pageRequestId;
  const panels = await loadPanelsForPage(page);
  if (requestId !== state.pageRequestId) {
    return;
  }

  state.currentPage = nextPage;
  state.currentPanels = panels;
  state.currentPanelIndex = resolvePanelIndex(panelStrategy, panels, panelIndex);
  renderPageDebugOverlay();

  dom.pageScrubber.value = String(nextPage);
  dom.pageImage.alt = `${state.currentManifest.title} page ${nextPage}`;

  if (dom.pageImage.dataset.page !== String(nextPage) || dom.pageImage.src !== new URL(page.image, window.location.href).href) {
    dom.loadingOverlay.hidden = false;
    updateGuidedWindow(null);
    dom.pageImage.dataset.page = String(nextPage);
    dom.pageImage.src = page.image;
  } else {
    dom.loadingOverlay.hidden = true;
    applyViewTransform();
  }

  updateViewModeButtons();
  updateReaderStatus();
  updateNav();
  updateHistory(historyMode);
  markActiveThumbnail(shouldScrollThumb);
  scheduleChromeHide();
}

function resolvePanelIndex(strategy, panels, requestedIndex = 0) {
  if (!panels.length) {
    return 0;
  }

  if (strategy === "last") {
    return panels.length - 1;
  }

  if (strategy === "specific") {
    return clamp(requestedIndex, 0, panels.length - 1);
  }

  return 0;
}

async function stepForward() {
  if (getEffectiveMode() === "guided" && state.currentPanels.length) {
    if (state.currentPanelIndex < state.currentPanels.length - 1) {
      state.currentPanelIndex += 1;
      renderPageDebugOverlay();
      applyViewTransform();
      updateReaderStatus();
      updateNav();
      updateHistory("replace");
      scheduleChromeHide();
      return;
    }
  }

  if (state.currentPage < state.pages.length) {
    await setPage(state.currentPage + 1, { historyMode: "replace", panelStrategy: "reset" });
  }
}

async function stepBackward() {
  if (getEffectiveMode() === "guided" && state.currentPanels.length) {
    if (state.currentPanelIndex > 0) {
      state.currentPanelIndex -= 1;
      renderPageDebugOverlay();
      applyViewTransform();
      updateReaderStatus();
      updateNav();
      updateHistory("replace");
      scheduleChromeHide();
      return;
    }
  }

  if (state.currentPage > 1) {
    await setPage(state.currentPage - 1, { historyMode: "replace", panelStrategy: "last" });
  }
}

function updateNav() {
  const guided = getEffectiveMode() === "guided" && state.currentPanels.length;
  const atStart = guided
    ? state.currentPage === 1 && state.currentPanelIndex === 0
    : state.currentPage === 1;
  const atEnd = guided
    ? state.currentPage === state.pages.length && state.currentPanelIndex === state.currentPanels.length - 1
    : state.currentPage === state.pages.length;

  dom.prevPageBtn.disabled = atStart;
  dom.nextPageBtn.disabled = atEnd;
}

function updateReaderStatus() {
  const totalPages = state.pages.length || 1;
  const pageText = `Page ${state.currentPage} / ${totalPages}`;
  const guided = getEffectiveMode() === "guided" && state.currentPanels.length;

  if (guided) {
    dom.readerPageStatus.textContent = pageText;
    dom.readerPanelStatus.textContent = `Panel ${state.currentPanelIndex + 1} / ${state.currentPanels.length}`;
    dom.pageBrowserCount.textContent = pageText;
    return;
  }

  dom.readerPageStatus.textContent = pageText;
  dom.readerPanelStatus.textContent = state.currentPanels.length ? "Full page" : "Page only";
  dom.pageBrowserCount.textContent = pageText;
}

function updateViewModeButtons() {
  const guidedAvailable = state.currentPanels.length > 0;
  const effectiveMode = getEffectiveMode();
  const guidedActive = guidedAvailable && effectiveMode === "guided";
  const pageActive = effectiveMode === "page";

  dom.guidedModeBtn.disabled = !guidedAvailable;
  dom.guidedModeBtn.setAttribute("aria-pressed", String(guidedActive));
  dom.guidedModeBtn.classList.toggle("is-active", guidedActive);
  dom.guidedModeBtn.setAttribute("aria-label", guidedAvailable ? "Switch to guided view" : "Guided view unavailable on this page");
  dom.guidedModeBtn.title = guidedAvailable ? "Switch to guided view" : "Guided view unavailable on this page";

  dom.pageModeBtn.disabled = false;
  dom.pageModeBtn.setAttribute("aria-pressed", String(pageActive));
  dom.pageModeBtn.classList.toggle("is-active", pageActive);
  dom.pageModeBtn.setAttribute("aria-label", "Switch to full page view");
  dom.pageModeBtn.title = "Switch to full page view";
}

function togglePreferredMode({ reveal = true } = {}) {
  const nextMode = getEffectiveMode() === "guided" ? "page" : "guided";
  setPreferredMode(nextMode, { reveal });
}

function setPreferredMode(nextMode, { reveal = true } = {}) {
  if (nextMode === "guided" && !state.currentPanels.length) {
    return;
  }

  state.preferredMode = nextMode === "page" ? "page" : "guided";
  updateViewModeButtons();
  updateReaderStatus();
  applyViewTransform();
  updateNav();
  updateHistory("replace");
  if (reveal) {
    revealChrome({ immediate: true });
  } else {
    scheduleChromeHide(900);
  }
}

function getEffectiveMode() {
  if (state.preferredMode === "guided" && state.currentPanels.length) {
    return "guided";
  }
  return "page";
}

function applyViewTransform() {
  const stageWidth = dom.pageStage.clientWidth;
  const stageHeight = dom.pageStage.clientHeight;
  const imageWidth = dom.pageImage.naturalWidth || DEFAULT_IMAGE_SIZE.width;
  const imageHeight = dom.pageImage.naturalHeight || DEFAULT_IMAGE_SIZE.height;

  if (!stageWidth || !stageHeight) {
    updateGuidedWindow(null);
    return;
  }

  let scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
  let tx = (stageWidth - imageWidth * scale) / 2;
  let ty = (stageHeight - imageHeight * scale) / 2;
  let guidedWindowRect = null;
  const transform = () => `translate(${tx}px, ${ty}px) scale(${scale})`;

  if (getEffectiveMode() === "guided" && state.currentPanels.length) {
    const panel = state.currentPanels[state.currentPanelIndex] || null;
    if (panel) {
      const x1 = Math.max(0, panel.x * imageWidth - PANEL_PADDING_PX);
      const y1 = Math.max(0, panel.y * imageHeight - PANEL_PADDING_PX);
      const x2 = Math.min(imageWidth, (panel.x + panel.w) * imageWidth + PANEL_PADDING_PX);
      const y2 = Math.min(imageHeight, (panel.y + panel.h) * imageHeight + PANEL_PADDING_PX);
      const windowWidth = Math.max(1, x2 - x1);
      const windowHeight = Math.max(1, y2 - y1);

      scale = Math.min(stageWidth / windowWidth, stageHeight / windowHeight);
      scale = Math.min(scale, MAX_GUIDED_ZOOM);

      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      tx = stageWidth / 2 - centerX * scale;
      ty = stageHeight / 2 - centerY * scale;

      const topInset = state.ui.chromeVisible ? 88 : 0;
      const bottomInset = state.ui.chromeVisible ? 28 : 18;
      const shouldTopAlignGuided = stageWidth >= GUIDED_TOP_ALIGN_MIN_WIDTH;
      if (shouldTopAlignGuided && windowHeight * scale < stageHeight - topInset - bottomInset) {
        const topAlignedTy = topInset - y1 * scale;
        ty = Math.min(ty, topAlignedTy);
      }

      guidedWindowRect = projectGuidedWindow({
        stageWidth,
        stageHeight,
        tx,
        ty,
        scale,
        x1,
        y1,
        x2,
        y2
      });
    }
  }

  const nextTransform = transform();
  dom.pageImage.style.transform = nextTransform;
  dom.pageDebugOverlay.style.width = `${imageWidth}px`;
  dom.pageDebugOverlay.style.height = `${imageHeight}px`;
  dom.pageDebugOverlay.style.transform = nextTransform;
  updateGuidedWindow(guidedWindowRect);
}

function renderPageDebugOverlay() {
  dom.pageDebugOverlay.innerHTML = "";

  if (!state.currentPanels.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const [index, panel] of state.currentPanels.entries()) {
    const box = document.createElement("div");
    box.className = "page-debug-box";
    box.dataset.panelIndex = String(index);
    if (index === state.currentPanelIndex) {
      box.classList.add("is-active");
    }
    box.style.left = `${panel.x * 100}%`;
    box.style.top = `${panel.y * 100}%`;
    box.style.width = `${panel.w * 100}%`;
    box.style.height = `${panel.h * 100}%`;

    const label = document.createElement("span");
    label.className = "page-debug-box-label";
    label.textContent = String(index + 1);
    box.appendChild(label);

    fragment.appendChild(box);
  }

  dom.pageDebugOverlay.appendChild(fragment);
}

function projectGuidedWindow({ stageWidth, stageHeight, tx, ty, scale, x1, y1, x2, y2 }) {
  const left = clamp(tx + x1 * scale, 0, stageWidth);
  const top = clamp(ty + y1 * scale, 0, stageHeight);
  const right = clamp(tx + x2 * scale, 0, stageWidth);
  const bottom = clamp(ty + y2 * scale, 0, stageHeight);

  if (right - left < 8 || bottom - top < 8) {
    return null;
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
}

function updateGuidedWindow(rect) {
  if (!rect) {
    dom.guidedWindow.classList.remove("is-visible");
    return;
  }

  dom.guidedWindow.style.left = `${rect.left}px`;
  dom.guidedWindow.style.top = `${rect.top}px`;
  dom.guidedWindow.style.width = `${rect.width}px`;
  dom.guidedWindow.style.height = `${rect.height}px`;
  dom.guidedWindow.classList.add("is-visible");
}

async function loadPanelsForPage(page) {
  const stored = readStoredPanels(page);
  if (stored.found) {
    state.panelCache.set(page.number, stored.panels);
    return stored.panels;
  }

  if (state.panelCache.has(page.number)) {
    return state.panelCache.get(page.number);
  }

  if (page.panels) {
    state.panelCache.set(page.number, page.panels);
    return page.panels;
  }

  if (!page.panelPath) {
    state.panelCache.set(page.number, []);
    return [];
  }

  try {
    const response = await fetch(page.panelPath, { cache: "no-store" });
    if (!response.ok) {
      state.panelCache.set(page.number, []);
      return [];
    }
    const data = await response.json();
    const panels = normalizePanels(Array.isArray(data) ? data : []);
    state.panelCache.set(page.number, panels);
    return panels;
  } catch (error) {
    console.debug("Panel load failed.", error);
    state.panelCache.set(page.number, []);
    return [];
  }
}

function normalizePanels(panels) {
  const normalized = panels
    .filter((panel) => panel && Number.isFinite(panel.x) && Number.isFinite(panel.y) && Number.isFinite(panel.w) && Number.isFinite(panel.h))
    .map((panel) => ({
      id: panel.id || crypto.randomUUID(),
      x: clamp(Number(panel.x), 0, 1),
      y: clamp(Number(panel.y), 0, 1),
      w: clamp(Number(panel.w), 0.01, 1),
      h: clamp(Number(panel.h), 0.01, 1)
    }));

  if (normalized.length > 1 && isFullPagePanel(normalized[0])) {
    return normalized.slice(1);
  }

  return normalized;
}

function isFullPagePanel(panel) {
  return panel.x <= 0.03 && panel.y <= 0.03 && panel.w >= 0.94 && panel.h >= 0.94;
}

function markActiveThumbnail(shouldScrollThumb) {
  for (const button of dom.thumbnailRail.querySelectorAll(".thumbnail-button")) {
    const page = Number(button.dataset.page);
    button.classList.toggle("is-active", page === state.currentPage);
    if (page === state.currentPage && shouldScrollThumb) {
      button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }
}

function updateHistory(mode) {
  if (mode === "none") {
    return;
  }

  const url = new URL(window.location.href);

  if (state.currentBook) {
    url.searchParams.set("book", state.currentBook.slug);
    url.searchParams.set("page", String(state.currentPage));
    url.searchParams.set("mode", getEffectiveMode());

    if (getEffectiveMode() === "guided" && state.currentPanels.length) {
      url.searchParams.set("panel", String(state.currentPanelIndex + 1));
    } else {
      url.searchParams.delete("panel");
    }
  } else {
    url.searchParams.delete("book");
    url.searchParams.delete("page");
    url.searchParams.delete("panel");
    url.searchParams.delete("mode");
  }

  url.searchParams.delete("dev");

  if (mode === "push") {
    history.pushState({}, "", url);
  } else {
    history.replaceState({}, "", url);
  }
}

function clearUiTimers() {
  clearTimeout(state.ui.hideTimer);
  state.ui.suppressClickUntil = 0;
  state.ui.gesture = null;
  clearPendingCenterTap();
}

function setChromeVisible(visible) {
  state.ui.chromeVisible = visible;
  dom.readerView.dataset.chrome = visible ? "visible" : "hidden";
  if (!visible) {
    clearTimeout(state.ui.hideTimer);
  }
}

function revealChrome({ immediate = false } = {}) {
  if (dom.readerView.hidden) {
    return;
  }
  setChromeVisible(true);
  scheduleChromeHide(immediate ? 2600 : UI_HIDE_DELAY_MS);
}

function toggleChrome() {
  if (state.ui.chromeVisible) {
    setChromeVisible(false);
    return;
  }
  revealChrome({ immediate: true });
}

function scheduleChromeHide(delay = UI_HIDE_DELAY_MS) {
  clearTimeout(state.ui.hideTimer);
  if (dom.readerView.hidden || state.ui.drawerOpen) {
    return;
  }
  state.ui.hideTimer = window.setTimeout(() => {
    setChromeVisible(false);
  }, delay);
}

function togglePageDrawer(force) {
  const nextState = typeof force === "boolean" ? force : !state.ui.drawerOpen;
  state.ui.drawerOpen = nextState;
  dom.readerView.dataset.browser = nextState ? "open" : "closed";
  clearPendingCenterTap();
  dom.pageBrowser.hidden = !nextState;
  dom.pageBrowser.setAttribute("aria-hidden", String(!nextState));
  dom.thumbnailDrawer.setAttribute("aria-hidden", String(!nextState));
  dom.pageDrawerToggleBtn.setAttribute("aria-expanded", String(nextState));
  dom.pageDrawerToggleBtn.classList.toggle("is-active", nextState);
  if (nextState) {
    setChromeVisible(true);
    clearTimeout(state.ui.hideTimer);
    dom.pageBrowserCloseBtn.focus({ preventScroll: true });
    return;
  }
  scheduleChromeHide(900);
}

function isInteractiveTarget(target) {
  return Boolean(target.closest("button, input, .page-debug-box"));
}

function preloadNearbyPages() {
  const candidates = [state.currentPage - 1, state.currentPage + 1];
  for (const pageNumber of candidates) {
    if (pageNumber < 1 || pageNumber > state.pages.length) {
      continue;
    }
    const image = new Image();
    image.src = state.pages[pageNumber - 1].image;
  }
}

function preloadNearbyPanels() {
  const candidates = [state.currentPage - 1, state.currentPage + 1];
  for (const pageNumber of candidates) {
    if (pageNumber < 1 || pageNumber > state.pages.length) {
      continue;
    }
    const page = state.pages[pageNumber - 1];
    if (state.panelCache.has(page.number) || !page.panelPath) {
      continue;
    }
    void loadPanelsForPage(page);
  }
}

function clonePanels(panels) {
  return (panels || []).map((panel) => ({
    id: panel.id || createPanelId(),
    x: Number(panel.x),
    y: Number(panel.y),
    w: Number(panel.w),
    h: Number(panel.h)
  }));
}

function serializePanels(panels) {
  return (panels || []).map((panel) => ({
    x: roundPanelValue(panel.x),
    y: roundPanelValue(panel.y),
    w: roundPanelValue(panel.w),
    h: roundPanelValue(panel.h)
  }));
}

function roundPanelValue(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function getPageByNumber(pageNumber) {
  if (!state.pages.length) {
    return null;
  }
  const normalizedPage = clamp(Math.round(pageNumber), 1, state.pages.length);
  return state.pages[normalizedPage - 1] || null;
}

function getPanelStorageKey(page) {
  const slug = state.currentBook ? state.currentBook.slug : "comic";
  return `${PANEL_OVERRIDE_PREFIX}${slug}:${page.panelId || page.number}`;
}

function readStoredPanels(page) {
  if (!page) {
    return { found: false, panels: [] };
  }

  try {
    const raw = window.localStorage.getItem(getPanelStorageKey(page));
    if (raw === null) {
      return { found: false, panels: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      found: true,
      panels: normalizePanels(Array.isArray(parsed) ? parsed : [])
    };
  } catch (error) {
    console.debug("Stored panel override could not be read.", error);
    return { found: false, panels: [] };
  }
}

function writeStoredPanels(page, panels) {
  if (!page) {
    return [];
  }

  const normalized = normalizePanels(clonePanels(panels));

  try {
    window.localStorage.setItem(
      getPanelStorageKey(page),
      JSON.stringify(serializePanels(normalized), null, 2)
    );
  } catch (error) {
    console.debug("Stored panel override could not be saved.", error);
  }

  state.panelCache.set(page.number, normalized);
  return normalized;
}

function clearStoredPanels(page) {
  if (!page) {
    return;
  }

  try {
    window.localStorage.removeItem(getPanelStorageKey(page));
  } catch (error) {
    console.debug("Stored panel override could not be removed.", error);
  }

  state.panelCache.delete(page.number);
}

async function openPanelEditor(pageNumber = state.currentPage, { selectedIndex = null } = {}) {
  if (!state.currentBook || !state.pages.length) {
    return;
  }

  togglePageDrawer(false);
  clearPendingCenterTap();
  clearTimeout(state.ui.hideTimer);
  setChromeVisible(true);

  state.editor.open = true;
  dom.readerView.dataset.editor = "open";
  dom.panelEditor.hidden = false;
  dom.panelEditor.setAttribute("aria-hidden", "false");

  await loadPanelEditorPage(pageNumber, { selectedIndex });
  dom.panelEditorCloseBtn.focus({ preventScroll: true });
}

function closePanelEditor({ restoreFocus = true } = {}) {
  state.editor.open = false;
  state.editor.pointerId = null;
  state.editor.draft = null;
  state.editor.interaction = null;
  state.editor.requestId += 1;
  dom.readerView.dataset.editor = "closed";
  dom.panelEditor.hidden = true;
  dom.panelEditor.setAttribute("aria-hidden", "true");
  dom.panelEditorDraft.hidden = true;

  if (restoreFocus && !dom.readerView.hidden) {
    dom.pageStage.focus({ preventScroll: true });
    scheduleChromeHide(900);
  }
}

async function loadPanelEditorPage(pageNumber, { selectedIndex = null } = {}) {
  if (!state.editor.open) {
    return;
  }

  const page = getPageByNumber(pageNumber);
  if (!page) {
    return;
  }

  const requestId = ++state.editor.requestId;
  const panels = await loadPanelsForPage(page);
  if (!state.editor.open || requestId !== state.editor.requestId) {
    return;
  }

  state.editor.pageNumber = page.number;
  state.editor.pointerId = null;
  state.editor.draft = null;
  state.editor.interaction = null;
  state.editor.imgBox = { left: 0, top: 0, width: 1, height: 1 };
  state.editor.panels = clonePanels(panels);
  state.editor.selectedId = resolveEditorSelectedId(state.editor.panels, selectedIndex);

  dom.panelEditorImage.alt = `${state.currentManifest.title} page ${page.number}`;
  dom.panelEditorImage.dataset.page = String(page.number);
  dom.panelEditorImage.src = page.image;

  renderPanelEditor();
}

function renderPanelEditor() {
  if (!state.editor.open) {
    return;
  }

  const page = getPageByNumber(state.editor.pageNumber);
  if (!page) {
    return;
  }

  const override = readStoredPanels(page);
  const publishedExists = Boolean(page.panels || page.panelPath);
  const sourceText = override.found
    ? "Local browser override is active for this page."
    : publishedExists
      ? "Using the published guided-view frames for this page."
      : "This page has no published guided-view frames yet.";

  dom.panelEditorTitle.textContent = `Edit page ${page.number}`;
  dom.panelEditorMeta.textContent = `${sourceText} Changes save in this browser until you export the JSON.`;
  dom.panelEditorPrevBtn.disabled = page.number <= 1;
  dom.panelEditorNextBtn.disabled = page.number >= state.pages.length;
  dom.panelEditorCount.textContent = `${state.editor.panels.length} ${state.editor.panels.length === 1 ? "panel" : "panels"}`;

  updatePanelEditorImageBox();
  renderPanelEditorOverlay();
  renderPanelEditorList();
  updatePanelEditorDraft();
}

function updatePanelEditorImageBox() {
  const stageWidth = dom.panelEditorStage.clientWidth;
  const stageHeight = dom.panelEditorStage.clientHeight;
  const imageWidth = dom.panelEditorImage.naturalWidth || DEFAULT_IMAGE_SIZE.width;
  const imageHeight = dom.panelEditorImage.naturalHeight || DEFAULT_IMAGE_SIZE.height;

  if (!stageWidth || !stageHeight) {
    return;
  }

  const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const left = (stageWidth - width) / 2;
  const top = (stageHeight - height) / 2;

  state.editor.imgBox = { left, top, width, height };

  dom.panelEditorImage.style.left = `${left}px`;
  dom.panelEditorImage.style.top = `${top}px`;
  dom.panelEditorImage.style.width = `${width}px`;
  dom.panelEditorImage.style.height = `${height}px`;

  dom.panelEditorOverlay.style.left = `${left}px`;
  dom.panelEditorOverlay.style.top = `${top}px`;
  dom.panelEditorOverlay.style.width = `${width}px`;
  dom.panelEditorOverlay.style.height = `${height}px`;
}

function renderPanelEditorOverlay() {
  dom.panelEditorOverlay.innerHTML = "";

  const fragment = document.createDocumentFragment();
  for (const [index, panel] of state.editor.panels.entries()) {
    const box = document.createElement("div");
    box.className = "panel-editor-box";
    const isSelected = panel.id === state.editor.selectedId;
    if (isSelected) {
      box.classList.add("is-selected");
    }
    box.dataset.panelId = panel.id;
    box.style.left = `${panel.x * 100}%`;
    box.style.top = `${panel.y * 100}%`;
    box.style.width = `${panel.w * 100}%`;
    box.style.height = `${panel.h * 100}%`;

    const label = document.createElement("span");
    label.className = "panel-editor-box-label panel-editor-move-handle";
    label.dataset.panelId = panel.id;
    label.textContent = String(index + 1);
    label.title = "Drag to move this frame";
    box.appendChild(label);

    if (isSelected) {
      for (const handleName of EDITOR_RESIZE_HANDLES) {
        const handle = document.createElement("span");
        handle.className = `panel-editor-handle panel-editor-handle-${handleName}`;
        handle.dataset.panelId = panel.id;
        handle.dataset.handle = handleName;
        handle.setAttribute("aria-hidden", "true");
        box.appendChild(handle);
      }
    }

    fragment.appendChild(box);
  }

  dom.panelEditorOverlay.appendChild(fragment);
}

function renderPanelEditorList() {
  dom.panelEditorList.innerHTML = "";

  if (!state.editor.panels.length) {
    const empty = document.createElement("p");
    empty.className = "panel-editor-empty";
    empty.textContent = "No frames yet. Drag across the comic page to draw the first guided-view frame.";
    dom.panelEditorList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const [index, panel] of state.editor.panels.entries()) {
    const item = document.createElement("article");
    item.className = "panel-editor-item";
    if (panel.id === state.editor.selectedId) {
      item.classList.add("is-selected");
    }

    item.addEventListener("click", () => {
      state.editor.selectedId = panel.id;
      renderPanelEditorOverlay();
      renderPanelEditorList();
    });

    const head = document.createElement("div");
    head.className = "panel-editor-item-head";
    head.innerHTML = `
      <span class="panel-editor-item-title">Panel ${index + 1}</span>
      <span class="panel-editor-item-meta">${Math.round(panel.w * 100)}% x ${Math.round(panel.h * 100)}%</span>
    `;
    item.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "panel-editor-item-meta";
    meta.textContent = `x ${Math.round(panel.x * 100)}%, y ${Math.round(panel.y * 100)}%, w ${Math.round(panel.w * 100)}%, h ${Math.round(panel.h * 100)}%`;
    item.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "panel-editor-item-actions";

    const upButton = document.createElement("button");
    upButton.className = "reader-tool-button";
    upButton.type = "button";
    upButton.textContent = "Up";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveEditorPanel(panel.id, -1);
    });

    const downButton = document.createElement("button");
    downButton.className = "reader-tool-button";
    downButton.type = "button";
    downButton.textContent = "Down";
    downButton.disabled = index === state.editor.panels.length - 1;
    downButton.addEventListener("click", (event) => {
      event.stopPropagation();
      moveEditorPanel(panel.id, 1);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "reader-nav-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      removeEditorPanel(panel.id);
    });

    actions.append(upButton, downButton, deleteButton);
    item.appendChild(actions);
    fragment.appendChild(item);
  }

  dom.panelEditorList.appendChild(fragment);
}

function updatePanelEditorDraft() {
  const draft = state.editor.draft;
  if (!draft) {
    dom.panelEditorDraft.hidden = true;
    return;
  }

  const rect = normalizeDraftRect(draft);
  if (!rect) {
    dom.panelEditorDraft.hidden = true;
    return;
  }

  const { left, top, width, height } = state.editor.imgBox;
  dom.panelEditorDraft.hidden = false;
  dom.panelEditorDraft.style.left = `${left + rect.x * width}px`;
  dom.panelEditorDraft.style.top = `${top + rect.y * height}px`;
  dom.panelEditorDraft.style.width = `${rect.w * width}px`;
  dom.panelEditorDraft.style.height = `${rect.h * height}px`;
}

function resolveEditorSelectedId(panels, selectedIndex = null) {
  if (!panels.length) {
    return null;
  }

  if (Number.isInteger(selectedIndex)) {
    const panel = panels[clamp(selectedIndex, 0, panels.length - 1)];
    if (panel) {
      return panel.id;
    }
  }

  return panels[0].id;
}

function setEditorPanels(panels, { selectedId = null, persist = true } = {}) {
  const normalized = normalizePanels(clonePanels(panels));
  state.editor.panels = normalized;

  if (!selectedId || !normalized.some((panel) => panel.id === selectedId)) {
    selectedId = normalized[normalized.length - 1] ? normalized[normalized.length - 1].id : null;
  }
  state.editor.selectedId = selectedId;

  if (persist) {
    const page = getPageByNumber(state.editor.pageNumber);
    state.editor.panels = writeStoredPanels(page, normalized);
    if (!state.editor.panels.some((panel) => panel.id === state.editor.selectedId)) {
      state.editor.selectedId = state.editor.panels[0] ? state.editor.panels[0].id : null;
    }
    void syncReaderWithPanelOverride(page.number);
  }

  renderPanelEditor();
}

async function syncReaderWithPanelOverride(pageNumber) {
  if (state.currentPage !== pageNumber) {
    return;
  }

  const page = getPageByNumber(pageNumber);
  if (!page) {
    return;
  }

  const panels = await loadPanelsForPage(page);
  if (state.currentPage !== pageNumber) {
    return;
  }

  state.currentPanels = panels;
  state.currentPanelIndex = panels.length ? clamp(state.currentPanelIndex, 0, panels.length - 1) : 0;
  renderPageDebugOverlay();
  updateViewModeButtons();
  updateReaderStatus();
  updateNav();
  applyViewTransform();
  updateHistory("replace");
}

async function resetPanelEditorPage() {
  const page = getPageByNumber(state.editor.pageNumber);
  if (!page) {
    return;
  }

  clearStoredPanels(page);
  await loadPanelEditorPage(page.number);
  await syncReaderWithPanelOverride(page.number);
}

function clearPanelEditorPage() {
  setEditorPanels([], { selectedId: null, persist: true });
}

function moveEditorPanel(panelId, direction) {
  const index = state.editor.panels.findIndex((panel) => panel.id === panelId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.editor.panels.length) {
    return;
  }

  const nextPanels = clonePanels(state.editor.panels);
  const [moved] = nextPanels.splice(index, 1);
  nextPanels.splice(nextIndex, 0, moved);
  setEditorPanels(nextPanels, { selectedId: panelId, persist: true });
}

function removeEditorPanel(panelId) {
  const nextPanels = state.editor.panels.filter((panel) => panel.id !== panelId);
  const removedIndex = state.editor.panels.findIndex((panel) => panel.id === panelId);
  const nextSelected = nextPanels[removedIndex] || nextPanels[removedIndex - 1] || null;
  setEditorPanels(nextPanels, {
    selectedId: nextSelected ? nextSelected.id : null,
    persist: true
  });
}

async function copyCurrentEditorJson() {
  const text = getCurrentEditorJson();
  const originalLabel = dom.panelEditorCopyBtn.textContent;
  const copied = await copyText(text);
  dom.panelEditorCopyBtn.textContent = copied ? "Copied" : "Copy failed";
  window.setTimeout(() => {
    dom.panelEditorCopyBtn.textContent = originalLabel;
  }, 1200);
}

function downloadCurrentEditorJson() {
  const page = getPageByNumber(state.editor.pageNumber);
  if (!page) {
    return;
  }

  downloadJson(`${page.panelId || page.number}.json`, getCurrentEditorJson());
}

function getCurrentEditorJson() {
  return JSON.stringify(serializePanels(state.editor.panels), null, 2);
}

function beginPanelEditorInteraction(event, { mode, panelId = null, point, handle = null }) {
  state.editor.pointerId = event.pointerId;
  state.editor.interaction = {
    mode,
    panelId,
    handle,
    startPoint: point ? { x: point.x, y: point.y } : null,
    originPanel: panelId ? clonePanel(findEditorPanelById(panelId)) : null,
    changed: false
  };

  if (mode === "draw" && point) {
    state.editor.draft = {
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y
    };
    updatePanelEditorDraft();
  } else {
    state.editor.draft = null;
    dom.panelEditorDraft.hidden = true;
  }

  if (dom.panelEditorStage.setPointerCapture) {
    dom.panelEditorStage.setPointerCapture(event.pointerId);
  }
}

function updatePanelEditorInteraction(point) {
  const interaction = state.editor.interaction;
  if (!interaction) {
    return;
  }

  if (interaction.mode === "draw") {
    state.editor.draft.currentX = point.x;
    state.editor.draft.currentY = point.y;
    updatePanelEditorDraft();
    return;
  }

  const nextPanel = getEditorInteractionPanel(interaction, point);
  if (!nextPanel) {
    return;
  }

  interaction.changed = interaction.changed || !panelsMatch(interaction.originPanel, nextPanel);
  replaceEditorPanel(interaction.panelId, nextPanel);
}

function getEditorInteractionPanel(interaction, point) {
  const origin = interaction.originPanel;
  const startPoint = interaction.startPoint;
  if (!origin || !startPoint) {
    return null;
  }

  if (interaction.mode === "move") {
    const dx = point.x - startPoint.x;
    const dy = point.y - startPoint.y;
    return {
      ...origin,
      x: clamp(origin.x + dx, 0, 1 - origin.w),
      y: clamp(origin.y + dy, 0, 1 - origin.h)
    };
  }

  if (interaction.mode === "resize") {
    return resizePanelFromHandle(origin, interaction.handle, point.x - startPoint.x, point.y - startPoint.y);
  }

  return null;
}

function resizePanelFromHandle(panel, handle, dx, dy) {
  const left = panel.x;
  const top = panel.y;
  const right = panel.x + panel.w;
  const bottom = panel.y + panel.h;

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes("w")) {
    nextLeft = clamp(left + dx, 0, right - MIN_EDITOR_PANEL_SIZE);
  }
  if (handle.includes("e")) {
    nextRight = clamp(right + dx, left + MIN_EDITOR_PANEL_SIZE, 1);
  }
  if (handle.includes("n")) {
    nextTop = clamp(top + dy, 0, bottom - MIN_EDITOR_PANEL_SIZE);
  }
  if (handle.includes("s")) {
    nextBottom = clamp(bottom + dy, top + MIN_EDITOR_PANEL_SIZE, 1);
  }

  return {
    ...panel,
    x: nextLeft,
    y: nextTop,
    w: nextRight - nextLeft,
    h: nextBottom - nextTop
  };
}

function replaceEditorPanel(panelId, nextPanel) {
  state.editor.panels = state.editor.panels.map((panel) => (
    panel.id === panelId
      ? {
          ...panel,
          x: clamp(nextPanel.x, 0, 1),
          y: clamp(nextPanel.y, 0, 1),
          w: clamp(nextPanel.w, MIN_EDITOR_PANEL_SIZE, 1),
          h: clamp(nextPanel.h, MIN_EDITOR_PANEL_SIZE, 1)
        }
      : panel
  ));

  renderPanelEditorOverlay();
}

function revertEditorInteraction(interaction) {
  if (!interaction.originPanel || !interaction.panelId) {
    return;
  }
  replaceEditorPanel(interaction.panelId, interaction.originPanel);
}

function handlePanelEditorPointerDown(event) {
  if (!state.editor.open) {
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  event.preventDefault();

  const boxTarget = event.target.closest(".panel-editor-box");
  const moveHandleTarget = event.target.closest(".panel-editor-move-handle");
  const handleTarget = event.target.closest(".panel-editor-handle");

  if (moveHandleTarget) {
    const panelId = moveHandleTarget.dataset.panelId || (boxTarget ? boxTarget.dataset.panelId : "");
    const point = getEditorPoint(event, { clampToImage: true });
    if (!panelId || !point) {
      return;
    }

    state.editor.selectedId = panelId;
    beginPanelEditorInteraction(event, {
      mode: "move",
      panelId,
      point
    });
    return;
  }

  if (handleTarget) {
    const panelId = handleTarget.dataset.panelId || (boxTarget ? boxTarget.dataset.panelId : "");
    const point = getEditorPoint(event, { clampToImage: true });
    if (!panelId || !point) {
      return;
    }

    state.editor.selectedId = panelId;
    beginPanelEditorInteraction(event, {
      mode: "resize",
      panelId,
      point,
      handle: handleTarget.dataset.handle || "se"
    });
    return;
  }

  if (boxTarget && !event.shiftKey) {
    const panelId = boxTarget.dataset.panelId;
    if (!panelId) {
      return;
    }

    state.editor.selectedId = panelId;
    renderPanelEditorOverlay();
    renderPanelEditorList();
    return;
  }

  const point = getEditorPoint(event, { clampToImage: false });
  if (!point) {
    return;
  }

  const hitPanel = findEditorPanelAtPoint(point.x, point.y);
  if (hitPanel && !event.shiftKey) {
    state.editor.selectedId = hitPanel.id;
    renderPanelEditorOverlay();
    renderPanelEditorList();
    return;
  }

  beginPanelEditorInteraction(event, {
    mode: "draw",
    point
  });
}

function handlePanelEditorPointerMove(event) {
  if (!state.editor.open || state.editor.pointerId !== event.pointerId || !state.editor.interaction) {
    return;
  }

  event.preventDefault();
  const point = getEditorPoint(event, { clampToImage: true });
  if (!point) {
    return;
  }

  updatePanelEditorInteraction(point);
}

function handlePanelEditorPointerUp(event) {
  if (!state.editor.open || state.editor.pointerId !== event.pointerId) {
    return;
  }

  const point = getEditorPoint(event, { clampToImage: true });
  if (point && state.editor.interaction) {
    updatePanelEditorInteraction(point);
  }

  finishPanelEditorPointer(event.pointerId, true);
}

function cancelPanelEditorPointer(event) {
  if (!state.editor.open || state.editor.pointerId !== event.pointerId) {
    return;
  }

  finishPanelEditorPointer(event.pointerId, false);
}

function finishPanelEditorPointer(pointerId, commitDraft) {
  if (dom.panelEditorStage.releasePointerCapture) {
    try {
      dom.panelEditorStage.releasePointerCapture(pointerId);
    } catch (error) {
      console.debug("Editor pointer release skipped.", error);
    }
  }

  const interaction = state.editor.interaction;
  const draft = state.editor.draft;
  state.editor.pointerId = null;
  state.editor.interaction = null;
  state.editor.draft = null;
  dom.panelEditorDraft.hidden = true;

  if (!interaction) {
    return;
  }

  if (interaction.mode === "draw") {
    if (!commitDraft || !draft) {
      return;
    }

    const rect = normalizeDraftRect(draft);
    if (!rect || rect.w < MIN_EDITOR_PANEL_SIZE || rect.h < MIN_EDITOR_PANEL_SIZE) {
      renderPanelEditor();
      return;
    }

    const panel = {
      id: createPanelId(),
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h
    };

    setEditorPanels([...state.editor.panels, panel], {
      selectedId: panel.id,
      persist: true
    });
    return;
  }

  if (!commitDraft) {
    revertEditorInteraction(interaction);
    renderPanelEditor();
    return;
  }

  if (!interaction.changed) {
    renderPanelEditor();
    return;
  }

  setEditorPanels(state.editor.panels, {
    selectedId: interaction.panelId,
    persist: true
  });
}

function getEditorPoint(event, { clampToImage = false } = {}) {
  const stageRect = dom.panelEditorStage.getBoundingClientRect();
  const { left, top, width, height } = state.editor.imgBox;
  if (!width || !height) {
    return null;
  }

  let x = event.clientX - stageRect.left;
  let y = event.clientY - stageRect.top;

  const insideImage = x >= left && x <= left + width && y >= top && y <= top + height;
  if (!insideImage && !clampToImage) {
    return null;
  }

  x = clamp(x, left, left + width);
  y = clamp(y, top, top + height);

  return {
    x: clamp((x - left) / width, 0, 1),
    y: clamp((y - top) / height, 0, 1)
  };
}

function clonePanel(panel) {
  if (!panel) {
    return null;
  }

  return {
    id: panel.id,
    x: panel.x,
    y: panel.y,
    w: panel.w,
    h: panel.h
  };
}

function normalizeDraftRect(draft) {
  const x = clamp(Math.min(draft.startX, draft.currentX), 0, 1);
  const y = clamp(Math.min(draft.startY, draft.currentY), 0, 1);
  const maxX = clamp(Math.max(draft.startX, draft.currentX), 0, 1);
  const maxY = clamp(Math.max(draft.startY, draft.currentY), 0, 1);

  return {
    x,
    y,
    w: clamp(maxX - x, 0, 1),
    h: clamp(maxY - y, 0, 1)
  };
}

function findEditorPanelAtPoint(x, y) {
  for (let index = state.editor.panels.length - 1; index >= 0; index -= 1) {
    const panel = state.editor.panels[index];
    if (isPointInPanel(x, y, panel)) {
      return panel;
    }
  }

  return null;
}

function findEditorPanelById(panelId) {
  return state.editor.panels.find((panel) => panel.id === panelId) || null;
}

function isPointInPanel(x, y, panel) {
  return x >= panel.x && x <= panel.x + panel.w && y >= panel.y && y <= panel.y + panel.h;
}

function panelsMatch(panelA, panelB, epsilon = 0.0001) {
  if (!panelA || !panelB) {
    return false;
  }

  return (
    Math.abs(panelA.x - panelB.x) <= epsilon &&
    Math.abs(panelA.y - panelB.y) <= epsilon &&
    Math.abs(panelA.w - panelB.w) <= epsilon &&
    Math.abs(panelA.h - panelB.h) <= epsilon
  );
}

function createPanelId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `panel-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clearPendingCenterTap() {
  if (state.ui.centerTap && state.ui.centerTap.timerId) {
    clearTimeout(state.ui.centerTap.timerId);
  }
  state.ui.centerTap = null;
}

function getStageZoneFromClientX(clientX) {
  const stageRect = dom.pageStage.getBoundingClientRect();
  const leftWidth = dom.prevPageBtn.getBoundingClientRect().width || stageRect.width * 0.24;
  const rightWidth = dom.nextPageBtn.getBoundingClientRect().width || stageRect.width * 0.24;
  const localX = clientX - stageRect.left;

  if (localX <= leftWidth) {
    return "left";
  }
  if (localX >= stageRect.width - rightWidth) {
    return "right";
  }
  return "center";
}

function handleCenterStageTap(event) {
  const now = performance.now();
  const previousTap = state.ui.centerTap;

  if (previousTap) {
    const dx = event.clientX - previousTap.x;
    const dy = event.clientY - previousTap.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= DOUBLE_TAP_DISTANCE_PX) {
      clearPendingCenterTap();
      togglePreferredMode({ reveal: false });
      return;
    }
  }

  clearPendingCenterTap();
  state.ui.centerTap = {
    x: event.clientX,
    y: event.clientY,
    at: now,
    timerId: window.setTimeout(() => {
      state.ui.centerTap = null;
      toggleChrome();
    }, DOUBLE_TAP_DELAY_MS)
  };
}

async function copyText(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.debug("Clipboard API unavailable.", error);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    console.debug("execCommand copy failed.", error);
  }

  textarea.remove();
  return copied;
}

function downloadJson(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
