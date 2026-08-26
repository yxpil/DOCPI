import { state } from "./state.js?v=20260826150348";
import { api } from "./api.js?v=20260826150348";
import { escapeHtml, promptDialog, confirmDialog, toast, contextMenu } from "./ui.js?v=20260826150348";
import { canEditFolder } from "./auth.js?v=20260826150348";
const canManage = () => state.user && state.user.role === "admin";
async function loadProjects() {
  try {
    state.projects = await api("/api/projects");
  } catch (e) {
    toast(e.message, "error");
    state.projects = [];
  }
  renderProjectList();
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
function renderProjectList() {
  const list = document.getElementById("projectList");
  const addBtn = document.getElementById("btnAddProject");
  addBtn.classList.toggle("hidden", !canManage());
  addBtn.innerHTML = canManage() ? window.icon("plus") : "";
  if (!state.projects.length) {
    list.innerHTML = `<div class="px-2.5 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">暂无项目${canManage() ? "，点右上 + 新建" : ""}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const p of state.projects) {
    const active = state.currentProjectId === p.id;
    const row = document.createElement("div");
    row.className = `group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full cursor-pointer text-sm transition ${active ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-medium" : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"}`;
    row.innerHTML = `
      <span class="shrink-0 ${active ? "text-brand-600 dark:text-brand-400" : "text-neutral-400"}">${window.icon("database")}</span>
      <span class="flex-1 truncate">${escapeHtml(p.name)}</span>
      ${canManage() ? `
        <button data-ren class="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded-full text-neutral-400 hover:text-brand-600" title="重命名">${window.icon("edit")}</button>
        <button data-delp class="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded-full text-neutral-400 hover:text-red-600" title="删除项目">${window.icon("trash")}</button>
      ` : ""}
    `;
    row.addEventListener("click", async (e) => {
      if (e.target.closest("button")) return;
      await selectProject(p.id);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showProjectMenu(p, e.clientX, e.clientY);
    });
    const ren = row.querySelector("[data-ren]");
    if (ren) ren.addEventListener("click", (e) => {
      e.stopPropagation();
      renameProject(p);
    });
    const del = row.querySelector("[data-delp]");
    if (del) del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject(p);
    });
    list.appendChild(row);
  }
}
async function renameProject(p) {
  const name = await promptDialog({ title: "重命名项目", placeholder: "项目名称", defaultValue: p.name });
  if (!name || !name.trim() || name.trim() === p.name) return;
  try {
    await api(`/api/projects/${p.id}`, { method: "PUT", body: { name: name.trim() } });
    await loadProjects();
    toast("项目已重命名", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}
async function deleteProject(p) {
  const ok = await confirmDialog({ title: "删除项目", message: `确定删除项目「${p.name}」及其所有文件夹和文档？此操作不可撤销。`, danger: true });
  if (!ok) return;
  try {
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    if (state.currentProjectId === p.id) {
      state.currentProjectId = null;
      state.folders = [];
      state.documents = [];
      state.currentDocId = null;
      state.currentDoc = null;
    }
    await loadProjects();
    toast("项目已删除", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}
function showProjectMenu(p, x, y) {
  const items = [];
  if (canManage()) {
    items.push({ label: "重命名", icon: "edit", onClick: () => renameProject(p) });
    items.push({ label: "删除项目", icon: "trash", danger: true, onClick: () => deleteProject(p) });
  }
  contextMenu(items, x, y);
}
async function selectProject(pid, { keepFolder = false } = {}) {
  state.currentProjectId = pid || null;
  if (pid) history.replaceState(null, "", `?project=${pid}`);
  else history.replaceState(null, "", location.pathname);
  renderProjectList();
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
    const { showEmpty } = await import("./doc.js?v=20260826150348");
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
  const addRoot = document.getElementById("btnAddRootFolder");
  const canSomething = canManage() || (state.currentFolderId ? canEditFolder(state.currentFolderId) : false);
  addRoot.classList.toggle("hidden", !state.currentProjectId || !canSomething);
  if (!state.currentProjectId) {
    tree.innerHTML = `<div class="px-4 py-10 text-center text-sm text-neutral-400 dark:text-neutral-500">
      <div class="flex justify-center mb-2 text-neutral-300 dark:text-neutral-600">${window.icon("database")}</div>
      <p>在左侧项目管理中选择项目</p>
    </div>`;
    return;
  }
  const roots = buildTree(null);
  if (!roots.length && !state.folders.length) {
    tree.innerHTML = `<div class="px-4 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
      <p>暂无文件夹</p>${canManage() ? '<p class="text-xs mt-1">点击上方「+ 新建」或右键空白处创建根文件夹</p>' : ""}
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
  row.className = `tree-row flex items-center gap-1 pr-2 py-1.5 cursor-pointer group hover:bg-neutral-100 dark:hover:bg-neutral-900 ${isCurrent ? "bg-neutral-100 dark:bg-neutral-900" : ""}`;
  row.style.paddingLeft = `${8 + depth * 16}px`;
  row.innerHTML = `
    <span class="tree-chevron ${expanded ? "open" : ""} text-neutral-400 shrink-0 w-4 h-4 flex items-center justify-center pointer-events-none">${hasChildren ? window.icon("chevron") : '<span class="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600"></span>'}</span>
    <span class="shrink-0 ${editable ? "text-amber-500" : "text-neutral-400"} pointer-events-none">${window.icon(expanded && hasChildren ? "folderOpen" : "folder")}</span>
    <span class="flex-1 truncate text-sm pointer-events-none">${escapeHtml(f.name)}</span>
    ${!editable && state.user ? `<span class="shrink-0 text-neutral-300 dark:text-neutral-600 pointer-events-none" title="无编辑权限">${window.icon("lock")}</span>` : ""}
    ${canManage() ? `
      <button data-add-sub class="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-full text-neutral-500 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-900" title="新建子文件夹">${window.icon("plus")}</button>
      <button data-del class="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-full text-neutral-500 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-900" title="删除文件夹">${window.icon("trash")}</button>
    ` : ""}
  `;
  row.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    toggleFolder(f);
  });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showFolderMenu(f, e.clientX, e.clientY);
  });
  const addSub = row.querySelector("[data-add-sub]");
  if (addSub) addSub.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = addSub.getBoundingClientRect();
    showFolderPlusMenu(f, rect.left, rect.bottom + 4);
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
  row.className = `tree-row flex items-center gap-1 pr-2 py-1.5 cursor-pointer text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 ${active ? "bg-neutral-100 dark:bg-neutral-900 text-brand-700 dark:text-brand-300" : ""}`;
  row.style.paddingLeft = `${8 + (depth + 1) * 16}px`;
  row.innerHTML = `
    <span class="shrink-0 text-neutral-400 pointer-events-none">${window.icon("file")}</span>
    <span class="flex-1 truncate text-sm pointer-events-none">${escapeHtml(d.title)}</span>`;
  row.addEventListener("click", () => {
    state.currentDocId = d.id;
    renderTree();
    window.__openDoc && window.__openDoc(d.id);
  });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showDocMenu(d, e.clientX, e.clientY);
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
  const { showEmpty } = await import("./doc.js?v=20260826150348");
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
    const { showEmpty } = await import("./doc.js?v=20260826150348");
    showEmpty();
    toast("文件夹已删除", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}
function showFolderPlusMenu(f, x, y) {
  const items = [];
  if (canEditFolder(f.id)) {
    items.push({ label: "新建文档", icon: "file", onClick: async () => {
      state.currentFolderId = f.id;
      state.openFolderIds.add(f.id);
      renderTree();
      const { createDoc } = await import("./doc.js?v=20260826150348");
      await createDoc(f);
    } });
  }
  if (canManage()) {
    items.push({ label: "新建子文件夹", icon: "plus", onClick: () => addSubFolder(f) });
  }
  items.push({ label: "上传文件", icon: "upload", onClick: async () => {
    const { uploadFileModal } = await import("./doc.js?v=20260826150348");
    uploadFileModal();
  } });
  contextMenu(items, x, y);
}
function showFolderMenu(f, x, y) {
  const items = [];
  if (canEditFolder(f.id)) {
    items.push({ label: "新建文档", icon: "file", onClick: async () => {
      state.currentFolderId = f.id;
      state.openFolderIds.add(f.id);
      renderTree();
      const { createDoc } = await import("./doc.js?v=20260826150348");
      await createDoc(f);
    } });
  }
  if (canManage()) {
    items.push({ label: "新建子文件夹", icon: "plus", onClick: () => addSubFolder(f) });
  }
  items.push({ label: "上传文件", icon: "upload", onClick: async () => {
    const { uploadFileModal } = await import("./doc.js?v=20260826150348");
    uploadFileModal();
  } });
  if (canManage()) {
    items.push({ label: "删除文件夹", icon: "trash", danger: true, onClick: () => deleteFolder(f) });
  }
  contextMenu(items, x, y);
}
function showDocMenu(d, x, y) {
  const items = [
    { label: "下载 (.md)", icon: "download", onClick: async () => {
      const { downloadDoc } = await import("./doc.js?v=20260826150348");
      await downloadDoc(d.id);
    } },
    { label: "编辑", icon: "edit", onClick: async () => {
      state.currentDocId = d.id;
      const { openDoc } = await import("./doc.js?v=20260826150348");
      await openDoc(d.id);
    } },
    { label: "上传文件", icon: "upload", onClick: async () => {
      const { uploadFileModal } = await import("./doc.js?v=20260826150348");
      uploadFileModal();
    } }
  ];
  if (canEditFolder(state.currentFolderId)) {
    items.push({ label: "删除文档", icon: "trash", danger: true, onClick: async () => {
      const ok = await confirmDialog({ title: "删除文档", message: `确定删除「${d.title}」？`, danger: true });
      if (!ok) return;
      try {
        await api(`/api/documents/${d.id}`, { method: "DELETE" });
        if (state.currentDocId === d.id) {
          state.currentDocId = null;
          state.currentDoc = null;
        }
        await loadFolderDocuments(state.currentFolderId);
        toast("文档已删除", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    } });
  }
  contextMenu(items, x, y);
}
function setupAddProject(handler) {
  document.getElementById("btnAddProject").addEventListener("click", handler);
}
function setupAddRootFolder(handler) {
  const btn = document.getElementById("btnAddRootFolder");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    const items = [];
    if (canManage()) {
      items.push({ label: "新建文件夹", icon: "folder", onClick: () => handler() });
    }
    if (state.currentFolderId && canEditFolder(state.currentFolderId)) {
      items.push({ label: "新建文档", icon: "file", onClick: async () => {
        const f = state.folders.find((x) => x.id === state.currentFolderId);
        if (f) {
          const { createDoc } = await import("./doc.js?v=20260826150348");
          await createDoc(f);
        }
      } });
    }
    items.push({ label: "上传文件", icon: "upload", onClick: async () => {
      const { uploadFileModal } = await import("./doc.js?v=20260826150348");
      uploadFileModal();
    } });
    contextMenu(items, rect.left, rect.bottom + 4);
  });
}
export {
  addRootFolder,
  deleteProject,
  loadFolderDocuments,
  loadProjects,
  openFolder,
  renderTree,
  selectProject,
  setupAddProject,
  setupAddRootFolder
};
//# sourceMappingURL=tree.js.map
