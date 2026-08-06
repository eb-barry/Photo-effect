// F9 追焦 - Page Controller v0.1.5
// 方案 A：DeepLab 類別 + U2-Netp 汽車去背 + 背景水平運動模糊。

import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { createProcessingOverlay } from "../F3_magicSky/magicSkyBusy.js";
import {
  clearPanFocusMaskCache,
  ensurePanFocusMask,
  getPanFocusMaskCacheKey,
  preloadPanFocusSegmentModel
} from "./panFocusSegment.js";
import {
  clearPanFocusDraft,
  createDefaultPanFocusState,
  loadPanFocusDraft,
  savePanFocusDraft,
  updatePanFocusState
} from "./panFocusState.js";
import {
  createWorkingSource,
  fileToDataUrl,
  loadImageFromDataUrl,
  renderPanFocus
} from "./panFocusTool.js";
import {
  renderAdjustPanel,
  renderDirectionRow,
  setupPanFocusUI
} from "./panFocusUI.js";

export function initPanFocusPage(root, shared = {}){
  return renderPanFocusPage(root, shared.goHome || shared.navigate || (() => {}));
}

export async function renderPanFocusPage(root, navigate){
  const savedState = loadPanFocusDraft() || createDefaultPanFocusState();

  root.innerHTML = `
    <main class="app-shell page crystal-page pan-focus-page">
      <nav class="topbar crystal-topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}

        <div class="topbar-title">
          <h1>追焦</h1>
          <p class="crystal-version" aria-hidden="true">v0.1.5</p>
        </div>

        <div class="topbar-actions" aria-label="照片操作">
          ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
          ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
          ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
        </div>
      </nav>

      <section class="panel pan-focus-panel">
        <div class="canvas-wrap crystal-canvas-wrap pan-focus-canvas-wrap" id="canvasWrap">
          <button
            type="button"
            id="resetPanFocusSettingsBtn"
            class="crystal-canvas-tool crystal-reset-marker crystal-canvas-tool-left hidden"
            aria-label="重設追焦設定"
            title="重設追焦設定"
          >
            <span class="crystal-reset-marker-icon" aria-hidden="true"></span>
          </button>
          <div class="empty-canvas" id="emptyCanvas">
            請點右上方開啟照片
            <span class="pan-focus-hint">首次需下載 AI 模型（約 7MB），請保持網路連線</span>
          </div>
          <canvas id="editorCanvas" class="hidden crystal-canvas pan-focus-canvas"></canvas>
          <div class="magic-sky-analyzing hidden" id="panFocusProcessingOverlay" role="status" aria-live="polite" aria-busy="false">
            <div class="magic-sky-analyzing-card">
              <div class="magic-sky-analyzing-spinner is-active" id="panFocusProcessingSpinner" aria-hidden="true"></div>
              <p class="magic-sky-analyzing-stage" id="panFocusProcessingStage">請稍候</p>
              <p class="magic-sky-analyzing-detail" id="panFocusProcessingText">處理中，請稍候…</p>
            </div>
          </div>
        </div>

        <p class="note hidden" id="panFocusHint">汽車／機車／自行車與騎士保持清晰。汽車與自行車會再以去背模型精修；若前輪或騎士仍被拖影，可提高「主體擴張」與「主體靈敏度」</p>
        <p class="note pan-focus-status hidden" id="panFocusStatus" role="status"></p>

        <div class="hidden" id="panFocusDirectionBar" aria-label="追焦方向">
          ${renderDirectionRow()}
        </div>

        <div id="panFocusAdjustPanel" class="crystal-tab-panels pan-focus-adjust-panel hidden" aria-label="參數調整">
          ${renderAdjustPanel()}
        </div>
      </section>

      <input id="imageInput" class="file-input-hidden" type="file" accept="image/*" />
    </main>
  `;

  const imageInput = root.querySelector("#imageInput");
  const canvas = root.querySelector("#editorCanvas");
  const canvasWrap = root.querySelector("#canvasWrap");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const statusEl = root.querySelector("#panFocusStatus");
  const processing = createProcessingOverlay(
    root.querySelector("#panFocusProcessingOverlay"),
    root.querySelector("#panFocusProcessingText"),
    {
      spinnerEl: root.querySelector("#panFocusProcessingSpinner"),
      stageEl: root.querySelector("#panFocusProcessingStage")
    }
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
  let openSerial = 0;
  let renderTask = null;
  let panFocusUi = null;

  preloadPanFocusSegmentModel(message => {
    if (processing.isActive()) processing.setMessage(message);
  }).catch(error => {
    console.warn("[F9 追焦] AI 模型預載失敗：", error);
  });

  const applyCanvasSize = size => {
    outputSize = size;
    canvas.width = size.width;
    canvas.height = size.height;
    canvasWrap.style.aspectRatio = `${size.width} / ${size.height}`;
    canvasWrap.dataset.orientation = size.width >= size.height ? "landscape" : "portrait";
  };

  const setStatus = message => {
    if (!statusEl) return;
    if (!message) {
      statusEl.classList.add("hidden");
      statusEl.textContent = "";
      return;
    }
    statusEl.textContent = message;
    statusEl.classList.remove("hidden");
  };

  const describeSubjects = entry => {
    if (!entry?.classCounts) return "";
    const labels = [];
    if (entry.classCounts.car > 0) labels.push(entry.usedMatte && entry.sceneKind === "car" ? "汽車（去背精修）" : "汽車");
    if (entry.classCounts.motorbike > 0) labels.push("機車");
    if (entry.classCounts.bicycle > 0) {
      labels.push(entry.usedMatte && entry.sceneKind === "rider" ? "自行車（去背精修）" : "自行車");
    }
    if (entry.classCounts.bus > 0) labels.push("巴士");
    if (entry.classCounts.person > 0) labels.push("騎士／人物");
    return labels.join("、");
  };

  const ensureMaskForCurrentPhoto = async () => {
    if (!sourceImage || !photoKey) return null;

    const serial = ++analyzeSerial;
    processing.begin("分析主體中…", 0);
    try {
      const reportStage = processing.bindStageStatus();
      const entry = await ensurePanFocusMask(sourceImage, photoKey, {
        subjectThreshold: state.subjectThreshold,
        subjectExpand: state.subjectExpand,
        edgeFeather: Math.max(2, Math.round(Number(state.edgeFeather || 0) * 0.22)),
        onStatus: message => {
          if (serial === analyzeSerial) reportStage(message);
        }
      });
      if (serial !== analyzeSerial) return maskEntry;
      maskEntry = entry;
      Object.assign(state, updatePanFocusState(state, { maskPhotoKey: photoKey }));
      return entry;
    } catch (error) {
      console.error("[F9 追焦] 主體分析失敗：", error);
      if (serial === analyzeSerial) {
        alert("主體分析失敗，請換一張照片或稍後再試。");
      }
      return null;
    } finally {
      if (serial === analyzeSerial) processing.end();
    }
  };

  const renderCore = async () => {
    if (!sourceImage || !outputSize) return;
    const serial = ++renderSerial;
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;

    // Rebuild mask when threshold / expand / feather change (analysis cached).
    if (photoKey) {
      try {
        maskEntry = await ensurePanFocusMask(sourceImage, photoKey, {
          subjectThreshold: state.subjectThreshold,
          subjectExpand: state.subjectExpand,
          edgeFeather: Math.max(2, Math.round(Number(state.edgeFeather || 0) * 0.22))
        });
      } catch (error) {
        console.warn("[F9 追焦] 遮罩更新失敗：", error);
      }
    }

    try {
      const result = await renderPanFocus(ctx, sourceImage, state, maskEntry);
      if (serial !== renderSerial) return;
      if (!result?.applied && result?.reason === "no-subject") {
        setStatus("找不到汽車／機車／自行車／騎士，請換一張主體更清楚的照片，或提高「主體靈敏度」。");
      } else if (result?.applied) {
        const subjects = describeSubjects(maskEntry);
        const directionText = (result.direction || state.panDirection) === "right" ? "向右" : "向左";
        setStatus(subjects
          ? `已套用追焦（${subjects}，${directionText}拖影）`
          : `已套用追焦（${directionText}拖影）`);
      } else {
        setStatus("");
      }
    } catch (error) {
      console.error("[F9 追焦] 繪製失敗：", error);
    }
  };

  const render = () => {
    if (renderTask) return renderTask;
    renderTask = renderCore().finally(() => {
      renderTask = null;
    });
    return renderTask;
  };

  const renderBusy = (message = "合成追焦效果，請稍候…") => {
    if (renderTask) return renderTask;
    renderTask = processing.run(message, renderCore, { delay: 0 }).finally(() => {
      renderTask = null;
    });
    return renderTask;
  };

  const showEditor = () => {
    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#panFocusDirectionBar")?.classList.remove("hidden");
    root.querySelector("#panFocusAdjustPanel")?.classList.remove("hidden");
    root.querySelector("#panFocusHint")?.classList.remove("hidden");
    root.querySelector("#resetPanFocusSettingsBtn")?.classList.remove("hidden");
  };

  const persistDraft = () => {
    if (!state.sourceImageDataUrl) return;
    savePanFocusDraft(state);
  };

  const resetEditorSession = () => {
    sourceImage = null;
    maskEntry = null;
    photoKey = "";
    outputSize = null;
    clearPanFocusMaskCache();
    Object.assign(state, updatePanFocusState(createDefaultPanFocusState(), {}));
    root.querySelector("#emptyCanvas")?.classList.remove("hidden");
    canvas.classList.add("hidden");
    root.querySelector("#panFocusDirectionBar")?.classList.add("hidden");
    root.querySelector("#panFocusAdjustPanel")?.classList.add("hidden");
    root.querySelector("#panFocusHint")?.classList.add("hidden");
    root.querySelector("#resetPanFocusSettingsBtn")?.classList.add("hidden");
    setStatus("");
    panFocusUi?.refreshAllControls?.();
  };

  const finalizeExportSession = () => {
    clearPanFocusDraft();
    resetEditorSession();
  };

  const renderAndPersist = async () => {
    await renderBusy();
    persistDraft();
  };

  const openPhoto = async (dataUrl, statePartial) => {
    const serial = ++openSerial;
    const image = await loadImageFromDataUrl(dataUrl);
    if (serial !== openSerial) return false;
    // Always work on a capped canvas — full camera megapixels freeze / crash mobile.
    const working = createWorkingSource(image);
    if (serial !== openSerial) return false;
    sourceImage = working;
    photoKey = `${getPanFocusMaskCacheKey(dataUrl)}:${working.width}x${working.height}`;
    applyCanvasSize({ width: working.width, height: working.height });
    if (statePartial) {
      Object.assign(state, updatePanFocusState(state, statePartial));
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
        maskPhotoKey: null
      });
      if (!applied) return;
      showEditor();
      panFocusUi?.refreshAllControls?.();
      const mask = await ensureMaskForCurrentPhoto();
      if (!mask) {
        // Still show the original photo so the page never kicks users home.
        await render();
        setStatus("主體分析未完成，可再試一次或換一張照片。");
        persistDraft();
        return;
      }
      await renderAndPersist();
    } catch (error) {
      console.error("[F9 追焦] 開啟照片失敗：", error);
      alert("照片開啟失敗，請換一張圖片再試。");
      // Keep the editor page; do not navigate away.
    } finally {
      imageInput.value = "";
    }
  });

  panFocusUi = setupPanFocusUI(root, state, renderAndPersist, persistDraft);

  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!sourceImage) {
      imageInput.click();
      return;
    }
    try {
      await renderBusy("儲存追焦照片，請稍候…");
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
      await renderBusy("分享追焦照片，請稍候…");
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
      await ensureMaskForCurrentPhoto();
      await render();
      panFocusUi?.refreshAllControls?.();
    } catch (error) {
      console.warn("[F9 追焦] 草稿還原失敗：", error);
      clearPanFocusDraft();
      resetEditorSession();
    }
  }
}
