// F7 3D 展館 - UI 元件

import {
  GALLERY3D_MAX_PHOTOS,
  GALLERY3D_RECOMMENDED_PHOTOS_PER_ROOM,
  GALLERY3D_TABS,
  getPhotoCountsByRoom
} from "./gallery3dState.js";
import { GALLERY3D_ROOM_COUNT } from "./gallery3dRooms.js";
import { canUseDeviceOrientation, isLikelyMobileDevice } from "./gallery3dTool.js";

export function renderControlTabs(activeTab){
  return GALLERY3D_TABS.map(tab => `
    <button
      type="button"
      class="crystal-tab-button gallery3d-tab-button ${tab.id === activeTab ? "is-active" : ""}"
      data-gallery3d-tab="${tab.id}"
      role="tab"
      aria-selected="${tab.id === activeTab ? "true" : "false"}"
    >${tab.label}</button>
  `).join("");
}

function renderTextureCarousel(state, textures, kind){
  const room = state.rooms.find(item => item.roomId === state.selectedRoomNumber)
    || state.rooms[0];
  const activeId = kind === "floor" ? room.floorTextureId : room.wallTextureId;
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
      <div class="crystal-asset-track" role="group" aria-label="${kind === "floor" ? "地板材質" : "牆面材質"}">${buttons}</div>
      <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
    </div>
  `;
}

export function renderScenePanel(state, { walls = [], floors = [] } = {}){
  const roomOptions = Array.from({ length: GALLERY3D_ROOM_COUNT }, (_, index) => {
    const roomId = index + 1;
    const selected = state.selectedRoomNumber === roomId ? "selected" : "";
    return `<option value="${roomId}" ${selected}>房間 ${roomId}</option>`;
  }).join("");

  const floorActive = state.sceneMaterialTarget === "floor";
  const wallActive = state.sceneMaterialTarget === "wall";
  const textures = floorActive ? floors : wallActive ? walls : [];

  return `
    <div class="gallery3d-scene-panel">
      <div class="selection-row gallery3d-room-row">
        <span class="selection-label">房間</span>
        <select id="gallery3dRoomSelect" class="select-control selected" aria-label="選擇房間">
          ${roomOptions}
        </select>
      </div>

      <div class="segment gallery3d-material-segment" role="group" aria-label="材質類型">
        <button type="button" class="gallery3d-material-btn ${floorActive ? "active" : ""}" data-gallery3d-material="floor">地板</button>
        <button type="button" class="gallery3d-material-btn ${wallActive ? "active" : ""}" data-gallery3d-material="wall">牆面</button>
      </div>

      <p class="note gallery3d-note">選擇房間後，再點地板或牆面，下方只會顯示一列對應材質縮圖。</p>

      ${textures.length
        ? renderTextureCarousel(state, textures, state.sceneMaterialTarget)
        : `<p class="note gallery3d-note gallery3d-texture-empty">請先點「地板」或「牆面」以選擇材質。</p>`}
    </div>
  `;
}

export function renderPhotosPanel(state){
  const count = state.photos.length;
  const remaining = GALLERY3D_MAX_PHOTOS - count;
  const roomCounts = getPhotoCountsByRoom(state.photos);
  const roomSummary = Array.from({ length: GALLERY3D_ROOM_COUNT }, (_, index) => {
    const roomId = index + 1;
    const roomCount = roomCounts[roomId] || 0;
    const heavy = roomCount > GALLERY3D_RECOMMENDED_PHOTOS_PER_ROOM ? " is-heavy" : "";
    return `<span class="gallery3d-room-stat${heavy}">房間 ${roomId}：${roomCount} 張</span>`;
  }).join("");

  const heavyWarning = Object.values(roomCounts).some(
    value => value > GALLERY3D_RECOMMENDED_PHOTOS_PER_ROOM
  );

  return `
    <div class="gallery3d-photo-panel">
      <div class="gallery3d-photo-head">
        <p class="gallery3d-photo-count">已上傳 <strong>${count}</strong> / ${GALLERY3D_MAX_PHOTOS} 張</p>
        <button type="button" class="gallery3d-upload-btn" id="gallery3dUploadBtn" ${remaining <= 0 ? "disabled" : ""}>
          新增照片
        </button>
      </div>
      <p class="note gallery3d-note">依上傳順序平均分配到 3 個房間（例如 10 張 → 各房 4／3／3）。</p>
      <div class="gallery3d-room-stats" aria-label="各房間照片數量">${roomSummary}</div>
      ${heavyWarning
        ? `<p class="note gallery3d-room-warning">圓形房間建議每間不超過 ${GALLERY3D_RECOMMENDED_PHOTOS_PER_ROOM} 張，以維持舒適的觀賞密度。</p>`
        : ""}
      <div class="gallery3d-thumb-strip" id="gallery3dThumbStrip">
        ${state.photos.length
          ? state.photos.map((photo, index) => `
            <div class="gallery3d-thumb" data-photo-id="${photo.id}">
              <img src="${photo.thumbDataUrl || photo.textureDataUrl}" alt="第 ${index + 1} 張" loading="lazy" decoding="async" />
              <span class="gallery3d-thumb-aspect">R${photo.roomId}</span>
              <button type="button" class="gallery3d-thumb-remove" data-remove-photo="${photo.id}" aria-label="移除第 ${index + 1} 張">×</button>
            </div>
          `).join("")
          : `<div class="gallery3d-empty-photos">尚未上傳照片</div>`}
      </div>
    </div>
  `;
}

export function renderGalleryEntryGate({ needsGyroPermission }){
  return `
    <div class="gallery3d-entry-gate" id="gallery3dEntryGate">
      <p class="gallery3d-entry-title">進入 3D 展館</p>
      <p class="note gallery3d-entry-note">
        ${needsGyroPermission
          ? "進入全螢幕後會請求陀螺儀權限，轉動手機即可環顧展館。"
          : "進入全螢幕模式後，可拖曳畫面環顧，點地板前進、點畫作放大。"}
      </p>
      <button type="button" class="gallery3d-enter-btn" id="gallery3dEnterBtn">進入展館</button>
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
          <li>點<strong>地板</strong>向前移動</li>
          <li>點<strong>畫作</strong>放大，再點一次縮小</li>
          <li>點<strong>門口</strong>或下方房間按鈕切換展間</li>
        </ul>
        <button type="button" class="gallery3d-enter-btn" id="gallery3dTutorialDismissBtn">開始參觀</button>
      </div>
    </div>
  `;
}

export function renderGalleryOverlay({
  showControls,
  inFullscreen,
  roomId,
  zoomedPhotoId,
  uiNotice,
  gyroEnabled,
  showGyroButton
}){
  const roomButtons = Array.from({ length: GALLERY3D_ROOM_COUNT }, (_, index) => {
    const id = index + 1;
    const active = id === roomId ? " is-active" : "";
    return `<button type="button" class="gallery3d-room-jump-btn${active}" data-gallery3d-jump-room="${id}">房間 ${id}</button>`;
  }).join("");

  return `
    <div class="gallery3d-overlay ${showControls ? "" : "hidden"}" id="gallery3dOverlay">
      ${inFullscreen ? `<p class="gallery3d-room-badge" aria-live="polite">目前：房間 ${roomId}／${GALLERY3D_ROOM_COUNT}</p>` : ""}
      ${uiNotice ? `<p class="gallery3d-ui-notice" role="status">${uiNotice}</p>` : ""}
      <p class="gallery3d-hint" id="gallery3dHint">
        ${zoomedPhotoId
          ? "再次點擊同一張畫作可縮小返回"
          : "點地板前進、點畫作放大、點門口或下方按鈕換房"}
      </p>
      ${inFullscreen ? `
        <div class="gallery3d-room-jump-bar" role="group" aria-label="快速切換房間">${roomButtons}</div>
        ${showGyroButton ? `
          <button
            type="button"
            class="gallery3d-gyro-btn ${gyroEnabled ? "is-active" : ""}"
            id="gallery3dGyroBtn"
            aria-pressed="${gyroEnabled ? "true" : "false"}"
          >${gyroEnabled ? "關閉陀螺儀" : "開啟陀螺儀"}</button>
        ` : ""}
        <button type="button" class="gallery3d-reset-btn" id="gallery3dResetViewBtn" aria-label="重設視角">重設視角</button>
        <button type="button" class="gallery3d-exit-btn" id="gallery3dExitFullscreenBtn">離開全螢幕</button>
      ` : ""}
    </div>
  `;
}

export function setupGallery3dUI(root, state, callbacks){
  const tabBar = root.querySelector("#gallery3dTabBar");
  const tabPanels = root.querySelector("#gallery3dTabPanels");
  const galleryPanel = root.querySelector("#gallery3dGalleryPanel");
  const scenePanel = root.querySelector("#gallery3dScenePanel");
  const photosPanel = root.querySelector("#gallery3dPhotosPanel");
  const photoHost = root.querySelector("#gallery3dPhotoHost");
  const sceneHost = root.querySelector("#gallery3dSceneHost");
  const galleryGateHost = root.querySelector("#gallery3dGalleryGateHost");
  const overlayHost = root.querySelector("#gallery3dOverlayHost");
  const canvasWrap = root.querySelector("#gallery3dCanvasWrap");
  const emptyCanvas = root.querySelector("#gallery3dEmptyCanvas");
  const page = root.querySelector(".gallery3d-page");

  function refreshTabs(){
    tabBar.innerHTML = renderControlTabs(state.activeTab);
    tabBar.querySelectorAll("[data-gallery3d-tab]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onTabChange?.(button.dataset.gallery3dTab);
      });
    });
  }

  function refreshPhotosPanel(){
    photoHost.innerHTML = renderPhotosPanel(state);
    photoHost.querySelector("#gallery3dUploadBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onUploadRequest?.();
    });
    photoHost.querySelectorAll("[data-remove-photo]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onRemovePhoto?.(button.dataset.removePhoto);
      });
    });
  }

  function refreshScenePanel(){
    if (!sceneHost) return;
    sceneHost.innerHTML = renderScenePanel(state, {
      walls: callbacks.getWallTextures?.() || [],
      floors: callbacks.getFloorTextures?.() || []
    });

    sceneHost.querySelector("#gallery3dRoomSelect")?.addEventListener("change", event => {
      callbacks.onRoomNumberChange?.(Number(event.target.value));
    });

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
  }

  function refreshGalleryGate(){
    if (!galleryGateHost) return;
    const showGate = state.activeTab === "gallery" && !state.gallerySessionReady;
    galleryGateHost.innerHTML = showGate
      ? renderGalleryEntryGate({
        needsGyroPermission: isLikelyMobileDevice() && canUseDeviceOrientation()
      })
      : "";
    galleryGateHost.querySelector("#gallery3dEnterBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onEnterGallery?.();
    });
  }

  function refreshOverlay(){
    overlayHost.innerHTML = renderGalleryOverlay({
      showControls: state.activeTab === "gallery" || state.activeTab === "scene",
      inFullscreen: Boolean(state.gallerySessionReady && state.activeTab === "gallery"),
      roomId: state.currentRoomId,
      zoomedPhotoId: callbacks.getZoomedPhotoId?.() || null,
      uiNotice: callbacks.getUiNotice?.() || "",
      gyroEnabled: state.gyroEnabled,
      showGyroButton: isLikelyMobileDevice() && canUseDeviceOrientation()
    });

    overlayHost.querySelector("#gallery3dGyroBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onToggleGyro?.();
    });
    overlayHost.querySelectorAll("[data-gallery3d-jump-room]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onJumpToRoom?.(Number(button.dataset.gallery3dJumpRoom));
      });
    });
    overlayHost.querySelector("#gallery3dResetViewBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onResetView?.();
    });
    overlayHost.querySelector("#gallery3dExitFullscreenBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onExitGallery?.();
    });
  }

  function setLoading(isLoading){
    canvasWrap?.classList.toggle("is-loading", Boolean(isLoading));
    canvasWrap?.querySelector("#gallery3dLoading")?.classList.toggle("hidden", !isLoading);
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
    const inGallery = state.activeTab === "gallery";
    const inScene = state.activeTab === "scene";
    const inPhotos = state.activeTab === "photos";
    galleryPanel.classList.toggle("hidden", !inGallery);
    scenePanel?.classList.toggle("hidden", !inScene);
    photosPanel.classList.toggle("hidden", !inPhotos);
    const showStage = (inGallery && state.gallerySessionReady) || inScene;
    canvasWrap.classList.toggle("is-gallery-active", showStage);
    canvasWrap.classList.toggle("is-fullscreen-active", inGallery && state.gallerySessionReady);
    emptyCanvas.classList.toggle("hidden", showStage);
    emptyCanvas.textContent = inScene ? "載入展間預覽中…" : "請點下方「進入展館」";
    tabPanels.classList.toggle("gallery3d-gallery-mode", inGallery && state.gallerySessionReady);
    tabPanels.classList.toggle("hidden", inGallery && state.gallerySessionReady);
    tabBar.classList.toggle("hidden", inGallery && state.gallerySessionReady);
    page?.classList.toggle("gallery3d-fullscreen-mode", inGallery && state.gallerySessionReady);
    refreshGalleryGate();
  }

  function refreshAll(){
    refreshTabs();
    refreshScenePanel();
    refreshPhotosPanel();
    refreshOverlay();
    refreshViewMode();
  }

  refreshAll();

  return {
    refreshAll,
    refreshPhotosPanel,
    refreshScenePanel,
    refreshGalleryGate,
    refreshOverlay,
    refreshViewMode,
    refreshTabs,
    setLoading,
    showTutorial
  };
}
