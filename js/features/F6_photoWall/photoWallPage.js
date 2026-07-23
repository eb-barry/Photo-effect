// F6 照片牆 - Page Controller v0.1.1

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { loadPhotoWallSceneCatalog } from "./photoWallAssets.js";
import {
  PHOTO_WALL_FEATURE_VERSION,
  addPhotosFromFiles,
  clearPhotoWallDraft,
  createDefaultPhotoWallState,
  loadPhotoWallDraft,
  savePhotoWallDraft,
  updatePhotoWallState
} from "./photoWallState.js";
import {
  fileToDataUrl,
  invalidateSceneLayerCache,
  preparePhotoVariants,
  renderPhotoWall,
  resolvePhotoWallOutputSize
} from "./photoWallTool.js";
import {
  renderControlTabs,
  setupPhotoWallUI
} from "./photoWallUI.js";
import { getWarpPointDef } from "./photoWallWarp.js";

export function initPhotoWallPage(root, shared = {}){
  return renderPhotoWallPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderPhotoWallPage(root, navigate){
  const savedState = loadPhotoWallDraft() || createDefaultPhotoWallState();

  root.innerHTML = `
    <main class="app-shell page crystal-page photo-wall-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>照片牆</h1>
          <p class="crystal-version" aria-hidden="true">v${PHOTO_WALL_FEATURE_VERSION}</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap photo-wall-canvas-wrap" id="canvasWrap">
          <div class="empty-canvas" id="emptyCanvas">請先選擇場景</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas photo-wall-canvas"></canvas>
        </div>

        <p class="note hidden" id="photoWallGestureHint"></p>

        <div class="crystal-tab-bar photo-wall-tab-bar" id="photoWallTabBar" role="tablist" aria-label="照片牆功能">
          ${renderControlTabs(savedState)}
        </div>

        <div class="crystal-tab-panels" id="photoWallTabPanels">
          <div id="photoWallScenePanel" class="crystal-tab-panel" role="tabpanel" aria-label="場景">
            <div id="photoWallSceneHost"></div>
          </div>
          <div id="photoWallPhotoPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="相片">
            <div id="photoWallPhotoHost"></div>
          </div>
          <div id="photoWallPositionPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="位置">
            <div id="photoWallPositionHost"></div>
          </div>
          <div id="photoWallPerspectivePanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="視角">
            <div id="photoWallPerspectiveHost"></div>
          </div>
        </div>
      </section>

      <input id="imageInput" class="file-input-hidden" type="file" accept="image/*" multiple />
    </main>
  `;

  const page = root.querySelector(".photo-wall-page");
  const blockNativeLongPressUi = event => {
    event.preventDefault();
  };
  for (const type of ["contextmenu", "selectstart"]) {
    page?.addEventListener(type, blockNativeLongPressUi);
  }

  const imageInput = root.querySelector("#imageInput");
  const canvas = root.querySelector("#editorCanvas");
  const canvasWrap = root.querySelector("#canvasWrap");
  const openPhotoBtn = root.querySelector("#openPhotoBtn");
  const savePhotoBtn = root.querySelector("#savePhotoBtn");
  const sharePhotoBtn = root.querySelector("#sharePhotoBtn");
  const ctx = canvas.getContext("2d", { alpha: false });

  const state = { ...savedState };
  let renderSerial = 0;
  let renderRaf = 0;
  let gestureFast = false;
  let wallUi = null;

  const applyCanvasSize = size => {
    if (canvas.width === size.width && canvas.height === size.height) return;
    canvas.width = size.width;
    canvas.height = size.height;
    canvasWrap.style.aspectRatio = `${size.width} / ${size.height}`;
    canvasWrap.dataset.orientation = size.width >= size.height ? "landscape" : "portrait";
  };

  const syncActionButtons = () => {
    const hasScene = Boolean(state.sceneId);
    const hasCanvasPhotos = state.photos.some(photo => photo.onCanvas);
    openPhotoBtn.disabled = !hasScene;
    savePhotoBtn.disabled = !hasCanvasPhotos;
    sharePhotoBtn.disabled = !hasCanvasPhotos;
    openPhotoBtn.classList.toggle("is-disabled", !hasScene);
    savePhotoBtn.classList.toggle("is-disabled", !hasCanvasPhotos);
    sharePhotoBtn.classList.toggle("is-disabled", !hasCanvasPhotos);
  };

  const persistDraft = () => {
    if (!state.sceneId && !state.photos.length) return;
    savePhotoWallDraft(state);
  };

  const render = async (options = {}) => {
    if (!state.sceneId) return;
    const serial = ++renderSerial;
    const size = resolvePhotoWallOutputSize(state.sceneId);
    applyCanvasSize(size);

    const fastPreview = Boolean(options.fastPreview ?? gestureFast);
    const useOriginal = Boolean(options.useOriginal);

    try {
      const overlays = await renderPhotoWall(ctx, state, {
        fastPreview,
        useOriginal,
        showPerspectiveHandles: state.activeTab === "perspective",
        activePerspectiveHandle: state.activeTab === "perspective"
          ? getWarpPointDef(state.selectedPerspectiveParameter).handle
          : null
      });
      if (serial !== renderSerial) return;
      wallUi?.setOverlays(overlays);
    } catch (error) {
      console.error("[F6 照片牆] 繪製失敗：", error);
    }
    syncActionButtons();
  };

  const scheduleRender = (options = {}) => {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      render(options).catch(console.error);
    });
  };

  const renderAndPersist = async (options = {}) => {
    await render(options);
    if (!options.fastPreview) persistDraft();
  };

  const scheduleRenderAndPersist = (options = {}) => {
    if (options.fastPreview) {
      scheduleRender(options);
      return;
    }
    if (renderRaf) cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      renderAndPersist(options).catch(console.error);
    });
  };

  root.querySelector("#homeBtn")?.addEventListener("click", event => {
    event.preventDefault();
    persistDraft();
    navigate("home");
  });

  openPhotoBtn?.addEventListener("click", event => {
    event.preventDefault();
    if (!state.sceneId) return;
    imageInput.click();
  });

  imageInput.addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;

    try {
      const entries = [];
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        const variants = await preparePhotoVariants(dataUrl);
        entries.push({ ...variants, label: file.name || "照片" });
      }
      Object.assign(state, addPhotosFromFiles(state, entries));
      await renderAndPersist();
      wallUi?.refreshAll();
    } catch (error) {
      console.error(error);
      alert("照片開啟失敗，請換一張圖片再試。");
    } finally {
      imageInput.value = "";
    }
  });

  savePhotoBtn?.addEventListener("click", async event => {
    event.preventDefault();
    if (!state.photos.some(photo => photo.onCanvas)) return;
    await render({ useOriginal: true, fastPreview: false });
    await downloadCanvas(canvas);
    clearPhotoWallDraft();
    Object.assign(state, updatePhotoWallState(createDefaultPhotoWallState(), {}));
    invalidateSceneLayerCache();
    wallUi?.refreshAll();
    await render();
  });

  sharePhotoBtn?.addEventListener("click", async event => {
    event.preventDefault();
    if (!state.photos.some(photo => photo.onCanvas)) return;
    await render({ useOriginal: true, fastPreview: false });
    const shared = await shareCanvas(canvas);
    if (!shared) await downloadCanvas(canvas);
    clearPhotoWallDraft();
    Object.assign(state, updatePhotoWallState(createDefaultPhotoWallState(), {}));
    invalidateSceneLayerCache();
    wallUi?.refreshAll();
    await render();
  });

  try {
    await loadPhotoWallSceneCatalog();
  } catch (error) {
    console.warn("[F6 照片牆] 場景清單載入失敗：", error);
  }

  wallUi = setupPhotoWallUI(root, state, {
    scheduleRender,
    scheduleRenderAndPersist,
    persist: persistDraft,
    onSceneChange: () => {
      invalidateSceneLayerCache();
      scheduleRenderAndPersist();
    },
    onGestureStart: () => {
      gestureFast = true;
    },
    onGestureEnd: () => {
      gestureFast = false;
      scheduleRenderAndPersist({ fastPreview: false });
    }
  });

  syncActionButtons();
  if (state.sceneId) {
    await renderAndPersist();
  }
}
