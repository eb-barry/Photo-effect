// F7 3D 展館 - Page Controller v0.3.3

import { iconButton } from "../../core/iconLoader.js";
import {
  getFloorTextureCatalog,
  getWallTextureCatalog,
  getDoorTextureCatalog,
  loadGallery3dTextureCatalogs,
  pickDefaultTextureId,
  resolveGallery3dDoorTexture,
  resolveGallery3dRoomSurfaceTextures
} from "./gallery3dAssets.js";
import {
  ensureGalleryFrameCatalog,
  GALLERY_DEFAULT_INNER_FRAME_ID,
  GALLERY_DEFAULT_OUTER_FRAME_ID,
  getGalleryInnerFrameCatalog,
  getGalleryOuterFrameCatalog,
  pickDefaultFrameId
} from "./gallery3dFrames.js";
import { Gallery3DScene } from "./gallery3dScene.js";
import {
  GALLERY3D_FEATURE_VERSION,
  GALLERY3D_MAX_PHOTOS,
  createDefaultGallery3dState,
  createPhotoId,
  getRoomSettings,
  hasSeenGalleryTutorial,
  loadGallery3dDraft,
  markGalleryTutorialSeen,
  saveGallery3dDraft,
  toggleSceneMaterialTarget,
  updateGallery3dState,
  updateRoomSettings
} from "./gallery3dState.js";
import { prepareGalleryPhoto, shouldOfferGyro } from "./gallery3dTool.js";
import { renderControlTabs, setupGallery3dUI } from "./gallery3dUI.js";

export function initGallery3dPage(root, shared = {}){
  return renderGallery3dPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderGallery3dPage(root, navigate){
  const savedState = loadGallery3dDraft() || createDefaultGallery3dState();
  const state = { ...savedState };
  if (state.activeTab === "gallery" && !state.photos.length) {
    state.activeTab = "photos";
  }
  let zoomedPhotoId = null;
  let uiNotice = "";

  root.innerHTML = `
    <main class="app-shell page crystal-page gallery3d-page">
      <nav class="topbar crystal-topbar gallery3d-topbar">
        <div class="gallery3d-topbar-leading">
          ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}
        </div>

        <div class="topbar-title gallery3d-topbar-title">
          <h1>3D 展館</h1>
          <p class="crystal-version" aria-hidden="true">v${GALLERY3D_FEATURE_VERSION}</p>
        </div>

        <div class="gallery3d-gallery-top-controls hidden" id="gallery3dGalleryTopControls" aria-label="展館控制">
          ${iconButton({ icon: "openPhoto", label: "新增照片", id: "gallery3dGalleryAddPhotoBtn" })}
          ${iconButton({ icon: "compass", label: "重設視角", id: "gallery3dResetViewBtn", ext: "webp" })}
          ${iconButton({ icon: "backward", label: "離開全螢幕", id: "gallery3dExitFullscreenBtn", ext: "webp" })}
        </div>

        <div class="topbar-actions gallery3d-photo-actions" id="gallery3dPhotoActions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "新增照片", id: "openPhotoBtn" })}
        </div>
      </nav>

      <section class="panel gallery3d-panel">
        <div class="canvas-wrap crystal-canvas-wrap gallery3d-canvas-wrap" id="gallery3dCanvasWrap">
          <div class="empty-canvas" id="gallery3dEmptyCanvas">切換至展館分頁即可進入 3D 模式</div>
          <div class="gallery3d-loading hidden" id="gallery3dLoading" aria-live="polite">載入展間中…</div>
          <div class="gallery3d-stage" id="gallery3dStage"></div>
          <div id="gallery3dOverlayHost"></div>
        </div>

        <div id="gallery3dGalleryGateHost" hidden></div>

        <div class="crystal-tab-bar gallery3d-tab-bar" id="gallery3dTabBar" role="tablist" aria-label="3D 展館功能">
          ${renderControlTabs(state.activeTab)}
        </div>

        <div class="crystal-tab-panels gallery3d-tab-panels" id="gallery3dTabPanels">
          <div id="gallery3dGalleryPanel" class="crystal-tab-panel ${state.activeTab === "gallery" ? "" : "hidden"}" role="tabpanel" aria-label="展館">
            <p class="note gallery3d-gallery-note">點「展館」分頁即進入全螢幕 3D 模式；手機上會請您同意啟用陀螺儀。</p>
          </div>
          <div id="gallery3dScenePanel" class="crystal-tab-panel ${state.activeTab === "scene" ? "" : "hidden"}" role="tabpanel" aria-label="場景">
            <div id="gallery3dSceneHost"></div>
          </div>
          <div id="gallery3dPhotosPanel" class="crystal-tab-panel ${state.activeTab === "photos" ? "" : "hidden"}" role="tabpanel" aria-label="相片">
            <div id="gallery3dPhotoHost"></div>
          </div>
        </div>
      </section>

      <input
        id="gallery3dImageInput"
        class="file-input-hidden gallery3d-image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple
      />
    </main>
  `;

  const imageInput = root.querySelector("#gallery3dImageInput");
  const stage = root.querySelector("#gallery3dStage");
  const page = root.querySelector(".gallery3d-page");
  let scene = null;
  let rebuildSerial = 0;
  let ui = null;

  const isGyroDevice = () => shouldOfferGyro();

  const maybeShowTutorial = () => {
    if (!hasSeenGalleryTutorial()) ui.showTutorial(true);
  };

  await loadGallery3dTextureCatalogs();
  await ensureGalleryFrameCatalog();
  Object.assign(state, updateGallery3dState(state, {
    rooms: state.rooms.map(room => ({
      ...room,
      wallTextureId: pickDefaultTextureId(getWallTextureCatalog(), room.wallTextureId),
      floorTextureId: pickDefaultTextureId(getFloorTextureCatalog(), room.floorTextureId),
      doorTextureId: pickDefaultTextureId(getDoorTextureCatalog(), room.doorTextureId),
      outerFrameTypeId: pickDefaultFrameId(
        getGalleryOuterFrameCatalog(),
        room.outerFrameTypeId,
        GALLERY_DEFAULT_OUTER_FRAME_ID
      ),
      innerFrameTypeId: pickDefaultFrameId(
        getGalleryInnerFrameCatalog(),
        room.innerFrameTypeId,
        GALLERY_DEFAULT_INNER_FRAME_ID
      )
    }))
  }));

  const persistDraft = () => saveGallery3dDraft(state);

  const shouldRender3d = () => (
    state.activeTab === "scene"
    || (state.activeTab === "gallery" && state.gallerySessionReady)
  );

  const getPhotosForRoom = roomId => state.photos.filter(photo => photo.roomId === Number(roomId));

  const ensureScene = async () => {
    if (scene) return scene;
    scene = new Gallery3DScene(stage, {
      onDoorwaySelected: async ({ targetRoomId }) => {
        if (!targetRoomId || targetRoomId === state.currentRoomId) return;
        const fromRoomId = state.currentRoomId;
        Object.assign(state, updateGallery3dState(state, { currentRoomId: targetRoomId }));
        zoomedPhotoId = null;
        ui.refreshOverlay();
        persistDraft();
        await loadActiveRoom(targetRoomId, fromRoomId);
      },
      onArtworkZoomChange: photoId => {
        zoomedPhotoId = photoId;
        ui.refreshOverlay();
      }
    });
    return scene;
  };

  const loadActiveRoom = async (roomId, fromRoomId = null) => {
    const serial = ++rebuildSerial;
    if (!shouldRender3d()) return;

    ui.setLoading(true);
    try {
      await ensureScene();
      if (serial !== rebuildSerial) return;

      const roomSettings = getRoomSettings(state, roomId);
      const [surfaceTextures, doorCanvas] = await Promise.all([
        resolveGallery3dRoomSurfaceTextures({
          wallTextureId: roomSettings.wallTextureId,
          floorTextureId: roomSettings.floorTextureId
        }),
        resolveGallery3dDoorTexture(roomSettings.doorTextureId)
      ]);
      if (serial !== rebuildSerial) return;

      await scene.loadRoom({
        roomId,
        surfaceTextures,
        doorTextureCanvas: doorCanvas,
        photos: getPhotosForRoom(roomId),
        fromRoomId,
        interactionEnabled: state.activeTab === "gallery" && state.gallerySessionReady,
        frameSettings: {
          outerFrameTypeId: roomSettings.outerFrameTypeId,
          innerFrameTypeId: roomSettings.innerFrameTypeId
        }
      });
      if (serial !== rebuildSerial) return;

      scene.resize();
      scene.start();
    } finally {
      if (serial === rebuildSerial) ui.setLoading(false);
    }
  };

  const rebuildScene = async (fromRoomId = null) => {
    if (!shouldRender3d()) {
      scene?.disableGyro();
      scene?.stop();
      return;
    }
    await loadActiveRoom(state.currentRoomId, fromRoomId);
    if (state.activeTab === "gallery" && state.gallerySessionReady && state.gyroEnabled) {
      await scene?.enableGyro();
    } else {
      scene?.disableGyro();
    }
  };

  const requestFullscreen = async () => {
    const target = page;
    if (!target) return false;
    if (document.fullscreenElement) return true;
    try {
      await target.requestFullscreen?.();
      return true;
    } catch (error) {
      console.warn("[F7 3D 展館] 無法進入全螢幕：", error);
      return false;
    }
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.warn("[F7 3D 展館] 無法離開全螢幕：", error);
      }
    }
  };

  const syncGyro = async () => {
    if (!scene || state.activeTab !== "gallery" || !state.gallerySessionReady) return;
    if (state.gyroEnabled) {
      const enabled = await scene.enableGyro();
      if (!enabled) {
        Object.assign(state, updateGallery3dState(state, { gyroEnabled: false }));
        uiNotice = "無法啟用陀螺儀，請在系統設定中允許「動作與方向」。";
      } else {
        uiNotice = "";
      }
    } else {
      scene.disableGyro();
      uiNotice = "";
    }
    ui.refreshOverlay();
    persistDraft();
  };

  const enterGallerySession = async () => {
    if (state.gallerySessionReady) return;
    await ensureScene();
    Object.assign(state, updateGallery3dState(state, { gallerySessionReady: true }));
    ui.refreshAll();
    await rebuildScene();
    await requestFullscreen();

    if (isGyroDevice() && !state.gyroEnabled) {
      ui.showGyroPrompt(true);
      return;
    }

    maybeShowTutorial();
  };

  const grantGyroAccess = async () => {
    if (!scene) return false;
    const gyroOk = await scene.enableGyro();
    Object.assign(state, updateGallery3dState(state, { gyroEnabled: gyroOk }));
    uiNotice = gyroOk ? "" : "陀螺儀未授權，您仍可使用拖曳與點擊操作。";
    ui.showGyroPrompt(false);
    ui.refreshOverlay();
    persistDraft();
    maybeShowTutorial();
    return gyroOk;
  };

  const exitGallerySession = async () => {
    scene?.disableGyro();
    await exitFullscreen();
    Object.assign(state, updateGallery3dState(state, {
      gallerySessionReady: false,
      gyroEnabled: false
    }));
    zoomedPhotoId = null;
    uiNotice = "";
    ui.showGyroPrompt(false);
    ui.showTutorial(false);
    ui.refreshAll();
    scene?.stop();
  };

  const pauseGallerySessionForUpload = () => {
    if (!state.gallerySessionReady) return;
    scene?.disableGyro();
    Object.assign(state, updateGallery3dState(state, {
      gallerySessionReady: false,
      gyroEnabled: false
    }));
    zoomedPhotoId = null;
    ui?.showGyroPrompt(false);
    ui?.showTutorial(false);
    scene?.stop();
  };

  const requestPhotoUpload = () => {
    // iOS only delivers picked files when input.click() runs synchronously
    // inside the original tap handler. Never await before opening the picker.
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    imageInput.click();
  };

  const handlePhotoUpload = async event => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;

    pauseGallerySessionForUpload();
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.warn("[F7 3D 展館] 無法離開全螢幕：", error);
      }
    }
    ui?.refreshAll();

    const remaining = GALLERY3D_MAX_PHOTOS - state.photos.length;
    if (remaining <= 0) {
      alert(`最多只能上傳 ${GALLERY3D_MAX_PHOTOS} 張照片。`);
      imageInput.value = "";
      return;
    }

    const accepted = files.slice(0, remaining);
    const nextPhotos = [...state.photos];
    const errors = [];

    ui?.setLoading(true);
    try {
      for (const file of accepted) {
        if (nextPhotos.length >= GALLERY3D_MAX_PHOTOS) break;
        try {
          const prepared = await prepareGalleryPhoto(file);
          nextPhotos.push({
            id: createPhotoId(),
            aspect: prepared.aspect,
            width: prepared.width,
            height: prepared.height,
            dataUrl: prepared.dataUrl,
            textureDataUrl: prepared.textureDataUrl,
            thumbDataUrl: prepared.thumbDataUrl
          });
        } catch (error) {
          errors.push(`${file.name}：${error.message || "無法使用"}`);
        }
      }

      if (nextPhotos.length === state.photos.length && errors.length) {
        alert(errors.join("\n"));
        return;
      }

      Object.assign(state, updateGallery3dState(state, { photos: nextPhotos }));
      ui?.refreshAll();
      persistDraft();

      try {
        await rebuildScene();
      } catch (error) {
        console.warn("[F7 3D 展館] 更新展間預覽失敗，照片已加入：", error);
        uiNotice = "照片已加入，但展間預覽更新失敗，請切換至場景分頁重試。";
        ui?.refreshOverlay();
      }

      if (errors.length) {
        alert(`部分照片未加入：\n${errors.join("\n")}`);
      }
    } catch (error) {
      console.error("[F7 3D 展館] 上傳照片失敗：", error);
      alert(`上傳照片失敗：${error.message || "請稍後再試"}`);
    } finally {
      ui?.setLoading(false);
      imageInput.value = "";
    }
  };

  ui = setupGallery3dUI(root, state, {
    getWallTextures: () => getWallTextureCatalog(),
    getFloorTextures: () => getFloorTextureCatalog(),
    getDoorTextures: () => getDoorTextureCatalog(),
    getOuterFrameTextures: () => getGalleryOuterFrameCatalog(),
    getInnerFrameTextures: () => getGalleryInnerFrameCatalog(),
    getZoomedPhotoId: () => zoomedPhotoId,
    getUiNotice: () => uiNotice,
    onTabChange: async tab => {
      if (tab !== "gallery" && state.gallerySessionReady) {
        await exitGallerySession();
      }
      Object.assign(state, updateGallery3dState(state, { activeTab: tab }));
      ui.refreshAll();
      persistDraft();
      if (tab === "gallery") {
        await enterGallerySession();
      } else {
        await rebuildScene();
      }
    },
    onRoomNumberChange: async roomNumber => {
      Object.assign(state, updateGallery3dState(state, { selectedRoomNumber: roomNumber }));
      ui.refreshScenePanel();
      persistDraft();
      if (state.activeTab === "scene") {
        Object.assign(state, updateGallery3dState(state, { currentRoomId: roomNumber }));
        await rebuildScene();
      }
    },
    onMaterialTargetToggle: async target => {
      Object.assign(state, updateGallery3dState(state, {
        sceneMaterialTarget: toggleSceneMaterialTarget(state.sceneMaterialTarget, target)
      }));
      ui.refreshScenePanel();
      persistDraft();
    },
    onTextureChange: async (kind, textureId) => {
      const roomId = state.selectedRoomNumber;
      const patch = kind === "floor"
        ? { floorTextureId: textureId }
        : kind === "wall"
          ? { wallTextureId: textureId }
          : kind === "door"
            ? { doorTextureId: textureId }
            : kind === "outerFrame"
              ? { outerFrameTypeId: textureId }
              : { innerFrameTypeId: textureId };
      Object.assign(state, updateRoomSettings(state, roomId, patch));
      ui.refreshScenePanel();
      persistDraft();
      if (state.activeTab === "scene" && state.currentRoomId === roomId) {
        await rebuildScene();
      }
    },
    onEnterGallery: async () => {
      await enterGallerySession();
    },
    onExitGallery: async () => {
      Object.assign(state, updateGallery3dState(state, { activeTab: "scene" }));
      await exitGallerySession();
      ui.refreshAll();
      persistDraft();
      await rebuildScene();
    },
    onToggleGyro: async () => {
      Object.assign(state, updateGallery3dState(state, { gyroEnabled: !state.gyroEnabled }));
      await syncGyro();
    },
    onJumpToRoom: async roomId => {
      if (!roomId || roomId === state.currentRoomId) return;
      const fromRoomId = state.currentRoomId;
      zoomedPhotoId = null;
      Object.assign(state, updateGallery3dState(state, { currentRoomId: roomId }));
      ui.refreshOverlay();
      persistDraft();
      await loadActiveRoom(roomId, fromRoomId);
    },
    onDismissTutorial: () => {
      markGalleryTutorialSeen();
      ui.showTutorial(false);
    },
    onGyroAgree: async () => {
      await grantGyroAccess();
    },
    onGyroSkip: () => {
      Object.assign(state, updateGallery3dState(state, { gyroEnabled: false }));
      uiNotice = "";
      ui.showGyroPrompt(false);
      ui.refreshOverlay();
      persistDraft();
      maybeShowTutorial();
    },
    onUploadRequest: () => requestPhotoUpload(),
    onRemovePhoto: async photoId => {
      Object.assign(state, updateGallery3dState(state, {
        photos: state.photos.filter(photo => photo.id !== photoId)
      }));
      ui.refreshAll();
      persistDraft();
      await rebuildScene();
    },
    onResetView: () => {
      zoomedPhotoId = null;
      scene?.resetView();
      ui.refreshOverlay();
    }
  });

  root.querySelector("#gallery3dResetViewBtn")?.addEventListener("click", event => {
    event.preventDefault();
    zoomedPhotoId = null;
    scene?.resetView();
    ui.refreshOverlay();
  });

  root.querySelector("#gallery3dExitFullscreenBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    Object.assign(state, updateGallery3dState(state, { activeTab: "scene" }));
    await exitGallerySession();
    ui.refreshAll();
    persistDraft();
    await rebuildScene();
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.gallerySessionReady) {
      Object.assign(state, updateGallery3dState(state, { activeTab: "scene" }));
      exitGallerySession().catch(console.error);
    }
  });

  root.querySelector("#homeBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    await exitGallerySession();
    persistDraft();
    scene?.stop();
    scene?.dispose();
    scene = null;
    navigate("home");
  });

  root.querySelector("#openPhotoBtn")?.addEventListener("click", event => {
    event.preventDefault();
    requestPhotoUpload();
  });

  root.querySelector("#gallery3dGalleryAddPhotoBtn")?.addEventListener("click", event => {
    event.preventDefault();
    requestPhotoUpload();
  });

  imageInput.addEventListener("change", handlePhotoUpload);

  if (state.activeTab === "gallery") {
    await enterGallerySession();
  } else if (state.activeTab === "scene") {
    await rebuildScene();
  } else {
    ui.refreshAll();
  }
}
