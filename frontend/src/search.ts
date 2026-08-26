// @ts-nocheck
import { api } from "./api.js";
import { escapeHtml } from "./ui.js";
import { state } from "./state.js";
let timer = null;
function setupSearch() {
  const input = document.getElementById("searchInput");
  const panel = document.getElementById("searchPanel");
  input.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(timer);
    if (!q) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      state.searchQuery = "";
      return;
    }
    state.searchQuery = q;
    timer = setTimeout(() => doSearch(q), 220);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim()) doSearch(input.value.trim());
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== input) panel.classList.add("hidden");
  });
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlight(text, q) {
  const esc = escapeHtml(text);
  if (!q) return esc;
  const re = new RegExp(escapeRegex(escapeHtml(q)), "gi");
  return esc.replace(re, (m) => `<mark>${m}</mark>`);
}
async function doSearch(q) {
  const panel = document.getElementById("searchPanel");
  let results;
  try {
    results = await api("/api/search?q=" + encodeURIComponent(q));
  } catch (e) {
    panel.innerHTML = `<div class="p-4 text-sm text-red-500">${escapeHtml(e.message)}</div>`;
    panel.classList.remove("hidden");
    return;
  }
  if (!results.length) {
    panel.innerHTML = `<div class="p-5 text-center text-sm text-neutral-400 dark:text-neutral-500">无匹配结果</div>`;
    panel.classList.remove("hidden");
    return;
  }
  panel.innerHTML = "";
  for (const r of results) {
    let snippet = "";
    const text = r.content || "";
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + q.length + 60);
      snippet = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
    } else if (r.repo_url && r.repo_url.toLowerCase().includes(q.toLowerCase())) {
      snippet = r.repo_url;
    } else if (r.link && r.link.toLowerCase().includes(q.toLowerCase())) {
      snippet = r.link;
    }
    const item = document.createElement("div");
    item.className = "px-4 py-3 cursor-pointer hover:bg-white dark:hover:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-800 last:border-0";
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-neutral-400 shrink-0">${window.icon("file")}</span>
        <span class="text-sm font-medium truncate">${highlight(r.title, q)}</span>
      </div>
      <div class="text-xs text-neutral-400 dark:text-neutral-500 mt-1 pl-6">${escapeHtml(r.project_name)} / ${escapeHtml(r.folder_name)}${r.author_name ? " · " + escapeHtml(r.author_name) : ""}</div>
      ${snippet ? `<div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1 pl-6 line-clamp-2">${highlight(snippet, q)}</div>` : ""}
    `;
    item.addEventListener("click", async () => {
      panel.classList.add("hidden");
      document.getElementById("searchInput").value = "";
      state.searchQuery = "";
      const tree = await import("./tree.js");
      if (state.currentProjectId !== r.project_id) {
        state.currentProjectId = r.project_id;
      }
      await tree.selectProject(r.project_id, { keepFolder: false });
      await tree.openFolder(r.folder_id);
      const doc = await import("./doc.js");
      await doc.openDoc(r.id);
    });
    panel.appendChild(item);
  }
  panel.classList.remove("hidden");
}
export {
  setupSearch
};
//# sourceMappingURL=search.js.map
