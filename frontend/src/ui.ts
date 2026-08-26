// @ts-nocheck
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function toast(message, type = "info") {
  const root = document.getElementById("toastRoot");
  const el = document.createElement("div");
  const palette = {
    info: "bg-slate-800 text-white dark:bg-slate-700",
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white"
  };
  el.className = `px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${palette[type] || palette.info} animate-[toastIn_.2s_ease]`;
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
      <div class="w-[360px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5">
        <h3 class="text-base font-semibold mb-2">${escapeHtml(title)}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-5">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-2">
          <button data-act="cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">取消</button>
          <button data-act="ok" class="px-4 py-2 rounded-lg text-sm font-medium text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"} transition">${escapeHtml(confirmText)}</button>
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
      <div class="w-[400px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5">
        <h3 class="text-base font-semibold mb-3">${escapeHtml(title)}</h3>
        ${multiline ? `<textarea data-input rows="4" placeholder="${escapeHtml(placeholder)}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500">${escapeHtml(defaultValue)}</textarea>` : `<input data-input type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" />`}
        <div class="flex justify-end gap-2 mt-4">
          <button data-act="cancel" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">取消</button>
          <button data-act="ok" class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">确定</button>
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
export {
  confirmDialog,
  escapeHtml,
  promptDialog,
  toast
};
//# sourceMappingURL=ui.js.map
