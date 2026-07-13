// F5 框住美好 - Page Controller v0.1.3
// Topbar + canvas + 分類開關 + 材質縮圖列（動態讀取全部 .webp）+ 參數下拉／滑桿。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import {
  FRAME_FEATURE_VERSION,
  clearFrameDraft,
  createDefaultFrameState,
  getFirstAvailableFrameType,
  loadFrameDraft,
  saveFrameDraft,
  updateFrameState
} from "./frameState.js";
import { loadFrameAssetCatalog } from "./frameAssets.js";
import {
  fileToDataUrl,
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
          <h1>框住美好</h1>
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

        <div class="frame-category-scroller hidden" id="frameCategoryBar" role="tablist" aria-label="畫框分類">
          <div class="frame-category-track" id="frameCategoryTrack">
            ${renderCategoryScroller()}
          </div>
        </div>

        <div id="frameMaterialPanel" class="frame-material-panel hidden" aria-label="畫框材質">
          <div id="frameMaterialHost"></div>
        </div>
        <p class="note hidden" id="frameCategoryNote"></p>

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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const state = {
    ...savedState,
    sourceImageDataUrl: savedState.sourceImageDataUrl || null
  };

  let sourceImage = null;
  let contentSize = null;
  let renderSerial = 0;
  let openSerial = 0;
  let frameUi = null;

  const applyCanvasSize = size => {
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

  const render = async () => {
    if (!sourceImage || !contentSize) return;
    const serial = ++renderSerial;
    syncCanvasToState();
    try {
      await renderFrameStudio(ctx, sourceImage, state);
      if (serial !== renderSerial) return;
    } catch (error) {
      console.error("[F5 框住美好] 繪製失敗：", error);
    }
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#frameCategoryBar")?.classList.remove("hidden");
    root.querySelector("#resetFrameSettingsBtn")?.classList.remove("hidden");
    root.querySelector("#frameControlsPanel")?.classList.remove("hidden");
  };

  const persistDraft = () => {
    if (!state.sourceImageDataUrl) return;
    saveFrameDraft(state);
  };

  const renderAndPersist = async () => {
    await render();
    persistDraft();
  };

  const resetEditorSession = () => {
    sourceImage = null;
    contentSize = null;
    Object.assign(state, updateFrameState(createDefaultFrameState(), {}));
    root.querySelector("#emptyCanvas")?.classList.remove("hidden");
    canvas.classList.add("hidden");
    root.querySelector("#frameCategoryBar")?.classList.add("hidden");
    root.querySelector("#frameMaterialPanel")?.classList.add("hidden");
    root.querySelector("#frameControlsPanel")?.classList.add("hidden");
    root.querySelector("#frameCategoryNote")?.classList.add("hidden");
    root.querySelector("#resetFrameSettingsBtn")?.classList.add("hidden");
    frameUi?.refreshAllControls?.();
  };

  const finalizeExportSession = () => {
    clearFrameDraft();
    resetEditorSession();
  };

  const openPhoto = async (dataUrl, statePartial) => {
    const serial = ++openSerial;
    const image = await loadImageFromDataUrl(dataUrl);
    if (serial !== openSerial) return false;
    sourceImage = image;
    contentSize = resolveContentSize(image);
    syncCanvasToState();
    if (statePartial) {
      Object.assign(state, updateFrameState(state, statePartial));
    }
    return true;
  };

  frameUi = setupFrameUI(root, state, renderAndPersist, persistDraft);

  // Load all category manifests (auto-synced from *.webp) then refresh thumbs.
  try {
    await loadFrameAssetCatalog();
    Object.assign(state, updateFrameState(state, {}));
    frameUi.refreshAllControls();
  } catch (error) {
    console.warn("[F5 框住美好] 素材清單載入失敗：", error);
  }

  root.querySelector("#homeBtn")?.addEventListener("click", event => {
    event.preventDefault();
    persistDraft();
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
        frameTypeId: first?.id || state.frameTypeId || "wood"
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
      console.warn("[F5 框住美好] 草稿還原失敗：", error);
      clearFrameDraft();
      resetEditorSession();
    }
  }
}
