// F3 魔法天空 - Page Controller v0.2.0
// Topbar + canvas + AI 天空分割 + 天空替換 + 四按鈕分頁。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { loadMagicSkyAssetCatalog } from "./magicSkyAssets.js";
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
  MAGIC_SKY_OUTPUT_HEIGHT,
  MAGIC_SKY_OUTPUT_WIDTH,
  fileToDataUrl,
  getPhotoLayout,
  loadImageFromDataUrl,
  renderMagicSky
} from "./magicSkyTool.js";
import { mountSkyCarousels, renderControlTabs, setupMagicSkyUI } from "./magicSkyUI.js";

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
          <p class="crystal-version" aria-hidden="true">v0.2.0</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap crystal-canvas-wrap" id="canvasWrap">
          <div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div>
          <canvas id="editorCanvas" class="hidden crystal-canvas" width="${MAGIC_SKY_OUTPUT_WIDTH}" height="${MAGIC_SKY_OUTPUT_HEIGHT}"></canvas>
          <div class="magic-sky-analyzing hidden" id="skyAnalyzingOverlay" role="status" aria-live="polite">
            <div class="magic-sky-analyzing-card">
              <p id="skyAnalyzingText">分析天空中…</p>
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
            <div class="selection-row crystal-adjust-row">
              <label for="sliderTarget" class="selection-label">調整項目</label>
              <select id="sliderTarget" class="select-control" aria-label="調整項目"></select>
            </div>
            <div class="slider-row" id="sliderRow">
              <div class="slider-head">
                <span id="sliderLabel">天空透明度</span>
                <span id="sliderValue">100%</span>
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
  const analyzingOverlay = root.querySelector("#skyAnalyzingOverlay");
  const analyzingText = root.querySelector("#skyAnalyzingText");

  const state = {
    ...savedState,
    sourceImageDataUrl: savedState.sourceImageDataUrl || null
  };

  let sourceImage = null;
  let maskEntry = null;
  let photoKey = "";
  let renderSerial = 0;
  let analyzeSerial = 0;

  preloadSkySegmentModel().catch(error => {
    console.warn("[F3 魔法天空] AI 模型預載失敗：", error);
  });

  const setAnalyzing = (visible, message = "分析天空中…") => {
    analyzingText.textContent = message;
    analyzingOverlay?.classList.toggle("hidden", !visible);
  };

  const ensureMaskForCurrentPhoto = async () => {
    if (!sourceImage || !photoKey) return null;
    const serial = ++analyzeSerial;
    const cached = getCachedSkyMask(photoKey);
    if (cached) {
      maskEntry = cached;
      return cached;
    }

    setAnalyzing(true, "分析天空中…");
    try {
      const entry = await ensureSkyMask(sourceImage, photoKey, {
        onStatus: message => {
          if (serial === analyzeSerial) setAnalyzing(true, message);
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
      if (serial === analyzeSerial) setAnalyzing(false);
    }
  };

  const render = async () => {
    if (!sourceImage) return;
    const serial = ++renderSerial;
    canvas.width = MAGIC_SKY_OUTPUT_WIDTH;
    canvas.height = MAGIC_SKY_OUTPUT_HEIGHT;
    try {
      await renderMagicSky(ctx, sourceImage, state, maskEntry);
      if (serial !== renderSerial) return;
    } catch (error) {
      console.error("[F3 魔法天空] 繪製失敗：", error);
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

  const renderAndPersist = async () => {
    await render();
    persistDraft();
  };

  const openPhoto = async dataUrl => {
    sourceImage = await loadImageFromDataUrl(dataUrl);
    photoKey = getSkyMaskCacheKey(dataUrl);
    maskEntry = getCachedSkyMask(photoKey);
    Object.assign(state, updateMagicSkyState(state, {
      sourceImageDataUrl: dataUrl,
      activeControlTab: "sunny",
      activeSkyCategory: "sunny",
      skyOffsetX: 0,
      skyOffsetY: 0
    }));
    showEditor();
    await ensureMaskForCurrentPhoto();
    await renderAndPersist();
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
      await openPhoto(dataUrl);
    } catch (error) {
      console.error(error);
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
  setupMagicSkyUI(root, state, renderAndPersist, persistDraft, {
    canvas,
    getMaskEntry: () => maskEntry,
    getSourceImage: () => sourceImage,
    getPhotoLayout: () => (sourceImage ? getPhotoLayout(sourceImage) : null)
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
      await openPhoto(state.sourceImageDataUrl);
    } catch (error) {
      console.warn("[F3 魔法天空] 草稿還原失敗：", error);
    }
  }
}
