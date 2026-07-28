// F8 小行星 - Page Controller v0.1.0
// Topbar + canvas + 三按鈕分頁（投影模式／畫面變形／氛圍光影）。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import {
  clearTinyPlanetDraft,
  createDefaultTinyPlanetState,
  loadTinyPlanetDraft,
  saveTinyPlanetDraft,
  updateTinyPlanetState
} from "./tinyPlanetState.js";
import {
  fileToDataUrl,
  loadImageFromDataUrl,
  renderTinyPlanet,
  resolveOutputSize
} from "./tinyPlanetTool.js";
import {
  renderAtmospherePanel,
  renderControlTabs,
  renderModePanel,
  renderWarpPanel,
  setupTinyPlanetUI
} from "./tinyPlanetUI.js";

export function initTinyPlanetPage(root, shared = {}){
  return renderTinyPlanetPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderTinyPlanetPage(root, navigate){
  const savedState = loadTinyPlanetDraft() || createDefaultTinyPlanetState();

  root.innerHTML = `
    <main class="app-shell page crystal-page tiny-planet-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>小行星</h1>
          <p class="crystal-version" aria-hidden="true">v0.1.0</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap tiny-planet-canvas-wrap" id="canvasWrap">
          <button
            type="button"
            id="resetTinyPlanetSettingsBtn"
            class="crystal-canvas-tool crystal-reset-marker crystal-canvas-tool-left hidden"
            aria-label="重設小行星設定"
            title="重設小行星設定"
          >
            <span class="crystal-reset-marker-icon" aria-hidden="true"></span>
          </button>
          <div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas tiny-planet-canvas"></canvas>
        </div>

        <p class="note hidden" id="tinyPlanetHint">建議使用全景或寬幅風景照片，效果更接近小行星</p>

        <div class="crystal-tab-bar hidden" id="tinyPlanetTabBar" role="tablist" aria-label="小行星功能">
          ${renderControlTabs()}
        </div>

        <div class="crystal-tab-panels hidden" id="tinyPlanetTabPanels">
          <div id="modePanel" class="crystal-tab-panel" role="tabpanel" aria-label="投影模式">
            ${renderModePanel()}
          </div>

          <div id="warpPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="畫面變形">
            ${renderWarpPanel()}
          </div>

          <div id="atmospherePanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="氛圍光影">
            ${renderAtmospherePanel()}
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
    canvasWrap.dataset.orientation = "square";
  };

  const render = async () => {
    if (!sourceImage || !outputSize) return;
    const serial = ++renderSerial;
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    try {
      await renderTinyPlanet(ctx, sourceImage, state);
      if (serial !== renderSerial) return;
    } catch (error) {
      console.error("[F8 小行星] 繪製失敗：", error);
    }
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#tinyPlanetTabBar")?.classList.remove("hidden");
    root.querySelector("#tinyPlanetHint")?.classList.remove("hidden");
    root.querySelector("#resetTinyPlanetSettingsBtn")?.classList.remove("hidden");
    if (!state.activeControlTab) {
      Object.assign(state, updateTinyPlanetState(state, { activeControlTab: "mode" }));
    }
  };

  const persistDraft = () => {
    if (!state.sourceImageDataUrl) return;
    saveTinyPlanetDraft(state);
  };

  const resetEditorSession = () => {
    sourceImage = null;
    outputSize = null;
    Object.assign(state, updateTinyPlanetState(createDefaultTinyPlanetState(), {}));
    root.querySelector("#emptyCanvas")?.classList.remove("hidden");
    canvas.classList.add("hidden");
    root.querySelector("#tinyPlanetTabBar")?.classList.add("hidden");
    root.querySelector("#tinyPlanetTabPanels")?.classList.add("hidden");
    root.querySelector("#tinyPlanetHint")?.classList.add("hidden");
    root.querySelector("#resetTinyPlanetSettingsBtn")?.classList.add("hidden");
    tinyPlanetUi?.refreshAllControls?.();
  };

  const finalizeExportSession = () => {
    clearTinyPlanetDraft();
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
    applyCanvasSize(resolveOutputSize());
    if (statePartial) {
      Object.assign(state, updateTinyPlanetState(state, statePartial));
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
        activeControlTab: "mode"
      });
      if (!applied) return;
      showEditor();
      tinyPlanetUi?.refreshAllControls?.();
      await renderAndPersist();
    } catch (error) {
      console.error(error);
      alert("照片開啟失敗，請換一張圖片再試。");
    } finally {
      imageInput.value = "";
    }
  });

  const tinyPlanetUi = setupTinyPlanetUI(root, state, renderAndPersist, persistDraft);

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

  restoreDraftOnOpen();

  async function restoreDraftOnOpen(){
    if (!state.sourceImageDataUrl) return;
    try {
      const applied = await openPhoto(state.sourceImageDataUrl);
      if (!applied) return;
      showEditor();
      await render();
      tinyPlanetUi?.refreshAllControls?.();
    } catch (error) {
      console.warn("[F8 小行星] 草稿還原失敗：", error);
      clearTinyPlanetDraft();
      resetEditorSession();
    }
  }
}
