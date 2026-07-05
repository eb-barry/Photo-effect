import { CanvasManager } from "../../core/canvasManager.js";
import { loadImageFromFile } from "../../core/imageLoader.js";
import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { MirrorTool } from "./mirrorTool.js";
import { setupMirrorUI } from "./mirrorUI.js";
import { loadMirrorState, saveMirrorState } from "./mirrorState.js";

export function renderMirrorPage(root, navigate){
  const savedState = loadMirrorState();
  root.innerHTML = `<main class="app-shell page"><nav class="topbar mirror-topbar">${iconButton({ icon:"home", label:"首頁", id:"homeBtn", className:"feature-home" })}<div class="topbar-title"><h1>鏡像</h1></div><div class="topbar-actions" aria-label="照片操作">${iconButton({ icon:"openPhoto", label:"開啟照片", id:"openPhotoBtn" })}${iconButton({ icon:"savePhoto", label:"儲存照片", id:"savePhotoBtn" })}${iconButton({ icon:"sharePhoto", label:"分享照片", id:"sharePhotoBtn" })}</div></nav><section class="panel"><div class="canvas-wrap" id="canvasWrap"><div class="empty-canvas" id="emptyCanvas">請點右上方開啟照片</div><canvas id="editorCanvas" class="hidden"></canvas></div><div class="controls hidden" id="controls"><div class="segment mirror-mode-row" role="group" aria-label="鏡像模式"><button type="button" data-mode="horizontal">左右鏡像</button><button type="button" data-mode="vertical">上下鏡像</button><button type="button" data-mode="water">水波倒影</button></div><div class="selection-row"><label for="sliderTarget" class="selection-label">調整項目</label><select id="sliderTarget" class="select-control" aria-label="調整項目"></select></div><div class="slider-row"><div class="slider-head"><span id="sliderLabel">移動右(下)圖</span><span id="sliderValue">0%</span></div><input id="mainSlider" type="range" /></div></div></section><input id="imageInput" class="file-input-hidden" type="file" accept="image/*" /></main>`;
  const imageInput = root.querySelector("#imageInput");
  const canvas = root.querySelector("#editorCanvas");
  const canvasManager = new CanvasManager(canvas);
  const mirrorTool = new MirrorTool(canvasManager);
  const state = { source:null, mode:savedState.mode, leftOffset:savedState.leftOffset, rightOffset:savedState.rightOffset, opacity:savedState.opacity, ripple:savedState.ripple, density:savedState.density, sliderTarget:savedState.sliderTarget, showGuide:true };
  const render = (showGuide = true) => { if (!state.source) return; state.showGuide = showGuide; mirrorTool.render(state.source.imageCanvas, state); };
  root.querySelector("#homeBtn")?.addEventListener("click", event => { event.preventDefault(); saveMirrorState(state); navigate("home"); });
  root.querySelector("#openPhotoBtn")?.addEventListener("click", event => { event.preventDefault(); imageInput.click(); });
  imageInput.addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { state.source = await loadImageFromFile(file); root.querySelector("#emptyCanvas")?.classList.add("hidden"); canvas.classList.remove("hidden"); root.querySelector("#controls")?.classList.remove("hidden"); render(true); saveMirrorState(state); }
    catch (error) { console.error(error); alert("照片開啟失敗，請換一張圖片再試。"); }
  });
  setupMirrorUI(root, state, () => { render(true); saveMirrorState(state); });
  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => { event.preventDefault(); if (!state.source) { imageInput.click(); return; } try { render(false); await downloadCanvas(canvas, "image/jpeg", 0.92); render(true); saveMirrorState(state); } catch (error) { console.error(error); alert("儲存失敗，請再試一次。"); render(true); } });
  root.querySelector("#sharePhotoBtn")?.addEventListener("click", async event => { event.preventDefault(); if (!state.source) { imageInput.click(); return; } try { render(false); const shared = await shareCanvas(canvas, "image/jpeg", 0.92); render(true); if (!shared) await downloadCanvas(canvas, "image/jpeg", 0.92); saveMirrorState(state); } catch (error) { console.error(error); render(true); await downloadCanvas(canvas, "image/jpeg", 0.92); } });
}
