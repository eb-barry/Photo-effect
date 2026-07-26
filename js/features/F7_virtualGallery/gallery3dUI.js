// F7 3D 展館 - UI 元件

import { GALLERY3D_ROOM_COUNT } from "./gallery3dRooms.js";

function setupTextureCarousel(carousel){
  const track = carousel.querySelector(".crystal-asset-track");
  const left = carousel.querySelector(".crystal-carousel-hint-left");
  const right = carousel.querySelector(".crystal-carousel-hint-right");
  if (!track) return;

  const update = () => {
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const offset = track.scrollLeft;
    left?.classList.toggle("hidden", offset <= 4);
    right?.classList.toggle("hidden", maxScroll - offset <= 4);
  };

  track.addEventListener("scroll", update, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(update);
    observer.observe(track);
    carousel._resizeObserver = observer;
  }
  requestAnimationFrame(update);
}

function resolveTextureAsset(catalog, textureId){
  const entry = catalog.find(item => item.id === textureId) || catalog[0];
  return entry?.thumb || entry?.asset || "";
}

export function renderGalleryToolbar(state){
  const layoutActive = state.activeTab === "scene";
  const tourActive = state.activeTab === "gallery" && state.gallerySessionReady;

  const roomOptions = Array.from({ length: GALLERY3D_ROOM_COUNT }, (_, index) => {
    const roomId = index + 1;
    const selected = state.selectedRoomNumber === roomId ? "selected" : "";
    return `<option value="${roomId}" ${selected}>展間${["一", "二", "三"][index] || roomId}</option>`;
  }).join("");

  return `
    <div class="gallery3d-toolbar" role="toolbar" aria-label="3D 展館功能">
      <button
        type="button"
        class="gallery3d-toolbar-btn ${layoutActive ? "is-active" : ""}"
        data-gallery3d-tab="scene"
        aria-pressed="${layoutActive ? "true" : "false"}"
      >展間佈置</button>
      <select
        id="gallery3dRoomSelect"
        class="gallery3d-toolbar-room-select select-control ${layoutActive ? "" : "is-hidden"}"
        aria-label="選擇展間"
        ${layoutActive ? "" : "disabled"}
      >${roomOptions}</select>
      <div class="gallery3d-toolbar-spacer" aria-hidden="true"></div>
      <button
        type="button"
        class="gallery3d-toolbar-btn gallery3d-toolbar-tour ${tourActive ? "is-active" : ""}"
        data-gallery3d-action="tour"
      >開始導覽</button>
    </div>
  `;
}

export function renderMaterialPreview(room, roomNumber, { hasPhoto = false } = {}){
  const wallUrl = resolveTextureAsset(room._wallCatalog || [], room.wallTextureId);
  const floorUrl = resolveTextureAsset(room._floorCatalog || [], room.floorTextureId);
  const doorUrl = resolveTextureAsset(room._doorCatalog || [], room.doorTextureId);
  const roomLabel = `展間 ${Number(roomNumber) || 1}`;

  const artworkMarkup = hasPhoto
    ? `<img class="gallery3d-preview-framed-img" alt="畫框預覽" decoding="async" />`
    : `<div class="gallery3d-preview-artwork-placeholder">上傳照片後<br>預覽畫框</div>`;

  return `
    <div class="gallery3d-material-preview" aria-label="展間材質預覽">
      <span class="gallery3d-preview-room-label">${roomLabel}</span>
      <div
        class="gallery3d-preview-wall"
        style="background-image: url('${wallUrl}')"
        aria-hidden="true"
      >
        <div class="gallery3d-preview-artwork">
          ${artworkMarkup}
        </div>
      </div>
      <div
        class="gallery3d-preview-floor"
        style="background-image: url('${floorUrl}')"
        aria-hidden="true"
      >
        <div
          class="gallery3d-preview-door"
          style="background-image: url('${doorUrl}')"
          aria-hidden="true"
        ></div>
      </div>
    </div>
  `;
}

function getActiveTextureId(room, kind){
  if (kind === "floor") return room.floorTextureId;
  if (kind === "wall") return room.wallTextureId;
  if (kind === "door") return room.doorTextureId;
  if (kind === "outerFrame") return room.outerFrameTypeId;
  if (kind === "innerFrame") return room.innerFrameTypeId;
  return null;
}

function getTextureCarouselLabel(kind){
  if (kind === "floor") return "地板材質";
  if (kind === "wall") return "牆面材質";
  if (kind === "door") return "門片材質";
  if (kind === "outerFrame") return "畫框外框材質";
  if (kind === "innerFrame") return "畫框內框材質";
  return "材質";
}

function renderTextureCarousel(state, textures, kind){
  const room = state.rooms.find(item => item.roomId === state.selectedRoomNumber)
    || state.rooms[0];
  const activeId = getActiveTextureId(room, kind);
  const buttons = textures.map(item => `
    <button
      type="button"
      class="crystal-scene-button gallery3d-texture-button${activeId === item.id ? " active" : ""}"
      data-gallery3d-texture="${item.id}"
      data-gallery3d-texture-kind="${kind}"
      aria-pressed="${String(activeId === item.id)}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="crystal-scene-thumb gallery3d-scene-thumb">
        <img src="${item.thumb || item.asset}" alt="" loading="lazy" decoding="async" draggable="false" />
      </span>
      <span class="gallery3d-scene-label">${item.label}</span>
    </button>
  `).join("");

  return `
    <div class="crystal-asset-carousel" data-gallery3d-carousel="${kind}">
      <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
      <div class="crystal-asset-track" role="group" aria-label="${getTextureCarouselLabel(kind)}">${buttons}</div>
      <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
    </div>
  `;
}

function renderFrameTexturePickers(state, outerFrames, innerFrames){
  return `
    <div class="gallery3d-frame-pickers">
      <p class="gallery3d-subsection-label">外框</p>
      ${outerFrames.length
        ? renderTextureCarousel(state, outerFrames, "outerFrame")
        : `<p class="note gallery3d-note">外框材質載入中…</p>`}
      <p class="gallery3d-subsection-label">內框</p>
      ${innerFrames.length
        ? renderTextureCarousel(state, innerFrames, "innerFrame")
        : `<p class="note gallery3d-note">內框材質載入中…</p>`}
    </div>
  `;
}

export function renderScenePanel(state, {
  walls = [],
  floors = [],
  doors = [],
  outerFrames = [],
  innerFrames = []
} = {}){
  const target = state.sceneMaterialTarget || "floor";
  const floorActive = target === "floor";
  const wallActive = target === "wall";
  const frameActive = target === "frame";
  const doorActive = target === "door";

  let pickerContent = "";
  if (floorActive && floors.length) {
    pickerContent = renderTextureCarousel(state, floors, "floor");
  } else if (wallActive && walls.length) {
    pickerContent = renderTextureCarousel(state, walls, "wall");
  } else if (doorActive && doors.length) {
    pickerContent = renderTextureCarousel(state, doors, "door");
  } else if (frameActive) {
    pickerContent = renderFrameTexturePickers(state, outerFrames, innerFrames);
  } else {
    pickerContent = `<p class="note gallery3d-note gallery3d-texture-empty">材質載入中…</p>`;
  }

  return `
    <div class="gallery3d-scene-panel">
      <div class="gallery3d-material-segment gallery3d-material-row" role="group" aria-label="材質類型">
        <button type="button" class="gallery3d-material-btn ${floorActive ? "active" : ""}" data-gallery3d-material="floor">地板</button>
        <button type="button" class="gallery3d-material-btn ${wallActive ? "active" : ""}" data-gallery3d-material="wall">牆面</button>
        <button type="button" class="gallery3d-material-btn ${frameActive ? "active" : ""}" data-gallery3d-material="frame">畫框</button>
        <button type="button" class="gallery3d-material-btn ${doorActive ? "active" : ""}" data-gallery3d-material="door">門片</button>
      </div>
      ${pickerContent}
    </div>
  `;
}

export function renderGyroPrompt(){
  return `
    <div class="gallery3d-gyro-prompt" id="gallery3dGyroPrompt" role="dialog" aria-label="陀螺儀權限">
      <div class="gallery3d-gyro-prompt-card">
        <p class="gallery3d-gyro-prompt-title">啟用陀螺儀環顧</p>
        <p class="note gallery3d-gyro-prompt-note">轉動手機即可環顧 3D 展館。請點「同意」以授權裝置的方向感測。</p>
        <div class="gallery3d-gyro-prompt-actions">
          <button type="button" class="gallery3d-enter-btn" id="gallery3dGyroAgreeBtn">同意</button>
          <button type="button" class="gallery3d-gyro-skip-btn" id="gallery3dGyroSkipBtn">使用拖曳操作</button>
        </div>
      </div>
    </div>
  `;
}

export function renderGalleryTutorial(){
  return `
    <div class="gallery3d-tutorial" id="gallery3dTutorial" role="dialog" aria-label="展館操作教學">
      <div class="gallery3d-tutorial-card">
        <p class="gallery3d-tutorial-title">歡迎來到 3D 展館</p>
        <ul class="gallery3d-tutorial-list">
          <li>拖曳畫面（或轉動手機）環顧四周</li>
          <li>點<strong>牆面</strong>往後退一步（可連點多次）</li>
          <li>點<strong>地板</strong>向前移動</li>
          <li>點<strong>門口</strong>切換展間</li>
        </ul>
        <button type="button" class="gallery3d-enter-btn" id="gallery3dTutorialDismissBtn">開始參觀</button>
      </div>
    </div>
  `;
}

export function renderGalleryOverlay({
  inFullscreen,
  uiNotice
}){
  if (inFullscreen) {
    return uiNotice
      ? `<div class="gallery3d-overlay gallery3d-overlay-minimal" id="gallery3dOverlay"><p class="gallery3d-ui-notice" role="status">${uiNotice}</p></div>`
      : "";
  }
  return "";
}

export function setupGallery3dUI(root, state, callbacks){
  const tabBar = root.querySelector("#gallery3dTabBar");
  const tabPanels = root.querySelector("#gallery3dTabPanels");
  const scenePanel = root.querySelector("#gallery3dScenePanel");
  const sceneHost = root.querySelector("#gallery3dSceneHost");
  const previewHost = root.querySelector("#gallery3dMaterialPreviewHost");
  const overlayHost = root.querySelector("#gallery3dOverlayHost");
  const canvasWrap = root.querySelector("#gallery3dCanvasWrap");
  const emptyCanvas = root.querySelector("#gallery3dEmptyCanvas");
  const page = root.querySelector(".gallery3d-page");
  const galleryTopControls = root.querySelector("#gallery3dGalleryTopControls");
  const photoActions = root.querySelector("#gallery3dPhotoActions");
  const topbarTitle = root.querySelector(".gallery3d-topbar-title");
  let previewSerial = 0;

  const getCatalogs = () => ({
    walls: callbacks.getWallTextures?.() || [],
    floors: callbacks.getFloorTextures?.() || [],
    doors: callbacks.getDoorTextures?.() || [],
    outerFrames: callbacks.getOuterFrameTextures?.() || [],
    innerFrames: callbacks.getInnerFrameTextures?.() || []
  });

  function bindToolbarEvents(){
    tabBar.querySelectorAll("[data-gallery3d-tab]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onTabChange?.(button.dataset.gallery3dTab);
      });
    });
    tabBar.querySelector("[data-gallery3d-action='tour']")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onStartTour?.();
    });
    tabBar.querySelector("#gallery3dRoomSelect")?.addEventListener("change", event => {
      callbacks.onRoomNumberChange?.(Number(event.target.value));
    });
  }

  function refreshToolbar(){
    tabBar.innerHTML = renderGalleryToolbar(state);
    bindToolbarEvents();
  }

  async function refreshMaterialPreview(){
    if (!previewHost) return;
    if (state.activeTab !== "scene") {
      previewHost.innerHTML = "";
      return;
    }

    const serial = ++previewSerial;
    const catalogs = getCatalogs();
    const room = callbacks.getRoomSettings?.() || state.rooms[0];
    const firstPhoto = callbacks.getFirstPhoto?.() || null;
    const previewRoom = {
      ...room,
      _wallCatalog: catalogs.walls,
      _floorCatalog: catalogs.floors,
      _doorCatalog: catalogs.doors
    };

    previewHost.innerHTML = renderMaterialPreview(
      previewRoom,
      state.selectedRoomNumber,
      { hasPhoto: Boolean(firstPhoto) }
    );

    if (!firstPhoto) return;

    try {
      const framedUrl = await callbacks.buildFramedPreview?.(room, firstPhoto);
      if (serial !== previewSerial) return;
      const image = previewHost.querySelector(".gallery3d-preview-framed-img");
      if (image && framedUrl) image.src = framedUrl;
    } catch (error) {
      console.warn("[F7 3D 展館] 畫框預覽產生失敗：", error);
    }
  }

  function bindScenePanelEvents(){
    sceneHost.querySelectorAll("[data-gallery3d-material]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onMaterialTargetToggle?.(button.dataset.gallery3dMaterial);
      });
    });
    sceneHost.querySelectorAll("[data-gallery3d-texture]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onTextureChange?.(button.dataset.gallery3dTextureKind, button.dataset.gallery3dTexture);
      });
    });
    sceneHost.querySelectorAll("[data-gallery3d-carousel]").forEach(setupTextureCarousel);
  }

  function refreshScenePanel(){
    if (!sceneHost) return;
    sceneHost.innerHTML = renderScenePanel(state, getCatalogs());
    bindScenePanelEvents();
  }

  function refreshOverlay(){
    overlayHost.innerHTML = renderGalleryOverlay({
      inFullscreen: Boolean(state.gallerySessionReady && state.activeTab === "gallery"),
      uiNotice: callbacks.getUiNotice?.() || ""
    });
  }

  function setLoading(isLoading){
    canvasWrap?.classList.toggle("is-loading", Boolean(isLoading));
    canvasWrap?.querySelector("#gallery3dLoading")?.classList.toggle("hidden", !isLoading);
  }

  function showGyroPrompt(show){
    let prompt = page?.querySelector("#gallery3dGyroPrompt");
    if (!show) {
      prompt?.remove();
      return;
    }
    if (!prompt && page) {
      page.insertAdjacentHTML("beforeend", renderGyroPrompt());
      prompt = page.querySelector("#gallery3dGyroPrompt");
    }
    prompt?.querySelector("#gallery3dGyroAgreeBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onGyroAgree?.();
    }, { once: true });
    prompt?.querySelector("#gallery3dGyroSkipBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onGyroSkip?.();
    }, { once: true });
  }

  function showTutorial(show){
    let tutorial = page?.querySelector("#gallery3dTutorial");
    if (!show) {
      tutorial?.remove();
      return;
    }
    if (!tutorial && page) {
      page.insertAdjacentHTML("beforeend", renderGalleryTutorial());
      tutorial = page.querySelector("#gallery3dTutorial");
    }
    tutorial?.querySelector("#gallery3dTutorialDismissBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onDismissTutorial?.();
    }, { once: true });
  }

  function refreshViewMode(){
    const inGallery = state.activeTab === "gallery" && state.gallerySessionReady;
    const inScene = state.activeTab === "scene";
    scenePanel?.classList.toggle("hidden", !inScene);
    const showLayoutPreview = inScene;
    const showStage = inGallery;
    canvasWrap?.classList.toggle("is-layout-active", showLayoutPreview);
    canvasWrap?.classList.toggle("is-gallery-active", showStage);
    canvasWrap?.classList.toggle("is-fullscreen-active", inGallery);
    emptyCanvas?.classList.toggle("hidden", showLayoutPreview || showStage);
    emptyCanvas.textContent = "點右上角圖示上傳照片，並在此預覽展間材質";
    tabPanels?.classList.toggle("gallery3d-gallery-mode", inGallery);
    tabPanels?.classList.toggle("hidden", inGallery);
    tabBar?.classList.toggle("hidden", inGallery);
    page?.classList.toggle("gallery3d-fullscreen-mode", inGallery);
    galleryTopControls?.classList.toggle("hidden", !inGallery);
    photoActions?.classList.toggle("hidden", inGallery);
    topbarTitle?.classList.toggle("hidden", inGallery);
    void refreshMaterialPreview();
  }

  function refreshAll(){
    refreshToolbar();
    refreshScenePanel();
    refreshOverlay();
    refreshViewMode();
  }

  refreshAll();

  return {
    refreshAll,
    refreshScenePanel,
    refreshMaterialPreview,
    refreshOverlay,
    refreshViewMode,
    refreshToolbar,
    setLoading,
    showTutorial,
    showGyroPrompt
  };
}
