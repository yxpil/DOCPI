// @ts-nocheck
const STORAGE_KEY = "docpi_theme";
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = saved ? saved === "dark" : prefersDark;
  applyTheme(isDark);
  renderToggle();
  document.getElementById("btnTheme").addEventListener("click", toggleTheme);
}
function applyTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
}
function renderToggle() {
  const el = document.getElementById("themeIcon");
  const isDark = document.documentElement.classList.contains("dark");
  el.innerHTML = window.icon(isDark ? "sun" : "moon");
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  const next = !isDark;
  localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  applyTheme(next);
  renderToggle();
}
export {
  initTheme,
  toggleTheme
};
//# sourceMappingURL=theme.js.map
