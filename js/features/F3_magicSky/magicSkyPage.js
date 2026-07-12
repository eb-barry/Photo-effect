// F3 魔法天空 - Page Controller v0.7.0
// 三按鈕分頁 + 遮罩上傳後固定 + iOS 拖曳鎖定。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { loadMagicSkyAssetCatalog } from "./magicSkyAssets.js";
import { createProcessingOverlay } from "./magicSkyBusy.js";
import {
  clearSamEmbedding,
  clearSamRepairMask,
  ensureSamEmbedding,
  getSamRepairMask,
  setSamRepairMask
} from "./magicSkySam.js";
import {
  analyzeRepairRegions,
  buildRepairMaskCanvas,
  renderRepairRegionMarkers
} from "./magicSkyRepairRegions.js";
import {
  ensureSkyMask,
  getCachedSkyMask,
  getSkyMaskCacheKey,
  preloadSkySegmentModel,
  releaseSkySegmentSession
} from "./magicSkySegment.js";
import {
  clearMagicSkyDraft,
  createDefaultMagicSkyState,
  getDefaultAdjustmentState,
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
import {
  mountSkyCarousel,
  renderAdjustControls,
  renderControlTabs,
  renderRepairControls,
  renderSkyCategoryBar,
  setupMagicSkyUI
} from "./magicSkyUI.js";

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
          <p class="crystal-version" aria-hidden="true">v0.7.0</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel magic-sky-panel">
        <div class="canvas-wrap crystal-canvas-wrap magic-sky-canvas-wrap" id="canvasWrap">
          <div class="empty-canvas" id="emptyCanvas">
            請點右上方開啟照片
            <span class="magic-sky-hint">首次換天需下載 AI 模型（約 88MB），請保持網路連線</span>
          </div>
          <canvas id="editorCanvas" class="hidden crystal-canvas magic-sky-canvas"></canvas>
          <div id="repairRegionMarkers" class="magic-sky-repair-markers hidden" aria-hidden="true"></div>
          <div class="magic-sky-analyzing hidden" id="skyProcessingOverlay" role="status" aria-live="polite" aria-busy="false">
            <div class="magic-sky-analyzing-card">
              <div class="magic-sky-analyzing-spinner is-active" id="skyProcessingSpinner" aria-hidden="true"></div>
              <p class="magic-sky-analyzing-stage" id="skyProcessingStage">請稍候</p>
              <p class="magic-sky-analyzing-detail" id="skyProcessingText">處理中，請稍候…</p>
            </div>
          </div>
        </div>

        <div class="crystal-tab-bar magic-sky-tab-bar hidden" id="magicSkyTabBar" role="tablist" aria-label="魔法天空功能">
          ${renderControlTabs()}
        </div>

        <div class="crystal-tab-panels hidden" id="magicSkyTabPanels">
          <div id="skyPanel" class="crystal-tab-panel" role="tabpanel" aria-label="天空">
            ${renderSkyCategoryBar()}
            <div id="skyAssetHost"></div>
          </div>

          <div id="adjustControlsPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="影像微調">
            ${renderAdjustControls()}
          </div>

          <div id="repairPanel" class="crystal-tab-panel hidden" role="tabpanel" aria-label="區域修復">
            ${renderRepairControls()}
          </div>
        </div>
      </section>

      <input id="imageInput" class="file-input-hidden" type="file" accept="image/*" />
    </main>
  `;

  const imageInput = root.querySelector("#imageInput");
  const canvas = root.querySelector("#editorCanvas");
  const canvasWrap = root.querySelector("#canvasWrap");
  const repairRegionMarkers = root.querySelector("#repairRegionMarkers");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const processing = createProcessingOverlay(
    root.querySelector("#skyProcessingOverlay"),
    root.querySelector("#skyProcessingText"),
    {
      spinnerEl: root.querySelector("#skyProcessingSpinner"),
      stageEl: root.querySelector("#skyProcessingStage")
    }
  );

  const state = {
    ...savedState,
    sourceImageDataUrl: savedState.sourceImageDataUrl || null
  };

  let sourceImage = null;
  let maskEntry = null;
  let samEntry = null;
  let repairRegions = [];
  const selectedRepairRegionIds = new Set();
  let photoKey = "";
  let outputSize = null;
  let renderSerial = 0;
  let analyzeSerial = 0;
  let renderTask = null;
  let magicSkyUi = null;

  const updateRepairMarkers = (regions, selectedIds) => {
    if (!outputSize) return;
    const layout = getPhotoLayout(outputSize.width, outputSize.height);
    renderRepairRegionMarkers(repairRegionMarkers, regions, selectedIds, canvas, layout);
  };

  const applyRepairSelection = () => {
    if (!photoKey || !outputSize) return;
    const maskCanvas = buildRepairMaskCanvas(
      repairRegions,
      selectedRepairRegionIds,
      outputSize.width,
      outputSize.height
    );
    setSamRepairMask(photoKey, maskCanvas);
  };

  const scanRepairRegions = async () => {
    if (!sourceImage || !photoKey || !maskEntry) return;
    const reportStage = processing.bindStageStatus();
    if (!samEntry) {
      await releaseSkySegmentSession();
      samEntry = await ensureSamEmbedding(sourceImage, photoKey, reportStage);
    }
    repairRegions = await analyzeRepairRegions(maskEntry, sourceImage, samEntry, reportStage);
    selectedRepairRegionIds.clear();
    magicSkyUi?.refreshRepairRegions?.(repairRegions, selectedRepairRegionIds);
    applyRepairSelection();
  };

  preloadSkySegmentModel(message => {
    if (processing.isActive()) processing.setMessage(message);
  }).catch(error => {
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
      await renderMagicSky(ctx, sourceImage, state, maskEntry, getSamRepairMask(photoKey));
      if (serial !== renderSerial) return;
      if (state.activeControlTab === "repair" && repairRegions.length) {
        updateRepairMarkers(repairRegions, selectedRepairRegionIds);
      }
    } catch (error) {
      console.error("[F3 魔法天空] 繪製失敗：", error);
    }
  };

  const render = () => renderCore();

  const renderBusy = (message, options = {}) => {
    if (renderTask) return renderTask;
    renderTask = processing.run(
      message || "合成天空效果，請稍候…",
      renderCore,
      { delay: options.delay ?? 0 }
    ).finally(() => {
      renderTask = null;
    });
    return renderTask;
  };

  const isSessionBusy = () => Boolean(renderTask) || processing.isActive();

  const ensureMaskForCurrentPhoto = async () => {
    if (!sourceImage || !photoKey) return null;

    const cached = getCachedSkyMask(photoKey);
    if (cached && state.maskPhotoKey === photoKey) {
      maskEntry = cached;
      return cached;
    }
    if (cached) {
      maskEntry = cached;
      Object.assign(state, updateMagicSkyState(state, { maskPhotoKey: photoKey }));
      return cached;
    }

    const serial = ++analyzeSerial;
    processing.begin("分析天空中…", 0);
    try {
      const reportStage = processing.bindStageStatus();
      const entry = await ensureSkyMask(sourceImage, photoKey, {
        onStatus: message => {
          if (serial === analyzeSerial) reportStage(message);
        }
      });
      if (serial !== analyzeSerial) return maskEntry;
      maskEntry = entry;
      Object.assign(state, updateMagicSkyState(state, { maskPhotoKey: photoKey }));
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
    root.querySelector("#magicSkyTabPanels")?.classList.remove("hidden");
    if (!state.activeControlTab) {
      Object.assign(state, updateMagicSkyState(state, { activeControlTab: "sky" }));
    }
  };

  const persistDraft = () => {
    if (!state.sourceImageDataUrl) return;
    saveMagicSkyDraft(state);
  };

  const resetEditorSession = () => {
    sourceImage = null;
    maskEntry = null;
    samEntry = null;
    repairRegions = [];
    selectedRepairRegionIds.clear();
    repairRegionMarkers?.classList.add("hidden");
    if (photoKey) {
      clearSamRepairMask(photoKey);
      clearSamEmbedding(photoKey);
    }
    photoKey = "";
    outputSize = null;
    Object.assign(state, updateMagicSkyState(createDefaultMagicSkyState(), {}));
    root.querySelector("#emptyCanvas")?.classList.remove("hidden");
    canvas.classList.add("hidden");
    root.querySelector("#magicSkyTabBar")?.classList.add("hidden");
    root.querySelector("#magicSkyTabPanels")?.classList.add("hidden");
    magicSkyUi?.refreshAllControls?.();
  };

  const finalizeExportSession = () => {
    clearMagicSkyDraft();
    resetEditorSession();
  };

  const openPhoto = async dataUrl => {
    const nextPhotoKey = getSkyMaskCacheKey(dataUrl);
    const isNewPhoto = nextPhotoKey !== photoKey;

    sourceImage = await loadImageFromDataUrl(dataUrl);
    photoKey = nextPhotoKey;
    maskEntry = getCachedSkyMask(photoKey);
    applyCanvasSize(resolveOutputSize(sourceImage));

    const partial = {
      sourceImageDataUrl: dataUrl,
      activeControlTab: "sky",
      activeSkyCategory: state.activeSkyCategory || "sunny"
    };

    if (isNewPhoto) {
      if (photoKey) {
        clearSamRepairMask(photoKey);
        clearSamEmbedding(photoKey);
      }
      samEntry = null;
      repairRegions = [];
      selectedRepairRegionIds.clear();
      Object.assign(partial, {
        ...getDefaultAdjustmentState(),
        maskPhotoKey: maskEntry ? photoKey : null
      });
    }

    Object.assign(state, updateMagicSkyState(state, partial));
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

  mountSkyCarousel(root, state.activeSkyCategory);
  magicSkyUi = setupMagicSkyUI(root, state, {
    render,
    renderBusy,
    persistDraft,
    isBusy: isSessionBusy,
    onEnterRepairTab: async () => {
      if (!sourceImage || !photoKey) return;
      try {
        await processing.run("SAM 分割區塊中…", async () => {
          await scanRepairRegions();
          await renderCore();
        }, { delay: 0 });
      } catch (error) {
        console.error("[F3 魔法天空] 修復區域分析失敗：", error);
        const detail = error?.message ? `\n\n${error.message}` : "";
        alert(`修復區域分析失敗，請確認網路後再試。${detail}`);
      }
    },
    onRepairRegionToggle: async regionId => {
      if (!sourceImage || !photoKey || !outputSize || !String(regionId).startsWith("sky-")) return;
      if (selectedRepairRegionIds.has(regionId)) selectedRepairRegionIds.delete(regionId);
      else selectedRepairRegionIds.add(regionId);
      applyRepairSelection();
      magicSkyUi?.refreshRepairRegions?.(repairRegions, selectedRepairRegionIds);
      await renderBusy("套用修復區域…", { delay: 0 });
    },
    onRepairMarkersUpdate: updateRepairMarkers
  }, {
    canvas,
    canvasWrap,
    getMaskEntry: () => maskEntry,
    getSourceImage: () => sourceImage,
    getPhotoLayout: () => (outputSize ? getPhotoLayout(outputSize.width, outputSize.height) : null)
  });

  root.querySelector("#rescanRepairBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage || !photoKey) return;
    try {
      await processing.run("重新分析候選區域…", async () => {
        await scanRepairRegions();
        await renderCore();
      }, { delay: 0 });
    } catch (error) {
      console.error("[F3 魔法天空] 重新分析失敗：", error);
      alert("重新分析失敗，請再試一次。");
    }
  });

  root.querySelector("#clearRepairBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!photoKey) return;
    clearSamRepairMask(photoKey);
    selectedRepairRegionIds.clear();
    magicSkyUi?.refreshRepairRegions?.(repairRegions, selectedRepairRegionIds);
    await renderBusy("更新預覽…", { delay: 0 });
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
      await renderBusy("準備分享，請稍候…", { delay: 0 });
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
      photoKey = getSkyMaskCacheKey(state.sourceImageDataUrl);
      sourceImage = await loadImageFromDataUrl(state.sourceImageDataUrl);
      maskEntry = getCachedSkyMask(photoKey);
      applyCanvasSize(resolveOutputSize(sourceImage));
      showEditor();
      await ensureMaskForCurrentPhoto();
      await renderBusy("還原上次編輯，請稍候…", { delay: 0 });
      magicSkyUi?.refreshAllControls?.();
    } catch (error) {
      console.warn("[F3 魔法天空] 草稿還原失敗：", error);
      clearMagicSkyDraft();
      resetEditorSession();
    }
  }
}
