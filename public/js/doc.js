import { state } from "./state.js";
import { api } from "./api.js";
import { escapeHtml, promptDialog, confirmDialog, toast } from "./ui.js";
import { canEditFolder } from "./auth.js";
let saveTimer = null;
let lastSavedContent = "";
function showEmpty() {
  const area = document.getElementById("contentArea");
  area.innerHTML = `
    <div class="flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 h-full min-h-[50vh]">
      <div class="text-5xl mb-3 text-neutral-300 dark:text-neutral-700">${window.icon("file").replace("w-4 h-4", "w-12 h-12")}</div>
      <p class="text-sm">选择左侧文件夹或文档开始阅读（右键文件夹可新建文档）</p>
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
      <div class="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur py-3 -mx-6 px-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <button id="btnBack" class="h-8 px-3.5 rounded-full text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-1">${window.icon("chevron").replace("w-4 h-4", "w-4 h-4").replace('points="9 18 15 12 9 6"', 'points="15 18 9 12 15 6"')} 返回</button>
        <div class="flex-1"></div>
        <div id="saveState" class="text-xs text-neutral-400 dark:text-neutral-500"></div>
        ${editable ? `
          <button id="btnEditDoc" class="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-black border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition">${window.icon("edit")} 编辑</button>
          <button id="btnUpload" class="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-black border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition">${window.icon("upload")} 上传</button>
          <button id="btnDelDoc" class="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-sm font-medium text-red-600 bg-white dark:bg-black border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 transition">${window.icon("trash")} 删除</button>
        ` : ""}
      </div>

      <article class="py-6">
        <h1 id="docTitle" class="text-2xl font-bold mb-2">${escapeHtml(doc.title)}</h1>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400 dark:text-neutral-500 mb-5 pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <span class="flex items-center gap-1">${window.icon("user")} 作者：${escapeHtml(author)}</span>
          <span>创建：${escapeHtml(doc.created_at || "")}</span>
          <span>更新：${escapeHtml(doc.updated_at || "")}${updater !== author ? "（" + escapeHtml(updater) + "）" : ""}</span>
        </div>
        ${renderMeta(doc)}
        <div id="docBody" class="md-body prose prose-neutral dark:prose-invert max-w-none"></div>
      </article>
    </div>`;
  const bodyEl = document.getElementById("docBody");
  bodyEl.innerHTML = window.marked.parse(doc.content || "");
  renderMermaid(bodyEl);
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
async function renderMermaid(root) {
  if (!window.mermaid) return;
  if (!renderMermaid._inited) {
    renderMermaid._inited = true;
    try {
      const dark = document.documentElement.classList.contains("dark");
      window.mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "loose" });
    } catch (e) {
    }
  }
  const blocks = [...root.querySelectorAll("pre code.language-mermaid")];
  for (const code of blocks) {
    const src = (code.textContent || "").trim();
    if (!src) continue;
    try {
      const id = "mmd" + Math.random().toString(36).slice(2, 10);
      const { svg } = await window.mermaid.render(id, src);
      const wrap = document.createElement("div");
      wrap.className = "my-4 overflow-x-auto flex justify-center";
      wrap.innerHTML = svg;
      const pre = code.closest("pre");
      if (pre) pre.replaceWith(wrap);
    } catch (err) {
      console.warn("Mermaid 渲染失败：", err);
    }
  }
}
function renderMeta(doc) {
  const items = [];
  if (doc.price) items.push(`<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-medium flex items-center gap-1">${window.icon("price")} ${escapeHtml(doc.price)}</span>`);
  if (doc.repo_url) items.push(`<a href="${escapeHtml(doc.repo_url)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 text-xs font-medium flex items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800">${window.icon("repo")} 仓库 ${window.icon("external")}</a>`);
  if (doc.link) items.push(`<a href="${escapeHtml(doc.link)}" target="_blank" rel="noopener" class="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 text-xs font-medium flex items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800">${window.icon("link")} 链接 ${window.icon("external")}</a>`);
  if (!items.length) return "";
  return `<div class="flex flex-wrap gap-2 mb-4">${items.join("")}</div>`;
}
function wrapSel(ta, before, after, placeholder) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || placeholder || "";
  ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  const ns = s + before.length;
  ta.setSelectionRange(ns, ns + sel.length);
  ta.focus();
}
function replaceSel(ta, text) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.setSelectionRange(s, s + text.length);
  ta.focus();
}
async function applyMdAction(action, ta) {
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  switch (action) {
    case "bold":
      wrapSel(ta, "**", "**", "加粗文字");
      break;
    case "italic":
      wrapSel(ta, "*", "*", "斜体文字");
      break;
    case "h2": {
      const t = sel || "标题";
      replaceSel(ta, t.split("\n").map((l) => "## " + l.replace(/^#{1,6}\s*/, "")).join("\n"));
      break;
    }
    case "quote": {
      const t = sel || "引用内容";
      replaceSel(ta, t.split("\n").map((l) => "> " + l).join("\n"));
      break;
    }
    case "list": {
      const t = sel || "列表项";
      replaceSel(ta, t.split("\n").map((l) => "- " + l).join("\n"));
      break;
    }
    case "link": {
      const url = await promptDialog({ title: "插入链接", placeholder: "https://example.com", valueLabel: "链接地址" });
      if (!url || !url.trim()) return;
      wrapSel(ta, "[", `](${url.trim()})`, sel || "链接文字");
      break;
    }
    case "image": {
      const url = await promptDialog({ title: "插入图片链接", placeholder: "https://example.com/image.png", valueLabel: "图片地址" });
      if (!url || !url.trim()) return;
      wrapSel(ta, "![", `](${url.trim()})`, sel || "图片描述");
      break;
    }
    case "code": {
      wrapSel(ta, "```\n", "\n```", sel || "代码");
      break;
    }
  }
}
function editDoc() {
  const doc = state.currentDoc;
  if (!doc) return;
  const area = document.getElementById("contentArea");
  area.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <div class="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur py-3 -mx-6 px-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <div class="flex-1"></div>
        <div id="saveState" class="text-xs text-neutral-400 dark:text-neutral-500">编辑中…</div>
        <button id="btnSaveNow" class="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">${window.icon("save")} 保存</button>
        <button id="btnCancelEdit" class="h-8 px-3.5 rounded-full text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition">取消</button>
      </div>

      <div class="py-6 space-y-4">
        <input id="editTitle" type="text" value="${escapeHtml(doc.title)}" class="w-full text-2xl font-bold bg-transparent outline-none border-b border-transparent focus:border-brand-500 px-1 py-1" placeholder="文档标题" />
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input id="editPrice" value="${escapeHtml(doc.price || "")}" placeholder="价格（如 ¥88 / 免费）" class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 py-2 text-sm outline-none focus:border-brand-500" />
          <input id="editRepo" value="${escapeHtml(doc.repo_url || "")}" placeholder="仓库地址" class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 py-2 text-sm outline-none focus:border-brand-500" />
          <input id="editLink" value="${escapeHtml(doc.link || "")}" placeholder="文档链接" class="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
          <span>${window.icon("upload")} 上传图片/文件后点「插入正文」内嵌，或直接用工具栏插入链接/图片</span>
          <button id="btnUploadEdit" class="h-7 px-3 rounded-full text-xs font-medium text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center gap-1">${window.icon("upload")} 上传</button>
        </div>
        <div id="mdToolbar" class="flex flex-wrap items-center gap-1.5 select-none">
          ${[["bold", "B", "加粗"], ["italic", "I", "斜体"], ["h2", "H2", "二级标题"], ["quote", "引用", "引用"], ["list", "列表", "列表"], ["link", "链接", "插入链接"], ["image", "图片", "插入图片"], ["code", "代码", "代码块"]].map(([k, label]) => `<button data-md="${k}" title="${label}" class="h-7 min-w-7 px-2.5 rounded-full text-xs font-medium border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition">${label}</button>`).join("")}
        </div>
        <textarea id="editContent" class="w-full min-h-[60vh] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-4 py-3 text-sm font-mono outline-none focus:border-brand-500 resize-y">${escapeHtml(doc.content || "")}</textarea>
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
  document.getElementById("btnUploadEdit").addEventListener("click", () => uploadFileModal((md) => {
    contentEl.value += (contentEl.value ? "\n" : "") + md;
    scheduleAutoSave({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState });
  }));
  document.getElementById("mdToolbar").querySelectorAll("[data-md]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await applyMdAction(btn.dataset.md, contentEl);
      scheduleAutoSave({ titleEl, contentEl, priceEl, repoEl, linkEl, saveState });
    });
  });
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
async function downloadDoc(id) {
  let doc;
  try {
    doc = await api(`/api/documents/${id}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  const content = `# ${doc.title || "untitled"}

${doc.content || ""}`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (doc.title || "document").replace(/[\\/:*?"<>|]/g, "_") + ".md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("已开始下载", "success");
}
function uploadFileModal(onDone) {
  const root = document.getElementById("modalRoot");
  const wrapper = document.createElement("div");
  wrapper.className = "fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm";
  wrapper.innerHTML = `
    <div class="w-[420px] max-w-[90vw] rounded-3xl bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 shadow-2xl p-6">
      <h3 class="text-lg font-semibold flex items-center gap-2 mb-4">${window.icon("upload")} 上传文件（图片可内嵌正文）</h3>
      <div id="uploadDrop" class="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-2xl p-8 text-center cursor-pointer hover:border-brand-500 transition">
        <div class="flex justify-center mb-2 text-neutral-400">${window.icon("upload").replace("w-4 h-4", "w-8 h-8")}</div>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">点击选择文件或拖拽到此处</p>
        <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">最大 20MB</p>
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
      const isImage = (r.mime_type || "").startsWith("image/");
      const md = isImage ? `![${r.original_name}](${r.url})` : `[${r.original_name}](${r.url})`;
      const result = wrapper.querySelector("#uploadResult");
      result.innerHTML = `
        <div class="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
          <div class="text-sm font-medium text-emerald-700 dark:text-emerald-300">上传成功</div>
          ${isImage ? `<img src="${escapeHtml(r.url)}" alt="" class="mt-2 max-h-48 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white" />` : ""}
          <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-2 break-all">${escapeHtml(file.name)}</div>
          <div class="flex gap-2 mt-2">
            <input id="fileUrl" readonly value="${escapeHtml(r.url)}" class="flex-1 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 py-1.5 text-xs font-mono" />
            <button id="btnCopyUrl" class="h-8 px-3 rounded-full text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 shrink-0">复制链接</button>
          </div>
          <div class="flex gap-2 mt-2">
            <button id="btnCopyMd" class="flex-1 h-8 px-2.5 rounded-full text-xs font-medium text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">复制 Markdown</button>
            ${onDone ? `<button id="btnInsert" class="flex-1 h-8 px-2.5 rounded-full text-xs font-medium text-white bg-brand-600 hover:bg-brand-700">插入正文</button>` : ""}
          </div>
        </div>`;
      const copyText = (t) => {
        const ta = document.createElement("textarea");
        ta.value = t;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      };
      wrapper.querySelector("#btnCopyUrl").addEventListener("click", () => {
        copyText(r.url);
        toast("已复制链接", "success");
      });
      wrapper.querySelector("#btnCopyMd").addEventListener("click", () => {
        copyText(md);
        toast("已复制 Markdown", "success");
      });
      if (onDone) {
        wrapper.querySelector("#btnInsert").addEventListener("click", () => {
          onDone(md);
          wrapper.remove();
          toast("已插入正文", "success");
        });
      }
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
  downloadDoc,
  editDoc,
  openDoc,
  showEmpty,
  uploadFileModal
};
//# sourceMappingURL=doc.js.map
