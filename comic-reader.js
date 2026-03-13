const LIBRARY_PATH = "./comics/library.json";

const dom = {
  siteTitle: document.querySelector("#siteTitle"),
  siteTagline: document.querySelector("#siteTagline"),
  shareHint: document.querySelector("#shareHint"),
  libraryView: document.querySelector("#libraryView"),
  readerView: document.querySelector("#readerView"),
  bookGrid: document.querySelector("#bookGrid"),
  openFirstBookBtn: document.querySelector("#openFirstBookBtn"),
  backToShelfBtn: document.querySelector("#backToShelfBtn"),
  readerTitle: document.querySelector("#readerTitle"),
  readerByline: document.querySelector("#readerByline"),
  fullscreenBtn: document.querySelector("#fullscreenBtn"),
  zoomResetBtn: document.querySelector("#zoomResetBtn"),
  prevPageBtn: document.querySelector("#prevPageBtn"),
  nextPageBtn: document.querySelector("#nextPageBtn"),
  pageStage: document.querySelector("#pageStage"),
  pageMedia: document.querySelector("#pageMedia"),
  pageImage: document.querySelector("#pageImage"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  hintBubble: document.querySelector("#hintBubble"),
  pageScrubber: document.querySelector("#pageScrubber"),
  pageCountLabel: document.querySelector("#pageCountLabel"),
  thumbnailRail: document.querySelector("#thumbnailRail")
};

const state = {
  library: null,
  currentBook: null,
  currentManifest: null,
  pages: [],
  currentPage: 1,
  zoom: {
    active: false,
    scale: 1,
    tx: 0,
    ty: 0,
    page: 1,
    panelIndex: -1,
    region: null
  },
  gesture: null,
  lastTap: null
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

  dom.prevPageBtn.addEventListener("click", () => {
    changePage(-1);
  });

  dom.nextPageBtn.addEventListener("click", () => {
    changePage(1);
  });

  dom.pageScrubber.addEventListener("input", () => {
    setPage(Number(dom.pageScrubber.value), { historyMode: "replace", shouldScrollThumb: false });
  });

  dom.zoomResetBtn.addEventListener("click", () => {
    resetZoom();
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

  document.addEventListener("fullscreenchange", () => {
    dom.fullscreenBtn.textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
  });

  document.addEventListener("keydown", (event) => {
    if (dom.readerView.hidden) {
      return;
    }

    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        event.preventDefault();
        changePage(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        event.preventDefault();
        changePage(-1);
        break;
      case "Home":
        event.preventDefault();
        setPage(1, { historyMode: "replace" });
        break;
      case "End":
        event.preventDefault();
        setPage(state.pages.length, { historyMode: "replace" });
        break;
      case "Escape":
        event.preventDefault();
        if (state.zoom.active) {
          resetZoom();
        } else {
          closeBook({ historyMode: "push" });
        }
        break;
      case "f":
      case "F":
        event.preventDefault();
        dom.fullscreenBtn.click();
        break;
      default:
        break;
    }
  });

  dom.pageImage.addEventListener("load", () => {
    dom.pageImage.dataset.page = String(state.currentPage);
    dom.loadingOverlay.hidden = true;
    if (state.zoom.active && state.zoom.region) {
      zoomToRegion(state.zoom.region, state.zoom.panelIndex);
    } else {
      applyTransform();
    }
    updateHint();
    preloadNearbyPages();
  });

  dom.pageStage.addEventListener("dblclick", (event) => {
    event.preventDefault();
    handleZoomGesture(getNormalizedPoint(event));
  });

  dom.pageStage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    state.gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTx: state.zoom.tx,
      startTy: state.zoom.ty,
      zoomAtStart: state.zoom.active,
      moved: false
    };

    if (dom.pageStage.setPointerCapture) {
      dom.pageStage.setPointerCapture(event.pointerId);
    }
  });

  dom.pageStage.addEventListener("pointermove", (event) => {
    if (!state.gesture || state.gesture.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - state.gesture.startX;
    const dy = event.clientY - state.gesture.startY;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      state.gesture.moved = true;
    }

    if (!state.zoom.active) {
      return;
    }

    const clamped = clampTransform(state.gesture.startTx + dx, state.gesture.startTy + dy, state.zoom.scale);
    state.zoom.tx = clamped.tx;
    state.zoom.ty = clamped.ty;
    applyTransform();
  });

  const pointerEnd = (event) => {
    if (!state.gesture || state.gesture.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - state.gesture.startX;
    const dy = event.clientY - state.gesture.startY;
    const usedZoom = state.gesture.zoomAtStart;
    const moved = state.gesture.moved;

    if (dom.pageStage.releasePointerCapture) {
      try {
        dom.pageStage.releasePointerCapture(event.pointerId);
      } catch (error) {
        console.debug("Pointer release skipped.", error);
      }
    }

    state.gesture = null;

    if (!usedZoom && moved && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      changePage(dx < 0 ? 1 : -1);
      return;
    }

    if (event.pointerType !== "mouse" && !moved) {
      maybeHandleDoubleTap(event);
    }
  };

  dom.pageStage.addEventListener("pointerup", pointerEnd);
  dom.pageStage.addEventListener("pointercancel", pointerEnd);

  window.addEventListener("resize", () => {
    if (state.zoom.active && state.zoom.region) {
      zoomToRegion(state.zoom.region, state.zoom.panelIndex);
      return;
    }
    applyTransform();
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
    historyMode: "none"
  });
}

async function openBook(slug, { page = 1, historyMode = "replace" } = {}) {
  const book = (state.library.books || []).find((item) => item.slug === slug);
  if (!book) {
    return;
  }

  if (!state.currentBook || state.currentBook.slug !== slug) {
    state.currentBook = book;
    state.currentManifest = await fetchJson(book.manifest);
    state.pages = buildPages(state.currentManifest);
    renderReaderShell();
    renderThumbnails();
  }

  showReader();
  setPage(page, { historyMode, shouldScrollThumb: false });
}

function closeBook({ historyMode = "replace" } = {}) {
  state.currentBook = null;
  state.currentManifest = null;
  state.pages = [];
  resetZoom();
  showLibrary();
  updateHistory(historyMode);
}

function showLibrary() {
  dom.readerView.hidden = true;
  dom.libraryView.hidden = false;
}

function showReader() {
  dom.libraryView.hidden = true;
  dom.readerView.hidden = false;
  dom.pageStage.focus();
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
}

function buildPages(manifest) {
  return Array.from({ length: manifest.pageCount || 0 }, (_, index) => {
    const pageNumber = index + 1;
    return {
      number: pageNumber,
      image: resolvePattern(manifest.pageImagePattern, pageNumber),
      thumbnail: resolvePattern(manifest.thumbnailPattern, pageNumber),
      panels: manifest.panels && manifest.panels[String(pageNumber)] ? manifest.panels[String(pageNumber)] : []
    };
  });
}

function resolvePattern(pattern, pageNumber) {
  const padded = String(pageNumber).padStart(2, "0");
  return pattern.replace("{page}", padded);
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
    button.addEventListener("click", () => {
      setPage(page.number, { historyMode: "replace" });
    });
    fragment.appendChild(button);
  }

  dom.thumbnailRail.appendChild(fragment);
}

function setPage(pageNumber, { historyMode = "replace", shouldScrollThumb = true } = {}) {
  if (!state.pages.length) {
    return;
  }

  const totalPages = state.pages.length;
  const nextPage = clamp(Math.round(pageNumber), 1, totalPages);
  const page = state.pages[nextPage - 1];

  state.currentPage = nextPage;
  dom.pageScrubber.value = String(nextPage);
  dom.pageCountLabel.textContent = `${nextPage} / ${totalPages}`;
  dom.pageImage.alt = `${state.currentManifest.title} page ${nextPage}`;
  resetZoom(false);
  if (dom.pageImage.dataset.page !== String(nextPage) || dom.pageImage.src !== new URL(page.image, window.location.href).href) {
    dom.loadingOverlay.hidden = false;
    dom.pageImage.src = page.image;
  } else {
    dom.loadingOverlay.hidden = true;
  }
  updateNav();
  updateHint();
  updateHistory(historyMode);
  markActiveThumbnail(shouldScrollThumb);
}

function updateNav() {
  const atStart = state.currentPage <= 1;
  const atEnd = state.currentPage >= state.pages.length;
  dom.prevPageBtn.disabled = atStart;
  dom.nextPageBtn.disabled = atEnd;
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

function changePage(delta) {
  setPage(state.currentPage + delta, { historyMode: "replace" });
}

function updateHistory(mode) {
  if (mode === "none") {
    return;
  }

  const url = new URL(window.location.href);

  if (state.currentBook) {
    url.searchParams.set("book", state.currentBook.slug);
    url.searchParams.set("page", String(state.currentPage));
  } else {
    url.searchParams.delete("book");
    url.searchParams.delete("page");
  }

  if (mode === "push") {
    history.pushState({}, "", url);
  } else {
    history.replaceState({}, "", url);
  }
}

function resetZoom(updateUi = true) {
  state.zoom = {
    active: false,
    scale: 1,
    tx: 0,
    ty: 0,
    page: state.currentPage,
    panelIndex: -1,
    region: null
  };
  applyTransform();
  if (updateUi) {
    updateHint();
  }
}

function applyTransform() {
  dom.pageStage.dataset.zoomed = state.zoom.active ? "true" : "false";
  dom.pageMedia.style.transform = `translate(${state.zoom.tx}px, ${state.zoom.ty}px) scale(${state.zoom.scale})`;
  dom.zoomResetBtn.disabled = !state.zoom.active;
}

function updateHint() {
  const panels = getCurrentPanels();
  if (panels.length) {
    dom.hintBubble.textContent = "Double-click to cycle through panel zooms.";
    return;
  }
  dom.hintBubble.textContent = state.zoom.active
    ? "Double-click again to reset. Drag to pan while zoomed."
    : "Double-click or double-tap to zoom into a detail.";
}

function handleZoomGesture(point) {
  const panels = getCurrentPanels();

  if (panels.length) {
    const nextIndex = state.zoom.active && state.zoom.page === state.currentPage ? state.zoom.panelIndex + 1 : 0;
    if (nextIndex >= panels.length) {
      resetZoom();
      return;
    }
    zoomToRegion(panels[nextIndex], nextIndex);
    return;
  }

  if (state.zoom.active && state.zoom.page === state.currentPage) {
    resetZoom();
    return;
  }

  const regionWidth = 0.34;
  const regionHeight = 0.34;
  const region = {
    x: clamp(point.x - regionWidth / 2, 0, 1 - regionWidth),
    y: clamp(point.y - regionHeight / 2, 0, 1 - regionHeight),
    width: regionWidth,
    height: regionHeight
  };
  zoomToRegion(region, -1);
}

function getCurrentPanels() {
  if (!state.pages.length) {
    return [];
  }
  return state.pages[state.currentPage - 1].panels || [];
}

function zoomToRegion(region, panelIndex) {
  const metrics = getMetrics();
  if (!metrics) {
    return;
  }

  const scaleX = metrics.stageWidth / (metrics.baseWidth * region.width);
  const scaleY = metrics.stageHeight / (metrics.baseHeight * region.height);
  const scale = clamp(Math.min(scaleX, scaleY) * 0.94, 1.8, 4.2);
  const centerX = (region.x + region.width / 2) * metrics.baseWidth - metrics.baseWidth / 2;
  const centerY = (region.y + region.height / 2) * metrics.baseHeight - metrics.baseHeight / 2;
  const target = clampTransform(-(centerX * scale), -(centerY * scale), scale, metrics);

  state.zoom = {
    active: true,
    scale,
    tx: target.tx,
    ty: target.ty,
    page: state.currentPage,
    panelIndex,
    region
  };

  applyTransform();
  updateHint();
}

function getMetrics() {
  const stageWidth = dom.pageStage.clientWidth - 36;
  const stageHeight = dom.pageStage.clientHeight - 36;
  const baseWidth = dom.pageImage.clientWidth;
  const baseHeight = dom.pageImage.clientHeight;

  if (!stageWidth || !stageHeight || !baseWidth || !baseHeight) {
    return null;
  }

  return { stageWidth, stageHeight, baseWidth, baseHeight };
}

function clampTransform(tx, ty, scale, metrics = getMetrics()) {
  if (!metrics) {
    return { tx, ty };
  }

  const overflowX = Math.max(0, (metrics.baseWidth * scale - metrics.stageWidth) / 2);
  const overflowY = Math.max(0, (metrics.baseHeight * scale - metrics.stageHeight) / 2);

  return {
    tx: clamp(tx, -overflowX, overflowX),
    ty: clamp(ty, -overflowY, overflowY)
  };
}

function getNormalizedPoint(event) {
  const rect = dom.pageImage.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
  };
}

function maybeHandleDoubleTap(event) {
  const now = performance.now();
  if (
    state.lastTap &&
    now - state.lastTap.time < 320 &&
    Math.abs(event.clientX - state.lastTap.x) < 28 &&
    Math.abs(event.clientY - state.lastTap.y) < 28
  ) {
    handleZoomGesture(getNormalizedPoint(event));
    state.lastTap = null;
    return;
  }

  state.lastTap = {
    time: now,
    x: event.clientX,
    y: event.clientY
  };
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
