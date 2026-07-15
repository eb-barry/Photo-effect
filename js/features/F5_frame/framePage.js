// F5 畫框 - Page Controller v0.4.1
// Classic frames + Professional Gallery scene compositing (Layer2 pan/pinch).

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import {
  FRAME_FEATURE_VERSION,
  clearFrameDraft,
  createDefaultFrameState,
  getFirstAvailableFrameType,
  isGalleryMode,
  loadFrameDraft,
  pickDefaultGallerySceneId,
  saveFrameDraft,
  updateFrameState
} from "./frameState.js";
import { loadFrameAssetCatalog } from "./frameAssets.js";
import { loadGalleryWallCatalog } from "./galleryAssets.js";
import {
  fileToDataUrl,
  invalidateFrameLayerCache,
  loadImageFromDataUrl,
  renderFrameStudio,
  resolveContentSize,
  resolveFrameCanvasSize
} from "./frameTool.js";
import {
  renderAdjustControlsPanel,
  renderCategoryScroller,
  setupFrameUI
} from "./frameUI.js";

export function initFramePage(root, shared = {}){
  return renderFramePage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderFramePage(root, navigate){
  const savedState = loadFrameDraft() || createDefaultFrameState();

  root.innerHTML = `
    <main class="app-shell page crystal-page frame-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>畫框</h1>
          <p class="crystal-version" aria-hidden="true">v${FRAME_FEATURE_VERSION}</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap frame-canvas-wrap" id="canvasWrap">
          <button
            type="button"
            id="resetFrameSettingsBtn"
            class="crystal-canvas-tool crystal-reset-marker crystal-canvas-tool-left hidden"
            aria-label="重設畫框設定"
            title="重設畫框設定"
          >
            <span class="crystal-reset-marker-icon" aria-hidden="true"></span>
          </button>
          <div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas frame-canvas"></canvas>
        </div>

        <p class="note hidden" id="galleryGestureHint">拖曳移動作品，雙指縮放大小</p>

        <div class="frame-category-scroller hidden" id="frameCategoryBar" role="tablist" aria-label="畫框分類">
          <div class="frame-category-track" id="frameCategoryTrack">
            ${renderCategoryScroller()}
          </div>
        </div>

        <div id="frameMaterialPanel" class="frame-material-panel hidden" aria-label="畫框材質">
          <div id="frameMaterialHost"></div>
        </div>
        <p class="note hidden" id="frameCategoryNote"></p>
        <div id="galleryWallPanel" class="frame-material-panel hidden" aria-label="照片畫廊">
          <div id="galleryWallHost"></div>
        </div>

        <div class="crystal-tab-panels hidden" id="frameControlsPanel">
          <div class="crystal-tab-panel" role="tabpanel" aria-label="畫框調整">
            ${renderAdjustControlsPanel()}
          </div>
        </div>
      </section>

      <input id="imageInput" class="file-input-hidden" type="file" accept="image/*" />
    </main>
  `;

  const imageInput = root.querySelector("#imageInput");
  const canvas = root.querySelector("#editorCanvas");
  const canvasWrap = root.querySelector("#canvasWrap");
  // Preview path does not read pixels; avoid willReadFrequently (hurts GPU path).
  const ctx = canvas.getContext("2d", { alpha: false });

  const state = {
    ...savedState,
    sourceImageDataUrl: savedState.sourceImageDataUrl || null
  };

  let sourceImage = null;
  let contentSize = null;
  let renderSerial = 0;
  let openSerial = 0;
  let frameUi = null;
  let draftTimer = null;
  let gestureFast = false;

  const applyCanvasSize = size => {
    if (canvas.width === size.width && canvas.height === size.height) return;
    canvas.width = size.width;
    canvas.height = size.height;
    canvasWrap.style.aspectRatio = `${size.width} / ${size.height}`;
    canvasWrap.dataset.orientation = size.width >= size.height ? "landscape" : "portrait";
  };

  const syncCanvasToState = () => {
    if (!contentSize) return;
    const framed = resolveFrameCanvasSize(contentSize, state);
    applyCanvasSize(framed);
  };

  const render = async (options = {}) => {
    if (!sourceImage || !contentSize) return;
    const serial = ++renderSerial;
    syncCanvasToState();
    try {
      await renderFrameStudio(ctx, sourceImage, state, {
        fastPreview: Boolean(options.fastPreview ?? gestureFast)
      });
      if (serial !== renderSerial) return;
      canvas.style.cursor = isGalleryMode(state) ? "grab" : "";
    } catch (error) {
      console.error("[F5 畫框] 繪製失敗：", error);
    }
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#frameCategoryBar")?.classList.remove("hidden");
    root.querySelector("#resetFrameSettingsBtn")?.classList.remove("hidden");
    root.querySelector("#frameControlsPanel")?.classList.remove("hidden");
  };

  const persistDraft = (immediate = false) => {
    if (!state.sourceImageDataUrl) return;
    const flush = () => {
      draftTimer = null;
      saveFrameDraft(state);
    };
    if (immediate) {
      clearTimeout(draftTimer);
      flush();
      return;
    }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flush, 450);
  };

  const renderAndPersist = async () => {
    gestureFast = false;
    await render({ fastPreview: false });
    persistDraft(true);
  };

  const resetEditorSession = () => {
    sourceImage = null;
    contentSize = null;
    invalidateFrameLayerCache();
    Object.assign(state, updateFrameState(createDefaultFrameState(), {}));
    root.querySelector("#emptyCanvas")?.classList.remove("hidden");
    canvas.classList.add("hidden");
    root.querySelector("#frameCategoryBar")?.classList.add("hidden");
    root.querySelector("#frameMaterialPanel")?.classList.add("hidden");
    root.querySelector("#galleryWallPanel")?.classList.add("hidden");
    root.querySelector("#frameControlsPanel")?.classList.add("hidden");
    root.querySelector("#frameCategoryNote")?.classList.add("hidden");
    root.querySelector("#galleryGestureHint")?.classList.add("hidden");
    root.querySelector("#resetFrameSettingsBtn")?.classList.add("hidden");
    frameUi?.refreshAllControls?.();
  };

  const finalizeExportSession = () => {
    clearTimeout(draftTimer);
    clearFrameDraft();
    resetEditorSession();
  };

  const openPhoto = async (dataUrl, statePartial) => {
    const serial = ++openSerial;
    const image = await loadImageFromDataUrl(dataUrl);
    if (serial !== openSerial) return false;
    invalidateFrameLayerCache();
    sourceImage = image;
    contentSize = resolveContentSize(image);
    const sceneId = pickDefaultGallerySceneId(contentSize.width, contentSize.height, statePartial?.gallerySceneId || state.gallerySceneId);
    const patch = {
      ...(statePartial || {}),
      gallerySceneId: sceneId
    };
    Object.assign(state, updateFrameState(state, patch));
    syncCanvasToState();
    return true;
  };

  frameUi = setupFrameUI(root, state, (opts) => {
    if (opts?.fastPreview) gestureFast = true;
    return render(opts || {});
  }, persistDraft, {
    getPhotoSize: () => contentSize || { width: 1200, height: 1600 },
    onGestureStart: () => { gestureFast = true; },
    onGestureEnd: async () => {
      gestureFast = false;
      await render({ fastPreview: false });
      persistDraft(true);
    }
  });

  try {
    await Promise.all([
      loadFrameAssetCatalog(),
      loadGalleryWallCatalog()
    ]);
    if (contentSize) {
      Object.assign(state, updateFrameState(state, {
        gallerySceneId: pickDefaultGallerySceneId(contentSize.width, contentSize.height, state.gallerySceneId)
      }));
    }
    frameUi.refreshAllControls();
  } catch (error) {
    console.warn("[F5 畫框] 素材清單載入失敗：", error);
  }

  root.querySelector("#homeBtn")?.addEventListener("click", event => {
    event.preventDefault();
    persistDraft(true);
    navigate("home");
  });

  root.querySelector("#openPhotoBtn")?.addEventListener("click", event => {
    event.preventDefault();
    imageInput.click();
  });

  imageInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      const first = getFirstAvailableFrameType();
      const applied = await openPhoto(dataUrl, {
        sourceImageDataUrl: dataUrl,
        activeCategory: "classic",
        selectedCategoryId: "classic",
        frameTypeId: first?.id || state.classicFrameTypeId || "wood",
        classicFrameTypeId: first?.id || state.classicFrameTypeId || "wood",
        outerFrameTypeId: first?.id || state.outerFrameTypeId || "wood",
        innerFrameTypeId: state.innerFrameTypeId || null
      });
      if (!applied) return;
      showEditor();
      frameUi?.refreshAllControls?.();
      await renderAndPersist();
    } catch (error) {
      console.error(error);
      alert("照片開啟失敗，請換一張圖片再試。");
    } finally {
      imageInput.value = "";
    }
  });

  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage) {
      imageInput.click();
      return;
    }
    try {
      await render();
      await downloadCanvas(canvas, "image/jpeg", 0.92);
      finalizeExportSession();
    } catch (error) {
      console.error(error);
      alert("儲存失敗，請再試一次。");
    }
  });

  root.querySelector("#sharePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage) {
      imageInput.click();
      return;
    }
    try {
      await render();
      const shared = await shareCanvas(canvas, "image/jpeg", 0.92);
      if (!shared) await downloadCanvas(canvas, "image/jpeg", 0.92);
      finalizeExportSession();
    } catch (error) {
      console.error(error);
      await downloadCanvas(canvas, "image/jpeg", 0.92);
      finalizeExportSession();
    }
  });

  if (state.sourceImageDataUrl) {
    try {
      const applied = await openPhoto(state.sourceImageDataUrl);
      if (applied) {
        showEditor();
        await render();
        frameUi?.refreshAllControls?.();
      }
    } catch (error) {
      console.warn("[F5 畫框] 草稿還原失敗：", error);
      clearFrameDraft();
      resetEditorSession();
    }
  }
}
