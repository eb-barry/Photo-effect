// F7 3D 展館 - Page Controller v0.1.0

import { iconButton } from "../../core/iconLoader.js";
import {
  loadGallery3dSceneCatalog,
  pickDefaultGallery3dSceneId,
  resolveGallery3dRoomTextures
} from "./gallery3dAssets.js";
import { Gallery3DScene } from "./gallery3dScene.js";
import {
  GALLERY3D_FEATURE_VERSION,
  GALLERY3D_MAX_PHOTOS,
  createDefaultGallery3dState,
  createPhotoId,
  loadGallery3dDraft,
  saveGallery3dDraft,
  updateGallery3dState
} from "./gallery3dState.js";
import { prepareGalleryPhoto } from "./gallery3dTool.js";
import { renderControlTabs, setupGallery3dUI } from "./gallery3dUI.js";

export function initGallery3dPage(root, shared = {}){
  return renderGallery3dPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderGallery3dPage(root, navigate){
  const savedState = loadGallery3dDraft() || createDefaultGallery3dState();
  const state = { ...savedState };

  root.innerHTML = `
    <main class="app-shell page crystal-page gallery3d-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>3D 展館</h1>
          <p class="crystal-version" aria-hidden="true">v${GALLERY3D_FEATURE_VERSION}</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "新增照片", id: "openPhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap gallery3d-canvas-wrap" id="gallery3dCanvasWrap">
          <div class="empty-canvas" id="gallery3dEmptyCanvas">請先上傳 4:3 或 3:4 照片</div>
          <div class="gallery3d-stage" id="gallery3dStage"></div>
          <div id="gallery3dOverlayHost"></div>
        </div>

        <div class="crystal-tab-bar gallery3d-tab-bar" id="gallery3dTabBar" role="tablist" aria-label="3D 展館功能">
          ${renderControlTabs(state.activeTab)}
        </div>

        <div class="crystal-tab-panels gallery3d-tab-panels" id="gallery3dTabPanels">
          <div id="gallery3dGalleryPanel" class="crystal-tab-panel ${state.activeTab === "gallery" ? "" : "hidden"}" role="tabpanel" aria-label="展館">
            <p class="note gallery3d-gallery-note">轉動手機或拖曳畫面環顧四周，牆上會展示您上傳的畫作。</p>
          </div>
          <div id="gallery3dScenePanel" class="crystal-tab-panel ${state.activeTab === "scene" ? "" : "hidden"}" role="tabpanel" aria-label="場景">
            <div id="gallery3dSceneHost"></div>
          </div>
          <div id="gallery3dPhotosPanel" class="crystal-tab-panel ${state.activeTab === "photos" ? "" : "hidden"}" role="tabpanel" aria-label="相片">
            <div id="gallery3dPhotoHost"></div>
          </div>
        </div>
      </section>

      <input id="gallery3dImageInput" class="file-input-hidden" type="file" accept="image/*" multiple />
    </main>
  `;

  const imageInput = root.querySelector("#gallery3dImageInput");
  const stage = root.querySelector("#gallery3dStage");
  let scene = null;
  let rebuildSerial = 0;
  let wallScenes = [];

  wallScenes = await loadGallery3dSceneCatalog();
  Object.assign(state, updateGallery3dState(state, {
    wallSceneId: pickDefaultGallery3dSceneId(state.wallSceneId)
  }));

  const persistDraft = () => {
    saveGallery3dDraft(state);
  };

  const shouldRender3d = () => state.activeTab === "gallery" || state.activeTab === "scene";

  const ensureScene = async () => {
    if (scene) return scene;
    scene = new Gallery3DScene(stage);
    return scene;
  };

  const applyRoomMaterials = async () => {
    if (!scene) return;
    const roomTextures = await resolveGallery3dRoomTextures(state.wallSceneId);
    scene.setRoomTextures(roomTextures);
  };

  const rebuildScene = async () => {
    const serial = ++rebuildSerial;

    if (!shouldRender3d()) {
      scene?.disableGyro();
      scene?.stop();
      return;
    }

    await ensureScene();
    if (serial !== rebuildSerial) return;

    await applyRoomMaterials();
    if (serial !== rebuildSerial) return;

    await scene.setPhotos(state.activeTab === "gallery" ? state.photos : []);
    if (serial !== rebuildSerial) return;

    scene.resize();
    scene.start();

    if (state.activeTab === "gallery" && state.gyroEnabled) {
      const enabled = await scene.enableGyro();
      if (!enabled) {
        Object.assign(state, updateGallery3dState(state, { gyroEnabled: false }));
        ui.refreshOverlay();
      }
    } else {
      scene.disableGyro();
    }
  };

  const syncGyroState = async () => {
    if (!scene) return;
    if (state.gyroEnabled) {
      const enabled = await scene.enableGyro();
      if (!enabled) {
        Object.assign(state, updateGallery3dState(state, { gyroEnabled: false }));
        ui.refreshOverlay();
        alert("無法啟用陀螺儀，請確認已允許動作與方向權限。");
      }
    } else {
      scene.disableGyro();
    }
  };

  const ui = setupGallery3dUI(root, state, {
    getScenes: () => wallScenes,
    onTabChange: async tab => {
      Object.assign(state, updateGallery3dState(state, { activeTab: tab }));
      ui.refreshAll();
      persistDraft();
      await rebuildScene();
    },
    onSceneChange: async sceneId => {
      if (!sceneId || sceneId === state.wallSceneId) return;
      Object.assign(state, updateGallery3dState(state, { wallSceneId: sceneId }));
      ui.refreshScenePanel();
      ui.refreshViewMode();
      persistDraft();
      await rebuildScene();
    },
    onUploadRequest: () => imageInput.click(),
    onRemovePhoto: async photoId => {
      Object.assign(state, updateGallery3dState(state, {
        photos: state.photos.filter(photo => photo.id !== photoId)
      }));
      ui.refreshAll();
      persistDraft();
      await rebuildScene();
    },
    onToggleGyro: async () => {
      Object.assign(state, updateGallery3dState(state, { gyroEnabled: !state.gyroEnabled }));
      ui.refreshOverlay();
      persistDraft();
      await syncGyroState();
    },
    onResetView: () => {
      scene?.resetView();
    }
  });

  root.querySelector("#homeBtn")?.addEventListener("click", event => {
    event.preventDefault();
    persistDraft();
    scene?.stop();
    scene?.dispose();
    scene = null;
    navigate("home");
  });

  root.querySelector("#openPhotoBtn")?.addEventListener("click", event => {
    event.preventDefault();
    imageInput.click();
  });

  imageInput.addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;

    const remaining = GALLERY3D_MAX_PHOTOS - state.photos.length;
    if (remaining <= 0) {
      alert(`最多只能上傳 ${GALLERY3D_MAX_PHOTOS} 張照片。`);
      imageInput.value = "";
      return;
    }

    const accepted = files.slice(0, remaining);
    const nextPhotos = [...state.photos];
    const errors = [];

    for (const file of accepted) {
      if (nextPhotos.length >= GALLERY3D_MAX_PHOTOS) break;
      try {
        const prepared = await prepareGalleryPhoto(file);
        nextPhotos.push({
          id: createPhotoId(),
          aspect: prepared.aspect,
          dataUrl: prepared.dataUrl,
          textureDataUrl: prepared.textureDataUrl,
          thumbDataUrl: prepared.thumbDataUrl
        });
      } catch (error) {
        errors.push(`${file.name}：${error.message || "無法使用"}`);
      }
    }

    if (!nextPhotos.length && errors.length) {
      alert(errors.join("\n"));
      imageInput.value = "";
      return;
    }

    Object.assign(state, updateGallery3dState(state, { photos: nextPhotos }));
    if (state.photos.length && state.activeTab === "photos") {
      Object.assign(state, updateGallery3dState(state, { activeTab: "gallery" }));
    }
    ui.refreshAll();
    persistDraft();
    await rebuildScene();

    if (errors.length) {
      alert(`部分照片未加入：\n${errors.join("\n")}`);
    }

    imageInput.value = "";
  });

  if (state.photos.length || state.activeTab !== "photos") {
    await rebuildScene();
  } else {
    ui.refreshAll();
  }
}
