import { CanvasManager } from "../../core/canvasManager.js";
import { loadImageFromFile } from "../../core/imageLoader.js";
import { downloadCanvas, shareCanvas } from "../../core/exportManager.js";
import { iconButton } from "../../core/iconLoader.js";
import { MirrorTool } from "./mirrorTool.js";
import { setupMirrorUI } from "./mirrorUI.js";

export function renderMirrorPage(root, navigate){
  root.innerHTML = `
    <main class="app-shell page">
      <nav class="topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}
        <div class="topbar-title"><h1>鏡像</h1></div>
      </nav>

      <section class="panel">
        <div class="canvas-wrap" id="canvasWrap">
          <div class="empty-canvas" id="emptyCanvas">請由下方開啟照片</div>
          <canvas id="editorCanvas" class="hidden"></canvas>
        </div>

        <div class="controls hidden" id="controls">
          <div class="segment" role="group" aria-label="鏡像模式">
            <button type="button" data-mode="horizontal">左右鏡像</button>
            <button type="button" data-mode="vertical">上下鏡像</button>
            <button type="button" data-mode="reflection">倒影鏡像</button>
            <button type="button" data-mode="water">水波倒影</button>
          </div>

          <select id="sliderTarget" class="select-control" aria-label="調整項目">
            <option value="rightOffset">鏡像位置（可移動右邊圖）</option>
            <option value="leftOffset">鏡像位置（可移動左邊圖）</option>
            <option value="blend">融合程度</option>
            <option value="ripple">水波強度</option>
            <option value="density">水波密度</option>
          </select>

          <div class="slider-row">
            <div class="slider-head">
              <span id="sliderLabel">鏡像位置（可移動右邊圖）</span>
              <span id="sliderValue">0</span>
            </div>
            <input id="mainSlider" type="range" />
          </div>
        </div>
      </section>

      <div class="bottom-toolbar">
        ${iconButton({ icon: "openPhoto", label: "開啟照片", id: "openPhotoBtn" })}
        ${iconButton({ icon: "savePhoto", label: "儲存照片", id: "savePhotoBtn" })}
        ${iconButton({ icon: "sharePhoto", label: "分享照片", id: "sharePhotoBtn" })}
      </div>

      <input id="imageInput" class="file-input-hidden" type="file" accept="image/*" />
    </main>
  `;

  root.querySelector("#homeBtn")?.addEventListener("click", event => {
    event.preventDefault();
    navigate("home");
  });

  const canvas = root.querySelector("#editorCanvas");
  const canvasManager = new CanvasManager(canvas);
  const mirrorTool = new MirrorTool(canvasManager);

  const state = {
    source: null,
    mode: "water",
    leftOffset: 0,
    rightOffset: 0,
    blend: 75,
    ripple: 18,
    density: 24,
    showGuide: true
  };

  const render = (showGuide = true) => {
    if (!state.source) return;
    state.showGuide = showGuide;
    mirrorTool.render(state.source.imageCanvas, state);
  };

  const imageInput = root.querySelector("#imageInput");

  root.querySelector("#openPhotoBtn")?.addEventListener("click", event => {
    event.preventDefault();
    imageInput.click();
  });

  imageInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    state.source = await loadImageFromFile(file);

    root.querySelector("#emptyCanvas")?.classList.add("hidden");
    canvas.classList.remove("hidden");
    root.querySelector("#controls")?.classList.remove("hidden");

    render(true);
  });

  setupMirrorUI(root, state, render);

  root.querySelector("#savePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!state.source) {
      imageInput.click();
      return;
    }
    render(false);
    await downloadCanvas(canvas, "image/jpeg", 0.92);
    render(true);
  });

  root.querySelector("#sharePhotoBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    if (!state.source) {
      imageInput.click();
      return;
    }
    render(false);
    const shared = await shareCanvas(canvas, "image/jpeg", 0.92).catch(() => false);
    if (!shared) await downloadCanvas(canvas, "image/jpeg", 0.92);
    render(true);
  });
}
