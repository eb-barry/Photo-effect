// F2 水晶球 - Page Controller v0.3.8
// Topbar + canvas + 三按鈕分頁 + 橫向滑動素材列。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { loadCrystalAssetCatalog } from "./crystalAssets.js";
import {
  createDefaultCrystalState,
  loadCrystalDraft,
  saveCrystalDraft,
  updateCrystalState
} from "./crystalState.js";
import {
  CRYSTAL_OUTPUT_HEIGHT,
  CRYSTAL_OUTPUT_WIDTH,
  fileToDataUrl,
  loadImageFromDataUrl,
  renderCrystalBall
} from "./crystalTool.js";
import { mountAssetCarousels, renderControlTabs, setupCrystalUI } from "./crystalUI.js";

export function initCrystalBallPage(root, shared = {}){
  return renderCrystalBallPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderCrystalBallPage(root, navigate){
  const savedState = loadCrystalDraft() || createDefaultCrystalState();

  root.innerHTML = `
    <main class="app-shell page crystal-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>水晶球</h1>
          <p class="crystal-version" aria-hidden="true">v0.3.8</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap" id="canvasWrap">
          <button
            type="button"
            id="resetAdjustmentsBtn"
            class="crystal-canvas-tool crystal-reset-marker crystal-canvas-tool-left hidden"
            aria-label="重設調整"
            title="重設調整"
          >
            <span class="crystal-reset-marker-icon" aria-hidden="true"></span>
          </button>
          <button
            type="button"
            id="centerPhotoBtn"
            class="crystal-canvas-tool crystal-center-marker crystal-canvas-tool-right hidden"
            aria-label="照片置中"
            title="照片置中"
          >
            <span class="crystal-center-marker-dot" aria-hidden="true"></span>
          </button>
          <div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas" width="${CRYSTAL_OUTPUT_WIDTH}" height="${CRYSTAL_OUTPUT_HEIGHT}"></canvas>
        </div>

        <div class="crystal-tab-bar hidden" id="crystalTabBar" role="tablist" aria-label="水晶球功能">
          ${renderControlTabs()}
        </div>

        <div class="crystal-tab-panels hidden" id="crystalTabPanels">
          <div id="scenePanel" class="crystal-tab-panel" role="tabpanel" aria-label="場景背景">
            <div id="sceneAssetHost"></div>
          </div>

          <div id="seatPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="水晶球底座">
            <div id="seatAssetHost"></div>
          </div>

          <div id="adjustPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="畫面微調">
            <div class="selection-row crystal-adjust-row">
              <label for="sliderTarget" class="selection-label">調整項目</label>
              <select id="sliderTarget" class="select-control" aria-label="調整項目"></select>
            </div>
            <div class="slider-row" id="sliderRow">
              <div class="slider-head">
                <span id="sliderLabel">照片縮放</span>
                <span id="sliderValue">118%</span>
              </div>
              <input id="mainSlider" type="range" />
            </div>
          </div>
        </div>
      </section>

      <input id="imageInput" class="file-input-hidden" type="file" accept="image/*" />
    </main>
  `;

  const imageInput = root.querySelector("#imageInput");
  const canvas = root.querySelector("#editorCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const state = {
    ...savedState,
    sourceImageDataUrl: savedState.sourceImageDataUrl || null
  };

  let sourceImage = null;
  let renderSerial = 0;

  const render = async () => {
    if (!sourceImage) return;
    const serial = ++renderSerial;
    canvas.width = CRYSTAL_OUTPUT_WIDTH;
    canvas.height = CRYSTAL_OUTPUT_HEIGHT;
    try {
      await renderCrystalBall(ctx, sourceImage, state);
      if (serial !== renderSerial) return;
    } catch (error) {
      console.error("[F2 水晶球] 繪製失敗：", error);
    }
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#crystalTabBar")?.classList.remove("hidden");
    root.querySelector("#centerPhotoBtn")?.classList.remove("hidden");
    root.querySelector("#resetAdjustmentsBtn")?.classList.remove("hidden");
    if (!state.activeControlTab) {
      Object.assign(state, updateCrystalState(state, { activeControlTab: "scene" }));
    }
  };

  const persistDraft = () => {
    saveCrystalDraft(state);
  };

  const renderAndPersist = async () => {
    await render();
    persistDraft();
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
      sourceImage = await loadImageFromDataUrl(dataUrl);
      Object.assign(state, updateCrystalState(state, {
        sourceImageDataUrl: dataUrl,
        activeControlTab: "scene",
        photoOffsetX: 0,
        photoOffsetY: 0,
        photoScale: 118,
        contrast: 108,
        saturation: 112,
        warmth: 8
      }));
      showEditor();
      await renderAndPersist();
    } catch (error) {
      console.error(error);
      alert("照片開啟失敗，請換一張圖片再試。");
    } finally {
      imageInput.value = "";
    }
  });

  try {
    await loadCrystalAssetCatalog();
  } catch (error) {
    console.warn("[F2 水晶球] 素材清單載入失敗，使用預設清單：", error);
  }
  mountAssetCarousels(root);
  setupCrystalUI(root, state, renderAndPersist, persistDraft);

  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage) {
      imageInput.click();
      return;
    }
    try {
      await render();
      await downloadCanvas(canvas, "image/jpeg", 0.92);
      persistDraft();
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
      persistDraft();
    } catch (error) {
      console.error(error);
      await downloadCanvas(canvas, "image/jpeg", 0.92);
    }
  });

  restoreDraftOnOpen();

  async function restoreDraftOnOpen(){
    if (!state.sourceImageDataUrl) return;
    try {
      sourceImage = await loadImageFromDataUrl(state.sourceImageDataUrl);
      showEditor();
      await render();
    } catch (error) {
      console.warn("[F2 水晶球] 草稿還原失敗：", error);
    }
  }
}
