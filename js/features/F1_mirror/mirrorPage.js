import { CanvasManager } from "../../core/canvasManager.js";
import { loadImageFromFile } from "../../core/imageLoader.js";
import { downloadCanvas } from "../../core/exportManager.js";
import { MirrorTool } from "./mirrorTool.js";
import { setupMirrorUI } from "./mirrorUI.js";

export function renderMirrorPage(root, navigate){
  root.innerHTML = `
    <main class="app-shell page">
      <nav class="topbar">
        <button class="back-button" id="backHome">首頁</button>
        <div class="topbar-title">
          <h1>鏡像</h1>
          <p>水平、垂直、倒影與水波鏡像</p>
        </div>
      </nav>

      <section class="panel">
        <div class="upload-card" id="uploadCard">
          <div class="upload-title">選擇一張照片</div>
          <div class="upload-hint">照片只會在你的手機或瀏覽器本機處理，不會上傳到伺服器。</div>
          <input id="imageInput" type="file" accept="image/*" />
        </div>

        <div class="canvas-wrap hidden" id="canvasWrap">
          <canvas id="editorCanvas"></canvas>
        </div>

        <div class="controls hidden" id="controls">
          <div class="segment" role="group" aria-label="鏡像模式">
            <button data-mode="horizontal">左右鏡像</button>
            <button data-mode="vertical">上下鏡像</button>
            <button data-mode="reflection">倒影鏡像</button>
            <button data-mode="water">水波倒影</button>
          </div>

          <div class="slider-row">
            <div class="slider-head">
              <span>鏡像位置</span>
              <span id="axisValue">50%</span>
            </div>
            <input id="axisSlider" type="range" min="20" max="80" value="50" />
          </div>

          <div class="slider-row">
            <div class="slider-head">
              <span>融合程度</span>
              <span id="blendValue">75%</span>
            </div>
            <input id="blendSlider" type="range" min="0" max="100" value="75" />
          </div>

          <div class="slider-row">
            <div class="slider-head">
              <span>水波強度</span>
              <span id="rippleValue">18</span>
            </div>
            <input id="rippleSlider" type="range" min="0" max="60" value="18" />
          </div>

          <div class="slider-row">
            <div class="slider-head">
              <span>水波密度</span>
              <span id="densityValue">24</span>
            </div>
            <input id="densitySlider" type="range" min="4" max="60" value="24" />
          </div>

          <div class="action-row">
            <button class="secondary-button" id="resetBtn">重設</button>
            <button class="primary-button" id="exportJpgBtn">儲存 JPG</button>
          </div>

          <button class="secondary-button" id="exportPngBtn">儲存 PNG</button>

          <p class="note">
            建議一般照片儲存 JPG；需要透明背景、文字或圖像品質不想壓縮時再用 PNG。
            在 iPhone 上會開啟分享或下載流程，可再選擇「儲存影像」到相簿。
          </p>
        </div>
      </section>
    </main>
  `;

  document.getElementById("backHome").addEventListener("click", () => navigate("home"));

  const canvas = document.getElementById("editorCanvas");
  const canvasManager = new CanvasManager(canvas);
  const mirrorTool = new MirrorTool(canvasManager);

  const state = {
    source: null,
    mode: "water",
    axis: 50,
    blend: 75,
    ripple: 18,
    density: 24
  };

  const render = () => {
    if (!state.source) return;
    mirrorTool.render(state.source.imageCanvas, state);
  };

  const imageInput = document.getElementById("imageInput");

  imageInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    state.source = await loadImageFromFile(file);

    document.getElementById("canvasWrap").classList.remove("hidden");
    document.getElementById("controls").classList.remove("hidden");

    render();
  });

  setupMirrorUI(document, state, render);

  document.getElementById("exportJpgBtn").addEventListener("click", () => {
    if (!state.source) return;
    downloadCanvas(canvas, "image/jpeg", 0.92);
  });

  document.getElementById("exportPngBtn").addEventListener("click", () => {
    if (!state.source) return;
    downloadCanvas(canvas, "image/png");
  });
}
