import { loadSettings, saveSettings, THEME_COLORS } from "../config/settingsStore.js";
import { iconButton } from "../core/iconLoader.js";

export function renderSettingsPage(root, navigate){
  const settings = loadSettings();

  root.innerHTML = `
    <main class="app-shell page">
      <nav class="topbar">
        ${iconButton({ icon: "home", label: "首頁", id: "homeBtn", className: "feature-home" })}
        <div class="topbar-title">
          <h1>設定</h1>
        </div>
      </nav>

      <section class="panel">
        <div class="settings-group">
          <p class="settings-title">字體與圖示大小</p>
          <div class="radio-row">
            ${fontOption("small", "小", settings.fontSize)}
            ${fontOption("medium", "中", settings.fontSize)}
            ${fontOption("large", "大", settings.fontSize)}
          </div>
        </div>

        <div class="settings-group">
          <p class="settings-title">主畫面背景顏色</p>
          <div class="color-grid">
            ${THEME_COLORS.map(color => `
              <button
                type="button"
                class="color-choice ${settings.themeColor === color ? "active" : ""}"
                data-color="${color}"
                style="background:linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 48%, white));"
                aria-label="選擇背景色 ${color}">
                <span class="color-check">✓</span>
              </button>
            `).join("")}
          </div>
          <p class="note">目前選擇：<strong id="currentColorLabel">${settings.themeColor}</strong></p>
        </div>

        <p class="note">設定會自動儲存在本機瀏覽器，下次開啟仍會保留。</p>
      </section>
    </main>
  `;

  root.querySelector("#homeBtn")?.addEventListener("click", event => {
    event.preventDefault();
    navigate("home");
  });

  root.querySelectorAll('input[name="fontSize"]').forEach(input => {
    input.addEventListener("change", () => {
      const next = loadSettings();
      next.fontSize = input.value;
      saveSettings(next);
    });
  });

  root.querySelectorAll(".color-choice").forEach(button => {
    button.addEventListener("click", () => {
      const next = loadSettings();
      next.themeColor = button.dataset.color;
      saveSettings(next);

      root.querySelectorAll(".color-choice").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      const label = root.querySelector("#currentColorLabel");
      if (label) label.textContent = next.themeColor;
    });
  });
}

function fontOption(value, label, current){
  return `
    <label class="radio-pill">
      <input type="radio" name="fontSize" value="${value}" ${current === value ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}
