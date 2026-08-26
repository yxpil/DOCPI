// @ts-nocheck
import { state } from "./state.js";
import { api } from "./api.js";
import { escapeHtml, promptDialog, confirmDialog, toast } from "./ui.js";
import { canEditFolder } from "./auth.js";
const canManage = () => state.user && state.user.role === "admin";
async function loadProjects() {
  try {
    state.projects = await api("/api/projects");
  } catch (e) {
    toast(e.message, "error");
    state.projects = [];
  }
  renderProjectSelect();
  const urlProj = new URLSearchParams(location.search).get("project");
  if (urlProj) {
    const p = state.projects.find((x) => String(x.id) === urlProj);
    if (p) state.currentProjectId = p.id;
  }
  if (!state.currentProjectId && state.projects.length) {
    state.currentProjectId = state.projects[0].id;
  }
  await selectProject(state.currentProjectId, { keepFolder: true });
}
function renderProjectSelect() {
  const sel = document.getElementById("projectSelect");
  sel.innerHTML = '<option value="">选择项目…</option>' + state.projects.map((p) => `<option value="${p.id}" ${p.id === state.currentProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
}
async function selectProject(pid, { keepFolder = false } = {}) {
  state.currentProjectId = pid || null;
  if (pid) history.replaceState(null, "", `?project=${pid}`);
  else history.replaceState(null, "", location.pathname);
  renderProjectSelect();
  if (!pid) {
    state.folders = [];
    renderTree();
    return;
  }
  try {
    state.folders = await api(`/api/projects/${pid}/folders`);
  } catch (e) {
    state.folders = [];
  }
  if (!keepFolder || !state.folders.some((f) => f.id === state.currentFolderId)) {
    state.currentFolderId = null;
    state.documents = [];
    state.currentDocId = null;
    state.currentDoc = null;
  }
  renderTree();
  if (state.currentFolderId) {
    await openFolder(state.currentFolderId, { silent: true });
  } else {
    const { showEmpty } = await import("./doc.js");
    showEmpty();
  }
}
function folderChildren(parentId) {
  return (state.folders || []).filter((f) => (f.parent_id || null) === parentId).sort((a, b) => a.name.localeCompare(b.name, "zh"));
}
function buildTree(folderId) {
  return (state.folders || []).filter((f) => f.parent_id === folderId).sort((a, b) => a.name.localeCompare(b.name, "zh"));
}
function renderTree() {
  const tree = document.getElementById("tree");
  const addProj = document.getElementById("btnAddProject");
  const addRoot = document.getElementById("btnAddRootFolder");
  addProj.classList.toggle("hidden", !canManage());
  addProj.innerHTML = canManage() ? window.icon("plus") : "";
  addRoot.classList.toggle("hidden", !canManage() || !state.currentProjectId);
  if (!state.currentProjectId) {
    tree.innerHTML = `<div class="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
      <div class="flex justify-center mb-2 text-slate-300 dark:text-slate-600">${window.icon("database")}</div>
      <p>选择一个项目，或${canManage() ? "点击右上角 + 新建项目" : "等待管理员创建"}</p>
    </div>`;
    return;
  }
  const roots = buildTree(null);
  if (!roots.length && !state.folders.length) {
    tree.innerHTML = `<div class="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
      <p>暂无文件夹</p>${canManage() ? '<p class="text-xs mt-1">点击上方「+ 新建」创建根文件夹</p>' : ""}
    </div>`;
    return;
  }
  tree.innerHTML = "";
  for (const f of roots) {
    tree.appendChild(renderFolderNode(f, 0));
  }
}
function renderFolderNode(f, depth) {
  const hasChildren = folderChildren(f.id).length > 0;
  const expanded = state.openFolderIds.has(f.id);
  const editable = canEditFolder(f.id);
  const isCurrent = state.currentFolderId === f.id;
  const wrap = document.createElement("div");
  const row = document.createElement("div");
  row.className = `tree-row flex items-center gap-1 pr-2 py-1.5 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800 ${isCurrent ? "bg-brand-50 dark:bg-brand-900/20" : ""}`;
  row.style.paddingLeft = `${8 + depth * 16}px`;
  row.innerHTML = `
    <span class="tree-chevron ${expanded ? "open" : ""} text-slate-400 shrink-0 w-4 h-4 flex items-center justify-center pointer-events-none">${hasChildren ? window.icon("chevron") : '<span class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>'}</span>
    <span class="shrink-0 ${editable ? "text-amber-500" : "text-slate-400"} pointer-events-none">${window.icon(expanded && hasChildren ? "folderOpen" : "folder")}</span>
    <span class="flex-1 truncate text-sm pointer-events-none">${escapeHtml(f.name)}</span>
    ${!editable && state.user ? `<span class="shrink-0 text-slate-300 dark:text-slate-600 pointer-events-none" title="无编辑权限">${window.icon("lock")}</span>` : ""}
    ${canManage() ? `
      <button data-add-sub class="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30" title="新建子文件夹">${window.icon("plus")}</button>
      <button data-del class="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="删除文件夹">${window.icon("trash")}</button>
    ` : ""}
  `;
  row.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    toggleFolder(f);
  });
  const addSub = row.querySelector("[data-add-sub]");
  if (addSub) addSub.addEventListener("click", (e) => {
    e.stopPropagation();
    addSubFolder(f);
  });
  const del = row.querySelector("[data-del]");
  if (del) del.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteFolder(f);
  });
  wrap.appendChild(row);
  if (expanded) {
    for (const child of folderChildren(f.id)) {
      wrap.appendChild(renderFolderNode(child, depth + 1));
    }
    if (state.currentFolderId === f.id) {
      for (const d of state.documents || []) {
        wrap.appendChild(renderDocRow(d, depth + 1));
      }
    }
  }
  return wrap;
}
function renderDocRow(d, depth) {
  const active = d.id === state.currentDocId;
  const row = document.createElement("div");
  row.className = `tree-row flex items-center gap-1 pr-2 py-1.5 cursor-pointer text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 ${active ? "bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300" : ""}`;
  row.style.paddingLeft = `${8 + (depth + 1) * 16}px`;
  row.innerHTML = `
    <span class="shrink-0 text-slate-400 pointer-events-none">${window.icon("file")}</span>
    <span class="flex-1 truncate text-sm pointer-events-none">${escapeHtml(d.title)}</span>`;
  row.addEventListener("click", () => {
    state.currentDocId = d.id;
    renderTree();
    window.__openDoc && window.__openDoc(d.id);
  });
  return row;
}
function toggleFolder(f) {
  if (state.openFolderIds.has(f.id)) {
    state.openFolderIds.delete(f.id);
    renderTree();
  } else {
    state.openFolderIds.add(f.id);
    state.currentFolderId = f.id;
    loadFolderDocuments(f.id);
  }
}
async function loadFolderDocuments(fid) {
  try {
    state.documents = await api(`/api/folders/${fid}/documents`);
  } catch (e) {
    state.documents = [];
  }
  state.currentFolderId = fid;
  renderTree();
  const { showEmpty } = await import("./doc.js");
  showEmpty();
}
async function openFolder(fid, { silent = false } = {}) {
  state.currentFolderId = fid;
  state.openFolderIds.add(fid);
  await loadFolderDocuments(fid);
  if (!silent) renderTree();
}
async function addRootFolder() {
  if (!state.currentProjectId) return;
  await addSubFolder({ parent_id: null });
}
async function addSubFolder(parent) {
  const name = await promptDialog({ title: parent && parent.id ? `在「${parent.name}」下新建文件夹` : "新建文件夹", placeholder: "文件夹名称" });
  if (!name || !name.trim()) return;
  try {
    await api(`/api/projects/${state.currentProjectId}/folders`, { method: "POST", body: { name: name.trim(), parent_id: parent ? parent.id : null } });
    state.folders = await api(`/api/projects/${state.currentProjectId}/folders`);
    if (parent && parent.id) state.openFolderIds.add(parent.id);
    renderTree();
    toast("文件夹已创建", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}
async function deleteFolder(f) {
  const ok = await confirmDialog({ title: "删除文件夹", message: `确定删除文件夹「${f.name}」及其所有子文件夹和文档？此操作不可撤销。`, danger: true });
  if (!ok) return;
  try {
    await api(`/api/folders/${f.id}`, { method: "DELETE" });
    if (state.currentFolderId === f.id) {
      state.currentFolderId = null;
      state.documents = [];
      state.currentDocId = null;
      state.currentDoc = null;
    }
    state.openFolderIds.delete(f.id);
    state.folders = await api(`/api/projects/${state.currentProjectId}/folders`);
    renderTree();
    const { showEmpty } = await import("./doc.js");
    showEmpty();
    toast("文件夹已删除", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}
function setupAddProject(handler) {
  document.getElementById("btnAddProject").addEventListener("click", handler);
}
function setupAddRootFolder(handler) {
  document.getElementById("btnAddRootFolder").addEventListener("click", handler);
}
export {
  addRootFolder,
  loadProjects,
  openFolder,
  renderTree,
  selectProject,
  setupAddProject,
  setupAddRootFolder
};
//# sourceMappingURL=tree.js.map
