// @ts-nocheck
import { state } from "./state.js";
import { api } from "./api.js";
import { escapeHtml, promptDialog, confirmDialog, toast } from "./ui.js";
import { canEditFolder } from "./auth.js";
let saveTimer = null;
let lastSavedContent = "";
function showEmpty() {
  const area = document.getElementById("contentArea");
  area.innerHTML = `
    <div class="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 h-full min-h-[50vh]">
      <div class="text-5xl mb-3 text-slate-300 dark:text-slate-700">${window.icon("file").replace("w-4 h-4", "w-12 h-12")}</div>
      <p class="text-sm">选择左侧文件夹或文档开始阅读</p>
    </div>`;
}
async function openDoc(id) {
  let doc;
  try {
    doc = await api(`/api/documents/${id}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  state.currentDocId = id;
  state.currentDoc = doc;
  state.currentFolderId = doc.folder_id;
  const { renderTree } = await import("./tree.js");
  renderTree();
  renderDoc();
}
function renderDoc() {
  const area = document.getElementById("contentArea");
  const doc = state.currentDoc;
  const editable = doc.editable;
  const author = doc.author_name || doc.author_username || "未知";
  const updater = doc.updater_name || doc.updater_username || author;
  area.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <div class="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur py-3 -mx-6 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <button id="btnBack" class="h-8 px-3 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1">${window.icon("chevron").replace("w-4 h-4", "w-4 h-4").replace('points="9 18 15 12 9 6"', 'points="15 18 9 12 15 6"')} 返回</button>
        <div class="flex-1"></div>
        <div id="saveState" class="text-xs text-slate-400 dark:text-slate-500"></div>
        ${editable ? `
          <button id="btnEditDoc" class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition">${window.icon("edit")} 编辑</button>
          <button id="btnUpload" class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition">${window.icon("upload")} 上传</button>
          <button id="btnDelDoc" class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-red-600 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 transition">${window.icon("trash")} 删除</button>
        ` : ""}
      </div>

      <article class="py-6">
        <h1 id="docTitle" class="text-2xl font-bold mb-2">${escapeHtml(doc.title)}</h1>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <span class="flex items-center gap-1">${window.icon("user")} 作者：${escapeHtml(author)}</span>
          <span>创建：${escapeHtml(doc.created_at || "")}</span>
          <span>更新：${escapeHtml(doc.updated_at || "")}${updater !== author ? "（" + escapeHtml(updater) + "）" : ""}</span>
        </div>
        ${renderMeta(doc)}
        <div id="docBody" class="prose prose-slate dark:prose-invert max-w-none"></div>
      </article>
    </div>`;
  document.getElementById("docBody").innerHTML = window.marked.parse(doc.content || "");
  document.getElementById("btnBack").addEventListener("click", () => {
    const { openFolder } = window.__tree || {};
    if (openFolder && state.currentFolderId) openFolder(state.currentFolderId);
    else showEmpty();
  });
  if (editable) {
    document.getElementById("btnEditDoc").addEventListener("click", () => editDoc(true));
    document.getElementById("btnUpload").addEventListener("click", () => uploadFileModal());
    document.getElementById("btnDelDoc").addEventListener("click", deleteDoc);
  }
}
function renderMeta(doc) {
  const items = [];
  if (doc.price) items.push(`<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-medium flex items-center gap-1">${window.icon("price")} ${escapeHtml(doc.price)}</span>`);
  if (doc.repo_url) items.push(`<a href="${escapeHtml(doc.repo_url)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium flex items-center gap-1 hover:bg-slate-200 dark:hover:bg-slate-700">${window.icon("repo")} 仓库 ${window.icon("external")}</a>`);
  if (doc.link) items.push(`<a href="${escapeHtml(doc.link)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium flex items-center gap-1 hover:bg-slate-200 dark:hover:bg-slate-700">${window.icon("link")} 链接 ${window.icon("external")}</a>`);
  if (!items.length) return "";
  return `<div class="flex flex-wrap gap-2 mb-4">${items.join("")}</div>`;
}
function editDoc() {
  const doc = state.currentDoc;
  if (!doc) return;
  const area = document.getElementById("contentArea");
  area.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <div class="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur py-3 -mx-6 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <div class="flex-1"></div>
        <div id="saveState" class="text-xs text-slate-400 dark:text-slate-500">编辑中…</div>
        <button id="btnSaveNow" class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">${window.icon("save")} 保存</button>
        <button id="btnCancelEdit" class="h-8 px-3 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">取消</button>
      </div>

      <div class="py-6 space-y-4">
        <input id="editTitle" type="text" value="${escapeHtml(doc.title)}" class="w-full text-2xl font-bold bg-transparent outline-none border-b border-transparent focus:border-brand-500 px-1 py-1" placeholder="文档标题" />
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input id="editPrice" value="${escapeHtml(doc.price || "")}" placeholder="价格（如 ¥88 / 免费）" class="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          <input id="editRepo" value="${escapeHtml(doc.repo_url || "")}" placeholder="仓库地址" class="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          <input id="editLink" value="${escapeHtml(doc.link || "")}" placeholder="文档链接" class="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <div class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span>${window.icon("upload")} 上传文件后点击「复制链接」，将链接粘贴到正文即可引用</span>
          <button id="btnUploadEdit" class="h-7 px-2.5 rounded-md text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 border border-brand-200 dark:border-brand-900 flex items-center gap-1">${window.icon("upload")} 上传</button>
        </div>
        <textarea id="editContent" class="w-full min-h-[60vh] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-mono outline-none focus:border-brand-500 resize-y">${escapeHtml(doc.content || "")}</textarea>
      </div>
    </div>`;
  const titleEl = document.getElementById("editTitle");
  const contentEl = document.getElementById("editContent");
  const priceEl = document.getElementById("editPrice");
  const repoEl = document.getElementById("editRepo");
  const linkEl = document.getElementById("editLink");
  const saveState = document.getElementById("saveState");
  lastSavedContent = contentEl.value;
  document.getElementById("btnSaveNow").addEventListener("click", () => saveNow({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState }));
  document.getElementById("btnCancelEdit").addEventListener("click", () => {
    clearAutoSave();
    renderDoc();
  });
  document.getElementById("btnUploadEdit").addEventListener("click", () => uploadFileModal((url) => {
    contentEl.value += (contentEl.value ? "\n" : "") + url;
    scheduleAutoSave({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState });
  }));
  const onChange = () => scheduleAutoSave({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState });
  contentEl.addEventListener("input", onChange);
  titleEl.addEventListener("input", onChange);
  priceEl.addEventListener("input", onChange);
  repoEl.addEventListener("input", onChange);
  linkEl.addEventListener("input", onChange);
  contentEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveNow({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState });
    }
  });
}
function scheduleAutoSave(els) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (els.contentEl.value === lastSavedContent) return;
    saveNow(els);
  }, 1500);
}
function clearAutoSave() {
  clearTimeout(saveTimer);
}
async function saveNow({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState }) {
  const title = titleEl.value.trim();
  if (!title) {
    toast("标题不能为空", "error");
    return;
  }
  saveState.textContent = "保存中…";
  try {
    await api(`/api/documents/${state.currentDoc.id}`, { method: "PUT", body: {
      title,
      content: contentEl.value,
      price: priceEl.value.trim(),
      repo_url: repoEl.value.trim(),
      link: linkEl.value.trim()
    } });
    lastSavedContent = contentEl.value;
    saveState.textContent = "已保存 " + (/* @__PURE__ */ new Date()).toLocaleTimeString();
    state.currentDoc.title = title;
    state.currentDoc.content = contentEl.value;
    const { renderTree } = await import("./tree.js");
    renderTree();
  } catch (e) {
    saveState.textContent = "保存失败";
    toast(e.message, "error");
  }
}
async function deleteDoc() {
  const ok = await confirmDialog({ title: "删除文档", message: `确定删除「${state.currentDoc.title}」？`, danger: true });
  if (!ok) return;
  try {
    await api(`/api/documents/${state.currentDoc.id}`, { method: "DELETE" });
    state.currentDoc = null;
    state.currentDocId = null;
    const { openFolder } = await import("./tree.js");
    await openFolder(state.currentFolderId);
    toast("文档已删除", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}
async function createDoc(folder) {
  if (!state.user) return toast("请先登录", "error");
  if (!canEditFolder(folder.id)) return toast("无权限在该文件夹下创建文档", "error");
  const title = await promptDialog({ title: "新建文档", placeholder: "文档标题" });
  if (!title || !title.trim()) return;
  try {
    const r = await api(`/api/folders/${folder.id}/documents`, { method: "POST", body: { title: title.trim() } });
    toast("文档已创建，开始编辑", "success");
    const { loadFolderDocuments } = await import("./tree.js");
    await loadFolderDocuments(folder.id);
    await openDoc(r.id);
    editDoc();
  } catch (e) {
    toast(e.message, "error");
  }
}
function uploadFileModal(onDone) {
  const root = document.getElementById("modalRoot");
  const wrapper = document.createElement("div");
  wrapper.className = "fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm";
  wrapper.innerHTML = `
    <div class="w-[420px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
      <h3 class="text-lg font-semibold flex items-center gap-2 mb-4">${window.icon("upload")} 上传文件</h3>
      <div id="uploadDrop" class="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500 transition">
        <div class="flex justify-center mb-2 text-slate-400">${window.icon("upload").replace("w-4 h-4", "w-8 h-8")}</div>
        <p class="text-sm text-slate-500 dark:text-slate-400">点击选择文件或拖拽到此处</p>
        <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">最大 20MB</p>
        <input id="uploadFile" type="file" class="hidden" />
      </div>
      <div id="uploadResult" class="mt-4"></div>
    </div>`;
  root.appendChild(wrapper);
  const drop = wrapper.querySelector("#uploadDrop");
  const fileInput = wrapper.querySelector("#uploadFile");
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("border-brand-500");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("border-brand-500"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("border-brand-500");
    handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  async function handleFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast("文件需小于 20MB", "error");
      return;
    }
    const dataUrl = await readAsDataURL(file);
    const base64 = dataUrl.split(",")[1];
    try {
      const r = await api("/api/upload", { method: "POST", body: { name: file.name, mime: file.type, data: base64 } });
      const result = wrapper.querySelector("#uploadResult");
      result.innerHTML = `
        <div class="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3">
          <div class="text-sm font-medium text-emerald-700 dark:text-emerald-300">上传成功</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">${escapeHtml(file.name)}</div>
          <div class="flex gap-2 mt-2">
            <input id="fileUrl" readonly value="${escapeHtml(r.url)}" class="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-mono" />
            <button id="btnCopyUrl" class="h-7 px-2.5 rounded-md text-xs font-medium text-white bg-brand-600 hover:bg-brand-700">复制链接</button>
          </div>
        </div>`;
      wrapper.querySelector("#btnCopyUrl").addEventListener("click", async () => {
        const inp = wrapper.querySelector("#fileUrl");
        inp.select();
        document.execCommand("copy");
        toast("已复制链接", "success");
        if (onDone) {
          onDone(r.url);
          wrapper.remove();
        }
      });
    } catch (e) {
      toast(e.message, "error");
    }
  }
}
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
window.__openDoc = openDoc;
window.__showEmpty = showEmpty;
window.__tree = null;
export {
  createDoc,
  editDoc,
  openDoc,
  showEmpty
};
//# sourceMappingURL=doc.js.map
