const FEATURES = Array.from({ length: 28 }, (_, index) => {
  const id = index + 1;

  return {
    id: `F${id}`,
    label: id === 1 ? "鏡像" : `F${id}`,
    route: id === 1 ? "F1_mirror" : null,
    icon: `./assets/icons/F${id}.webp`,
    enabled: id === 1
  };
});

export function renderHomeScreen(root, navigate){
  root.innerHTML = `
    <main class="app-shell">
      <header class="home-header">
        <h1>Photo Editor</h1>
        <p>影像創作工具箱</p>
      </header>

      <section class="icon-grid" aria-label="功能列表">
        ${FEATURES.map(feature => `
          <button
            class="feature-icon"
            ${feature.enabled ? "" : "disabled"}
            data-route="${feature.route || ""}"
            aria-label="${feature.label}">
            <span class="icon-tile">
              <img src="${feature.icon}" alt="" onerror="this.style.display='none'" />
              <span class="icon-fallback">${feature.id}</span>
            </span>
            <span class="icon-label">${feature.label}</span>
          </button>
        `).join("")}
      </section>
    </main>
  `;

  root.querySelectorAll(".feature-icon[data-route]").forEach(button => {
    button.addEventListener("click", () => {
      const route = button.dataset.route;
      if (route) navigate(route);
    });
  });
}
