import "./icons.js";
import { state } from "./state.js?v=20260826150348";
import { initTheme } from "./theme.js?v=20260826150348";
import { checkMe, renderUserArea, initAuth } from "./auth.js?v=20260826150348";
import * as tree from "./tree.js?v=20260826150348";
import { showEmpty } from "./doc.js?v=20260826150348";
import { setupSearch } from "./search.js?v=20260826150348";
import { api } from "./api.js?v=20260826150348";
window.icon = window.icon;
window.__tree = tree;
async function init() {
  initTheme();
  initAuth();
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
    const { promptDialog, toast } = await import("./ui.js?v=20260826150348");
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
