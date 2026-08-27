import "./icons.js";
import { state } from "./state.js";
import { initTheme } from "./theme.js";
import { checkMe, renderUserArea, initAuth } from "./auth.js";
import * as tree from "./tree.js";
import { showEmpty } from "./doc.js";
import { setupSearch } from "./search.js";
import { api } from "./api.js";
window.icon = window.icon;
window.__tree = tree;

// ===== 移动端侧边栏抽屉 =====
function openMobileDrawer() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("drawerOverlay");
  if (sb) sb.classList.add("drawer-open");
  if (ov) ov.classList.add("show");
}
function closeMobileDrawer() {
  const sb = document.getElementById("sidebar");
  const ov = document.getElementById("drawerOverlay");
  if (sb) sb.classList.remove("drawer-open");
  if (ov) ov.classList.remove("show");
}
window.__openMobileDrawer = openMobileDrawer;
window.__closeMobileDrawer = closeMobileDrawer;

function setupMobileDrawer() {
  document.getElementById("menuIcon").innerHTML = window.icon("menu");
  document.getElementById("btnMenu").addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    if (sb.classList.contains("drawer-open")) closeMobileDrawer();
    else openMobileDrawer();
  });
  document.getElementById("drawerOverlay").addEventListener("click", closeMobileDrawer);
}

// ===== 项目管理折叠（持久化） =====
const PROJECTS_COLLAPSE_KEY = "docpi_projects_collapsed";
function setupProjectToggle() {
  const chev = document.getElementById("projectsChevron");
  const wrap = document.getElementById("projectListWrap");
  chev.innerHTML = window.icon("chevron");
  const collapsed = localStorage.getItem(PROJECTS_COLLAPSE_KEY) === "1";
  chev.classList.toggle("open", !collapsed);
  wrap.classList.toggle("collapsed", collapsed);
  document.getElementById("btnToggleProjects").addEventListener("click", () => {
    const next = wrap.classList.toggle("collapsed");
    chev.classList.toggle("open", !next);
    localStorage.setItem(PROJECTS_COLLAPSE_KEY, next ? "1" : "0");
  });
}

async function init() {
  initTheme();
  initAuth();
  setupMobileDrawer();
  setupProjectToggle();
  document.getElementById("logoIcon").innerHTML = window.icon("logo");
  try {
    const s = await api("/api/settings");
    state.settings.site_name = s.site_name || "DocPI";
    state.settings.site_desc = s.site_desc || "";
  } catch (_) {
  }
  document.getElementById("siteName").textContent = state.settings.site_name || "DocPI";
  document.title = `${state.settings.site_name || "DocPI"} · 开发文档公示`;
  document.getElementById("searchIcon").innerHTML = window.icon("search");
  await checkMe();
  renderUserArea();
  tree.setupAddProject(async () => {
    const { promptDialog, toast } = await import("./ui.js");
    const name = await promptDialog({ title: "新建项目", placeholder: "项目名称" });
    if (!name || !name.trim()) return;
    try {
      await api("/api/projects", { method: "POST", body: { name: name.trim() } });
      await tree.loadProjects();
      toast("项目已创建", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  });
  tree.setupAddRootFolder(() => tree.addRootFolder());
  setupSearch();
  await tree.loadProjects();
  showEmpty();
}
init();
//# sourceMappingURL=main.js.map
