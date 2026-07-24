// F7 3D 展館 - UI 元件

import { GALLERY3D_MAX_PHOTOS, GALLERY3D_TABS } from "./gallery3dState.js";
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

export function renderScenePanel(state, scenes){
  const buttons = scenes.map(item => `
    <button
      type="button"
      class="crystal-scene-button gallery3d-scene-button${state.wallSceneId === item.id ? " active" : ""}"
      data-gallery3d-scene="${item.id}"
      aria-pressed="${String(state.wallSceneId === item.id)}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      <span class="crystal-scene-thumb gallery3d-scene-thumb">
        <span class="gallery3d-scene-aspect">${item.aspect === "4x3" ? "4:3" : "3:4"}</span>
        <img src="${item.thumb || item.asset}" alt="" loading="lazy" decoding="async" draggable="false" />
      </span>
      <span class="gallery3d-scene-label">${item.label}</span>
    </button>
  `).join("");

  return `
    <div class="gallery3d-scene-panel">
      <p class="note gallery3d-note">沿用「畫框」功能的展場材質：牆面取自展場圖上半部，地板取自底部區塊並重複鋪設。</p>
      <div class="crystal-asset-carousel" data-gallery3d-carousel="scenes">
        <span class="crystal-carousel-hint crystal-carousel-hint-left hidden" aria-hidden="true"></span>
        <div class="crystal-asset-track" role="group" aria-label="展場材質">${buttons}</div>
        <span class="crystal-carousel-hint crystal-carousel-hint-right hidden" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

export function renderPhotosPanel(state){
  const count = state.photos.length;
  const remaining = GALLERY3D_MAX_PHOTOS - count;
  return `
    <div class="gallery3d-photo-panel">
      <div class="gallery3d-photo-head">
        <p class="gallery3d-photo-count">已上傳 <strong>${count}</strong> / ${GALLERY3D_MAX_PHOTOS} 張</p>
        <button type="button" class="gallery3d-upload-btn" id="gallery3dUploadBtn" ${remaining <= 0 ? "disabled" : ""}>
          新增照片
        </button>
      </div>
      <p class="note gallery3d-note">僅支援 4:3 橫向或 3:4 直向照片。上傳後切換到「展館」分頁即可環視。</p>
      <div class="gallery3d-thumb-strip" id="gallery3dThumbStrip">
        ${state.photos.length
          ? state.photos.map((photo, index) => `
            <div class="gallery3d-thumb" data-photo-id="${photo.id}">
              <img src="${photo.thumbDataUrl || photo.textureDataUrl}" alt="第 ${index + 1} 張" loading="lazy" decoding="async" />
              <span class="gallery3d-thumb-aspect">${photo.aspect === "4x3" ? "4:3" : "3:4"}</span>
              <button type="button" class="gallery3d-thumb-remove" data-remove-photo="${photo.id}" aria-label="移除第 ${index + 1} 張">×</button>
            </div>
          `).join("")
          : `<div class="gallery3d-empty-photos">尚未上傳照片</div>`}
      </div>
    </div>
  `;
}

export function renderGalleryOverlay({ showGyroButton, gyroEnabled, hasPhotos, showControls }){
  const mobile = isLikelyMobileDevice();
  const gyroAvailable = canUseDeviceOrientation();
  return `
    <div class="gallery3d-overlay ${showControls ? "" : "hidden"}" id="gallery3dOverlay">
      <p class="gallery3d-hint" id="gallery3dHint">
        ${hasPhotos
          ? (mobile && gyroAvailable
            ? "點擊陀螺儀按鈕後，轉動手機即可環顧展館"
            : "拖曳畫面即可環顧展館")
          : "可先預覽展場材質，上傳照片後牆面會掛上畫作"}
      </p>
      ${showGyroButton ? `
        <button
          type="button"
          class="gallery3d-gyro-btn ${gyroEnabled ? "is-active" : ""}"
          id="gallery3dGyroBtn"
          aria-pressed="${gyroEnabled ? "true" : "false"}"
        >${gyroEnabled ? "陀螺儀已開啟" : "啟用陀螺儀"}</button>
      ` : ""}
      <button type="button" class="gallery3d-reset-btn" id="gallery3dResetViewBtn" aria-label="重設視角">重設視角</button>
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
  const overlayHost = root.querySelector("#gallery3dOverlayHost");
  const canvasWrap = root.querySelector("#gallery3dCanvasWrap");
  const emptyCanvas = root.querySelector("#gallery3dEmptyCanvas");

  function refreshTabs(){
    tabBar.innerHTML = renderControlTabs(state.activeTab);
    tabBar.querySelectorAll("[data-gallery3d-tab]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        const tab = button.dataset.gallery3dTab;
        callbacks.onTabChange?.(tab);
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

  function refreshOverlay(){
    overlayHost.innerHTML = renderGalleryOverlay({
      showGyroButton: isLikelyMobileDevice() && canUseDeviceOrientation(),
      gyroEnabled: state.gyroEnabled,
      hasPhotos: state.photos.length > 0,
      showControls: state.activeTab === "gallery" || state.activeTab === "scene"
    });

    overlayHost.querySelector("#gallery3dGyroBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onToggleGyro?.();
    });
    overlayHost.querySelector("#gallery3dResetViewBtn")?.addEventListener("click", event => {
      event.preventDefault();
      callbacks.onResetView?.();
    });
  }

  function refreshScenePanel(){
    if (!sceneHost) return;
    sceneHost.innerHTML = renderScenePanel(state, callbacks.getScenes?.() || []);
    sceneHost.querySelectorAll("[data-gallery3d-scene]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        callbacks.onSceneChange?.(button.dataset.gallery3dScene);
      });
    });
  }

  function refreshViewMode(){
    const inGallery = state.activeTab === "gallery";
    const inScene = state.activeTab === "scene";
    const inPhotos = state.activeTab === "photos";
    galleryPanel.classList.toggle("hidden", !inGallery);
    scenePanel?.classList.toggle("hidden", !inScene);
    photosPanel.classList.toggle("hidden", !inPhotos);
    const showStage = inGallery || inScene;
    canvasWrap.classList.toggle("is-gallery-active", showStage);
    emptyCanvas.classList.toggle("hidden", showStage);
    emptyCanvas.textContent = inScene
      ? "載入展場材質中…"
      : "請先上傳 4:3 或 3:4 照片";
    tabPanels.classList.toggle("gallery3d-gallery-mode", inGallery || inScene);
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
    refreshOverlay,
    refreshViewMode,
    refreshTabs
  };
}
