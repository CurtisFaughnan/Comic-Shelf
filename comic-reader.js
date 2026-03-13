const LIBRARY_PATH = "./comics/library.json";
const DEFAULT_IMAGE_SIZE = { width: 1600, height: 2533 };
const UI_HIDE_DELAY_MS = 2200;
const PANEL_PADDING_PX = 34;
const MAX_GUIDED_ZOOM = 10;
const SWIPE_THRESHOLD = 70;

const dom = {
  body: document.body,
  siteTitle: document.querySelector("#siteTitle"),
  siteTagline: document.querySelector("#siteTagline"),
  shareHint: document.querySelector("#shareHint"),
  libraryView: document.querySelector("#libraryView"),
  readerView: document.querySelector("#readerView"),
  readerTopbar: document.querySelector("#readerTopbar"),
  readerFooter: document.querySelector("#readerFooter"),
  bookGrid: document.querySelector("#bookGrid"),
  openFirstBookBtn: document.querySelector("#openFirstBookBtn"),
  backToShelfBtn: document.querySelector("#backToShelfBtn"),
  readerTitle: document.querySelector("#readerTitle"),
  readerByline: document.querySelector("#readerByline"),
  viewModeBtn: document.querySelector("#viewModeBtn"),
  pageDrawerToggleBtn: document.querySelector("#pageDrawerToggleBtn"),
  fullscreenBtn: document.querySelector("#fullscreenBtn"),
  prevPageBtn: document.querySelector("#prevPageBtn"),
  nextPageBtn: document.querySelector("#nextPageBtn"),
  pageStage: document.querySelector("#pageStage"),
  pageImage: document.querySelector("#pageImage"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  hintBubble: document.querySelector("#hintBubble"),
  pageScrubber: document.querySelector("#pageScrubber"),
  pageCountLabel: document.querySelector("#pageCountLabel"),
  pageCountPill: document.querySelector("#pageCountPill"),
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
    hideTimer: null,
    suppressClickUntil: 0,
    gesture: null
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
  dom.readerFooter.dataset.drawer = "closed";
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

  dom.viewModeBtn.addEventListener("click", () => {
    togglePreferredMode();
  });

  dom.pageDrawerToggleBtn.addEventListener("click", () => {
    togglePageDrawer();
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
    dom.fullscreenBtn.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
    revealChrome();
  });

  document.addEventListener("keydown", async (event) => {
    if (dom.readerView.hidden) {
      return;
    }

    revealChrome();

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
    toggleChrome();
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
      revealChrome();
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

  window.addEventListener("resize", () => {
    applyViewTransform();
  });

  window.addEventListener("popstate", () => {
    syncToUrl().catch((error) => {
      console.error(error);
    });
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

  if (!slug) {
    showLibrary();
    return;
  }

  const book = (state.library.books || []).find((item) => item.slug === slug);
  if (!book) {
    showLibrary();
    return;
  }

  await openBook(slug, {
    page,
    panel: Number.isFinite(panel) ? panel - 1 : 0,
    mode: mode === "page" ? "page" : "guided",
    historyMode: "none"
  });
}

async function openBook(slug, { page = 1, panel = 0, mode = null, historyMode = "replace" } = {}) {
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
  showReader();
  await setPage(page, {
    historyMode,
    panelStrategy: "specific",
    panelIndex: panel,
    shouldScrollThumb: false
  });
}

function closeBook({ historyMode = "replace" } = {}) {
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
  revealChrome({ immediate: true });
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
  dom.pageCountLabel.textContent = `1 / ${state.pages.length}`;
  dom.pageCountPill.textContent = `1 / ${state.pages.length}`;
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
      revealChrome();
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

  dom.pageScrubber.value = String(nextPage);
  dom.pageImage.alt = `${state.currentManifest.title} page ${nextPage}`;

  if (dom.pageImage.dataset.page !== String(nextPage) || dom.pageImage.src !== new URL(page.image, window.location.href).href) {
    dom.loadingOverlay.hidden = false;
    dom.pageImage.dataset.page = String(nextPage);
    dom.pageImage.src = page.image;
  } else {
    dom.loadingOverlay.hidden = true;
    applyViewTransform();
  }

  updateViewModeButton();
  updateReaderStatus();
  updateNav();
  updateHint();
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
  revealChrome();
  if (getEffectiveMode() === "guided" && state.currentPanels.length) {
    if (state.currentPanelIndex < state.currentPanels.length - 1) {
      state.currentPanelIndex += 1;
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
  revealChrome();
  if (getEffectiveMode() === "guided" && state.currentPanels.length) {
    if (state.currentPanelIndex > 0) {
      state.currentPanelIndex -= 1;
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
  const pageText = `${state.currentPage} / ${totalPages}`;
  const guided = getEffectiveMode() === "guided" && state.currentPanels.length;

  if (guided) {
    const panelText = `${state.currentPanelIndex + 1} / ${state.currentPanels.length}`;
    dom.pageCountLabel.textContent = `${pageText} | ${panelText}`;
    dom.pageCountPill.textContent = `${state.currentPage}/${totalPages} | ${state.currentPanelIndex + 1}/${state.currentPanels.length}`;
    return;
  }

  dom.pageCountLabel.textContent = pageText;
  dom.pageCountPill.textContent = pageText;
}

function updateViewModeButton() {
  if (!state.currentPanels.length) {
    dom.viewModeBtn.textContent = "Page only";
    dom.viewModeBtn.disabled = true;
    dom.viewModeBtn.setAttribute("aria-pressed", "false");
    return;
  }

  dom.viewModeBtn.disabled = false;
  const guided = getEffectiveMode() === "guided";
  dom.viewModeBtn.textContent = guided ? "Guided" : "Full page";
  dom.viewModeBtn.setAttribute("aria-pressed", String(guided));
}

function updateHint() {
  if (getEffectiveMode() === "guided" && state.currentPanels.length) {
    dom.hintBubble.textContent = "Tap left or right to move panel-to-panel. Tap middle for menu.";
    return;
  }
  dom.hintBubble.textContent = "Tap left or right for pages. Tap middle for menu.";
}

function togglePreferredMode() {
  if (!state.currentPanels.length) {
    return;
  }

  state.preferredMode = state.preferredMode === "guided" ? "page" : "guided";
  updateViewModeButton();
  updateReaderStatus();
  applyViewTransform();
  updateNav();
  updateHistory("replace");
  revealChrome({ immediate: true });
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
    return;
  }

  let scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
  let tx = (stageWidth - imageWidth * scale) / 2;
  let ty = (stageHeight - imageHeight * scale) / 2;

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
    }
  }

  dom.pageImage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

async function loadPanelsForPage(page) {
  if (page.panels) {
    return page.panels;
  }

  if (state.panelCache.has(page.number)) {
    return state.panelCache.get(page.number);
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
  dom.readerFooter.dataset.drawer = nextState ? "open" : "closed";
  dom.thumbnailDrawer.setAttribute("aria-hidden", String(!nextState));
  dom.pageDrawerToggleBtn.setAttribute("aria-expanded", String(nextState));
  dom.pageDrawerToggleBtn.textContent = nextState ? "Hide pages" : "Pages";
  if (nextState) {
    setChromeVisible(true);
    clearTimeout(state.ui.hideTimer);
    return;
  }
  scheduleChromeHide(900);
}

function isInteractiveTarget(target) {
  return Boolean(target.closest("button, input"));
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
