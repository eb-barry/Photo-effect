// F4 星芒鏡 - Page Controller v0.1.4
// Topbar + canvas + 三按鈕分頁（光圈葉片／光源／星芒效果）+ 點選/拖曳定位星芒。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import {
  clearStarburstDraft,
  createDefaultStarburstState,
  loadStarburstDraft,
  saveStarburstDraft,
  updateStarburstState
} from "./starburstState.js";
import {
  fileToDataUrl,
  loadImageFromDataUrl,
  renderStarburstLens,
  resolveOutputSize
} from "./starburstTool.js";
import { renderAperturePanel, renderControlTabs, renderEffectPanel, renderLightPanel, setupStarburstUI } from "./starburstUI.js";

export function initStarburstPage(root, shared = {}){
  return renderStarburstPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderStarburstPage(root, navigate){
  const savedState = loadStarburstDraft() || createDefaultStarburstState();

  root.innerHTML = `
    <main class="app-shell page crystal-page starburst-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>星芒鏡</h1>
          <p class="crystal-version" aria-hidden="true">v0.1.4</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap starburst-canvas-wrap" id="canvasWrap">
          <button
            type="button"
            id="resetStarburstSettingsBtn"
            class="crystal-canvas-tool crystal-reset-marker crystal-canvas-tool-left hidden"
            aria-label="重設星芒設定"
            title="重設星芒設定"
          >
            <span class="crystal-reset-marker-icon" aria-hidden="true"></span>
          </button>
          <button
            type="button"
            id="resetStarburstPositionBtn"
            class="crystal-canvas-tool crystal-center-marker crystal-canvas-tool-right hidden"
            aria-label="重設星芒位置"
            title="重設星芒位置"
          >
            <span class="crystal-center-marker-dot" aria-hidden="true"></span>
          </button>
          <div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas starburst-canvas"></canvas>
        </div>

        <p class="note hidden" id="starburstHint">點一下畫面即可放置星芒，按住拖曳可移動位置</p>

        <div class="crystal-tab-bar hidden" id="starburstTabBar" role="tablist" aria-label="星芒鏡功能">
          ${renderControlTabs()}
        </div>

        <div class="crystal-tab-panels hidden" id="starburstTabPanels">
          <div id="aperturePanel" class="crystal-tab-panel" role="tabpanel" aria-label="光圈葉片">
            ${renderAperturePanel()}
          </div>

          <div id="lightPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="光源">
            ${renderLightPanel()}
          </div>

          <div id="effectPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="星芒效果">
            ${renderEffectPanel()}
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
  let outputSize = null;
  let renderSerial = 0;
  let openSerial = 0;

  const applyCanvasSize = size => {
    outputSize = size;
    canvas.width = size.width;
    canvas.height = size.height;
    canvasWrap.style.aspectRatio = `${size.width} / ${size.height}`;
    canvasWrap.dataset.orientation = size.width >= size.height ? "landscape" : "portrait";
  };

  const render = async (options = {}) => {
    if (!sourceImage || !outputSize) return;
    const serial = ++renderSerial;
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    try {
      await renderStarburstLens(ctx, sourceImage, state, options);
      if (serial !== renderSerial) return;
    } catch (error) {
      console.error("[F4 星芒鏡] 繪製失敗：", error);
    }
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#starburstTabBar")?.classList.remove("hidden");
    root.querySelector("#starburstHint")?.classList.remove("hidden");
    root.querySelector("#resetStarburstSettingsBtn")?.classList.remove("hidden");
    root.querySelector("#resetStarburstPositionBtn")?.classList.remove("hidden");
    if (!state.activeControlTab) {
      Object.assign(state, updateStarburstState(state, { activeControlTab: "aperture" }));
    }
  };

  const persistDraft = () => {
    if (!state.sourceImageDataUrl) return;
    saveStarburstDraft(state);
  };

  const resetEditorSession = () => {
    sourceImage = null;
    outputSize = null;
    Object.assign(state, updateStarburstState(createDefaultStarburstState(), {}));
    root.querySelector("#emptyCanvas")?.classList.remove("hidden");
    canvas.classList.add("hidden");
    root.querySelector("#starburstTabBar")?.classList.add("hidden");
    root.querySelector("#starburstTabPanels")?.classList.add("hidden");
    root.querySelector("#starburstHint")?.classList.add("hidden");
    root.querySelector("#resetStarburstSettingsBtn")?.classList.add("hidden");
    root.querySelector("#resetStarburstPositionBtn")?.classList.add("hidden");
    starburstUi?.refreshAllControls?.();
  };

  const finalizeExportSession = () => {
    clearStarburstDraft();
    resetEditorSession();
  };

  const renderAndPersist = async () => {
    await render();
    persistDraft();
  };

  const openPhoto = async (dataUrl, statePartial) => {
    const serial = ++openSerial;
    const image = await loadImageFromDataUrl(dataUrl);
    if (serial !== openSerial) return false;
    sourceImage = image;
    applyCanvasSize(resolveOutputSize(image));
    if (statePartial) {
      Object.assign(state, updateStarburstState(state, statePartial));
    }
    return true;
  };

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
      const applied = await openPhoto(dataUrl, {
        sourceImageDataUrl: dataUrl,
        activeControlTab: "aperture",
        starburstX: createDefaultStarburstState().starburstX,
        starburstY: createDefaultStarburstState().starburstY,
        hasPlacedPoint: true
      });
      if (!applied) return;
      showEditor();
      starburstUi?.refreshAllControls?.();
      await renderAndPersist();
    } catch (error) {
      console.error(error);
      alert("照片開啟失敗，請換一張圖片再試。");
    } finally {
      imageInput.value = "";
    }
  });

  const starburstUi = setupStarburstUI(root, state, renderAndPersist, persistDraft);

  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage) {
      imageInput.click();
      return;
    }
    try {
      await render({ showMarker: false });
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
      await render({ showMarker: false });
      const shared = await shareCanvas(canvas, "image/jpeg", 0.92);
      if (!shared) await downloadCanvas(canvas, "image/jpeg", 0.92);
      finalizeExportSession();
    } catch (error) {
      console.error(error);
      await downloadCanvas(canvas, "image/jpeg", 0.92);
      finalizeExportSession();
    }
  });

  restoreDraftOnOpen();

  async function restoreDraftOnOpen(){
    if (!state.sourceImageDataUrl) return;
    try {
      const applied = await openPhoto(state.sourceImageDataUrl);
      if (!applied) return;
      showEditor();
      await render();
      starburstUi?.refreshAllControls?.();
    } catch (error) {
      console.warn("[F4 星芒鏡] 草稿還原失敗：", error);
      clearStarburstDraft();
      resetEditorSession();
    }
  }
}
