// F2 水晶球 - Page Controller v0.3.3
// UI follows F1 editor page: topbar, preview panel, controls, one dropdown + one slider.

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
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
import { renderSceneButtons, renderSeatButtons, setupCrystalUI } from "./crystalUI.js";

export function initCrystalBallPage(root, shared = {}){
  return renderCrystalBallPage(root, shared.goHome || shared.navigate || (() => {}));
}

export function renderCrystalBallPage(root, navigate){
  const savedState = loadCrystalDraft() || createDefaultCrystalState();

  root.innerHTML = `
    <main class="app-shell page crystal-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>水晶球</h1>
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
            id="centerPhotoBtn"
            class="crystal-center-marker hidden"
            aria-label="照片置中"
            title="照片置中"
          >
            <span class="crystal-center-marker-dot" aria-hidden="true"></span>
          </button>
          <div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas" width="${CRYSTAL_OUTPUT_WIDTH}" height="${CRYSTAL_OUTPUT_HEIGHT}"></canvas>
        </div>

        <div class="controls crystal-controls hidden" id="controls">
          <div class="selection-row">
            <label for="materialPicker" class="selection-label">選擇素材</label>
            <select id="materialPicker" class="select-control" aria-label="選擇素材"></select>
          </div>

          <div id="sceneAssetGrid" class="crystal-asset-grid" role="group" aria-label="場景背景">
            ${renderSceneButtons()}
          </div>

          <div id="seatAssetGrid" class="crystal-asset-grid hidden" role="group" aria-label="水晶球底座">
            ${renderSeatButtons()}
          </div>

          <div class="selection-row">
            <label for="sliderTarget" class="selection-label">調整項目</label>
            <select id="sliderTarget" class="select-control" aria-label="調整項目"></select>
          </div>

          <div class="slider-row">
            <div class="slider-head">
              <span id="sliderLabel">照片縮放</span>
              <span id="sliderValue">118%</span>
            </div>
            <input id="mainSlider" type="range" />
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
    root.querySelector("#controls")?.classList.remove("hidden");
    root.querySelector("#centerPhotoBtn")?.classList.remove("hidden");
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

  setupCrystalUI(root, state, renderAndPersist);

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
