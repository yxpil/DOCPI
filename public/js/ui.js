function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function toast(message, type = "info") {
  const root = document.getElementById("toastRoot");
  const el = document.createElement("div");
  const palette = {
    info: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black",
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white"
  };
  el.className = `px-4 py-2.5 rounded-full shadow-lg text-sm font-medium ${palette[type] || palette.info} animate-[toastIn_.2s_ease]`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("opacity-0", "transition-opacity", "duration-300");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}
function confirmDialog({ title, message, confirmText = "确定", danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById("modalRoot");
    const wrapper = document.createElement("div");
    wrapper.className = "fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm";
    wrapper.innerHTML = `
      <div class="w-[360px] max-w-[90vw] rounded-3xl bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 shadow-2xl p-5">
        <h3 class="text-base font-semibold mb-2">${escapeHtml(title)}</h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-5">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-2">
          <button data-act="cancel" class="px-4 py-2 rounded-full text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition">取消</button>
          <button data-act="ok" class="px-4 py-2 rounded-full text-sm font-medium text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"} transition">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    root.appendChild(wrapper);
    wrapper.querySelector('[data-act="cancel"]').onclick = () => {
      wrapper.remove();
      resolve(false);
    };
    wrapper.querySelector('[data-act="ok"]').onclick = () => {
      wrapper.remove();
      resolve(true);
    };
  });
}
function promptDialog({ title, placeholder = "", defaultValue = "", valueLabel = "名称", multiline = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById("modalRoot");
    const wrapper = document.createElement("div");
    wrapper.className = "fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm";
    wrapper.innerHTML = `
      <div class="w-[400px] max-w-[90vw] rounded-3xl bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 shadow-2xl p-5">
        <h3 class="text-base font-semibold mb-3">${escapeHtml(title)}</h3>
        ${multiline ? `<textarea data-input rows="4" placeholder="${escapeHtml(placeholder)}" class="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 py-2 text-sm outline-none focus:border-brand-500">${escapeHtml(defaultValue)}</textarea>` : `<input data-input type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" class="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black px-3 py-2 text-sm outline-none focus:border-brand-500" />`}
        <div class="flex justify-end gap-2 mt-4">
          <button data-act="cancel" class="px-4 py-2 rounded-full text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition">取消</button>
          <button data-act="ok" class="px-4 py-2 rounded-full text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">确定</button>
        </div>
      </div>`;
    root.appendChild(wrapper);
    const input = wrapper.querySelector("[data-input]");
    input.focus();
    wrapper.querySelector('[data-act="cancel"]').onclick = () => {
      wrapper.remove();
      resolve(null);
    };
    wrapper.querySelector('[data-act="ok"]').onclick = () => {
      const v = input.value;
      wrapper.remove();
      resolve(v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !multiline) {
        const v = input.value;
        wrapper.remove();
        resolve(v);
      }
    });
  });
}
function contextMenu(items, x, y) {
  const old = document.getElementById("ctxMenu");
  if (old) old.remove();
  const menu = document.createElement("div");
  menu.id = "ctxMenu";
  menu.className = "fixed z-[110] min-w-[176px] rounded-2xl bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 shadow-2xl py-1 select-none";
  menu.innerHTML = items.map((it) => `
    <button data-ctx class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-neutral-100 dark:hover:bg-neutral-900 transition ${it.danger ? "text-red-600 dark:text-red-400" : "text-neutral-700 dark:text-neutral-200"}">
      <span class="shrink-0 opacity-70">${it.icon ? window.icon(it.icon) : ""}</span>
      <span>${escapeHtml(it.label)}</span>
    </button>`).join("");
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + "px";
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + "px";
  const btns = [...menu.querySelectorAll("[data-ctx]")];
  btns.forEach((btn, i) => btn.addEventListener("click", () => {
    menu.remove();
    if (items[i] && items[i].onClick) items[i].onClick();
  }));
  const close = () => menu.remove();
  setTimeout(() => {
    document.addEventListener("click", close, { once: true });
    document.addEventListener("contextmenu", close, { once: true });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        menu.remove();
        document.removeEventListener("keydown", esc);
      }
    });
    window.addEventListener("blur", close, { once: true });
  }, 0);
}
export {
  confirmDialog,
  contextMenu,
  escapeHtml,
  promptDialog,
  toast
};
//# sourceMappingURL=ui.js.map
