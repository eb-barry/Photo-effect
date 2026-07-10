// F3 魔法天空 - Page Controller v0.3.0
// 依照片比例輸出 + 處理中提示。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { loadMagicSkyAssetCatalog } from "./magicSkyAssets.js";
import { createProcessingOverlay } from "./magicSkyBusy.js";
import {
  ensureSkyMask,
  getCachedSkyMask,
  getSkyMaskCacheKey,
  preloadSkySegmentModel
} from "./magicSkySegment.js";
import {
  createDefaultMagicSkyState,
  loadMagicSkyDraft,
  saveMagicSkyDraft,
  updateMagicSkyState
} from "./magicSkyState.js";
import {
  fileToDataUrl,
  getPhotoLayout,
  loadImageFromDataUrl,
  renderMagicSky,
  resolveOutputSize
} from "./magicSkyTool.js";
import { mountSkyCarousels, renderAdjustSegmentBar, renderControlTabs, setupMagicSkyUI } from "./magicSkyUI.js";

export function initMagicSkyPage(root, shared = {}){
  return renderMagicSkyPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderMagicSkyPage(root, navigate){
  const savedState = loadMagicSkyDraft() || createDefaultMagicSkyState();

  root.innerHTML = `
    <main class="app-shell page crystal-page magic-sky-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>魔法天空</h1>
          <p class="crystal-version" aria-hidden="true">v0.3.0</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap magic-sky-canvas-wrap" id="canvasWrap">
          <div class="empty-canvas" id="emptyCanvas">
            請點右上方開啟照片
            <span class="magic-sky-hint">首次換天需下載 AI 模型（約 88MB），請保持網路連線</span>
          </div>
          <canvas id="editorCanvas" class="hidden crystal-canvas magic-sky-canvas"></canvas>
          <div class="magic-sky-analyzing hidden" id="skyProcessingOverlay" role="status" aria-live="polite">
            <div class="magic-sky-analyzing-card">
              <p id="skyProcessingText">處理中，請稍候…</p>
            </div>
          </div>
        </div>

        <div class="crystal-tab-bar magic-sky-tab-bar hidden" id="magicSkyTabBar" role="tablist" aria-label="魔法天空功能">
          ${renderControlTabs()}
        </div>

        <div class="crystal-tab-panels hidden" id="magicSkyTabPanels">
          <div id="sunnyPanel" class="crystal-tab-panel" role="tabpanel" aria-label="晴天">
            <div id="sunnyAssetHost"></div>
          </div>

          <div id="nightPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="夜晚">
            <div id="nightAssetHost"></div>
          </div>

          <div id="sunsetPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="夕陽">
            <div id="sunsetAssetHost"></div>
          </div>

          <div id="adjustPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="影像微調">
            ${renderAdjustSegmentBar()}
            <div class="selection-row crystal-adjust-row">
              <label for="sliderTarget" class="selection-label">調整項目</label>
              <select id="sliderTarget" class="select-control" aria-label="調整項目"></select>
            </div>
            <div class="slider-row magic-sky-slider-photo" id="sliderRow">
              <div class="slider-head">
                <span id="sliderLabel">照片 · 曝光</span>
                <span id="sliderValue">0</span>
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
  const canvasWrap = root.querySelector("#canvasWrap");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const processing = createProcessingOverlay(
    root.querySelector("#skyProcessingOverlay"),
    root.querySelector("#skyProcessingText")
  );

  const state = {
    ...savedState,
    sourceImageDataUrl: savedState.sourceImageDataUrl || null
  };

  let sourceImage = null;
  let maskEntry = null;
  let photoKey = "";
  let outputSize = null;
  let renderSerial = 0;
  let analyzeSerial = 0;

  preloadSkySegmentModel().catch(error => {
    console.warn("[F3 魔法天空] AI 模型預載失敗：", error);
  });

  const applyCanvasSize = size => {
    outputSize = size;
    canvas.width = size.width;
    canvas.height = size.height;
    canvasWrap.style.aspectRatio = `${size.width} / ${size.height}`;
    canvasWrap.dataset.orientation = size.width >= size.height ? "landscape" : "portrait";
  };

  const renderCore = async () => {
    if (!sourceImage || !outputSize) return;
    const serial = ++renderSerial;
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    try {
      await renderMagicSky(ctx, sourceImage, state, maskEntry);
      if (serial !== renderSerial) return;
    } catch (error) {
      console.error("[F3 魔法天空] 繪製失敗：", error);
    }
  };

  const render = () => renderCore();

  const renderBusy = (message, options = {}) => processing.run(
    message || "合成天空效果，請稍候…",
    renderCore,
    options
  );

  const ensureMaskForCurrentPhoto = async () => {
    if (!sourceImage || !photoKey) return null;
    const serial = ++analyzeSerial;
    const cached = getCachedSkyMask(photoKey);
    if (cached) {
      maskEntry = cached;
      return cached;
    }

    processing.begin("分析天空中…", 0);
    try {
      const entry = await ensureSkyMask(sourceImage, photoKey, {
        onStatus: message => {
          if (serial === analyzeSerial) processing.setMessage(message);
        }
      });
      if (serial !== analyzeSerial) return maskEntry;
      maskEntry = entry;
      return entry;
    } catch (error) {
      console.error("[F3 魔法天空] 天空分析失敗：", error);
      if (serial === analyzeSerial) {
        alert("天空分析失敗，請換一張照片或稍後再試。");
      }
      return null;
    } finally {
      if (serial === analyzeSerial) processing.end();
    }
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#magicSkyTabBar")?.classList.remove("hidden");
    if (!state.activeControlTab) {
      Object.assign(state, updateMagicSkyState(state, { activeControlTab: "sunny" }));
    }
  };

  const persistDraft = () => {
    saveMagicSkyDraft(state);
  };

  const renderAndPersist = async (message, options) => {
    if (message) await renderBusy(message, options);
    else await render();
    persistDraft();
  };

  const openPhoto = async dataUrl => {
    sourceImage = await loadImageFromDataUrl(dataUrl);
    photoKey = getSkyMaskCacheKey(dataUrl);
    maskEntry = getCachedSkyMask(photoKey);
    applyCanvasSize(resolveOutputSize(sourceImage));
    Object.assign(state, updateMagicSkyState(state, {
      sourceImageDataUrl: dataUrl,
      activeControlTab: "sunny",
      activeSkyCategory: "sunny",
      adjustSegment: "photo",
      selectedParameter: "photoExposure",
      skyOffsetX: 0,
      skyOffsetY: 0
    }));
    showEditor();
    await ensureMaskForCurrentPhoto();
    await renderBusy("合成天空效果，請稍候…", { delay: 0 });
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
      processing.begin("讀取照片中…", 0);
      const dataUrl = await fileToDataUrl(file);
      processing.end();
      await openPhoto(dataUrl);
    } catch (error) {
      console.error(error);
      processing.end();
      alert("照片開啟失敗，請換一張圖片再試。");
    } finally {
      imageInput.value = "";
    }
  });

  try {
    await loadMagicSkyAssetCatalog();
  } catch (error) {
    console.warn("[F3 魔法天空] 素材清單載入失敗，使用預設清單：", error);
  }
  mountSkyCarousels(root);
  setupMagicSkyUI(root, state, {
    render,
    renderBusy,
    persistDraft
  }, {
    canvas,
    getMaskEntry: () => maskEntry,
    getSourceImage: () => sourceImage,
    getPhotoLayout: () => (outputSize ? getPhotoLayout(outputSize.width, outputSize.height) : null)
  });

  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage) {
      imageInput.click();
      return;
    }
    try {
      await renderBusy("準備儲存，請稍候…", { delay: 0 });
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
      await renderBusy("準備分享，請稍候…", { delay: 0 });
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
      await openPhoto(state.sourceImageDataUrl);
    } catch (error) {
      console.warn("[F3 魔法天空] 草稿還原失敗：", error);
    }
  }
}
