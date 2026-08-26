// @ts-nocheck
import { state } from "./state.js";
import { api, setToken, getToken, setOnUnauthorized } from "./api.js";
import { escapeHtml, toast, promptDialog, confirmDialog } from "./ui.js";
const isAdmin = () => state.user && state.user.role === "admin";
async function checkMe() {
  if (!getToken()) {
    state.user = null;
    state.myFolders = { all: false, folder_ids: [] };
    return;
  }
  try {
    const me = await api("/api/auth/me");
    state.user = me;
    if (me) {
      try {
        state.myFolders = await api("/api/auth/my-folders");
      } catch (_) {
        state.myFolders = { all: me.role === "admin", folder_ids: [] };
      }
    } else {
      state.myFolders = { all: false, folder_ids: [] };
    }
  } catch (e) {
    setToken("");
    state.user = null;
    state.myFolders = { all: false, folder_ids: [] };
  }
}
function canEditFolder(folderId) {
  if (!state.user) return false;
  if (state.user.role === "admin") return true;
  if (state.myFolders.all) return true;
  return state.myFolders.folder_ids.includes(folderId);
}
function renderUserArea() {
  const area = document.getElementById("userArea");
  const settingsBtn = document.getElementById("btnSettings");
  if (!state.user) {
    settingsBtn.classList.add("hidden");
    area.innerHTML = `
      <button id="btnLogin" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">登录</button>`;
    document.getElementById("btnLogin").addEventListener("click", showLoginModal);
    return;
  }
  settingsBtn.classList.remove("hidden");
  settingsBtn.innerHTML = window.icon("gear");
  settingsBtn.onclick = () => isAdmin() ? showAdminPanel() : showProfileModal();
  const avatar = state.user.avatar ? `<img src="${escapeHtml(state.user.avatar)}" class="h-7 w-7 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700" />` : `<span class="h-7 w-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center">${window.icon("user")}</span>`;
  area.innerHTML = `
    <div id="btnProfile" class="flex items-center gap-2 pl-2 cursor-pointer rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition px-2 py-1">
      ${avatar}
      <div class="leading-tight">
        <div class="text-sm font-medium">${escapeHtml(state.user.display_name || state.user.username)}</div>
        <div class="text-[11px] text-slate-400 dark:text-slate-500">${isAdmin() ? "管理员" : "工程师"}</div>
      </div>
    </div>
    <button id="btnLogout" title="退出登录" class="h-9 w-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">${window.icon("logout")}</button>`;
  document.getElementById("btnProfile").addEventListener("click", () => showProfileModal());
  document.getElementById("btnLogout").addEventListener("click", logout);
}
async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (_) {
  }
  setToken("");
  state.user = null;
  state.myFolders = { all: false, folder_ids: [] };
  renderUserArea();
  const { showEmpty } = await import("./doc.js");
  showEmpty();
  toast("已退出登录", "success");
}
function showLoginModal() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[360px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-semibold">登录</h3>
          <button data-close class="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">${window.icon("close")}</button>
        </div>
        <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">用户名</label>
        <input id="loginUser" type="text" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500" placeholder="用户名" />
        <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">密码</label>
        <input id="loginPass" type="password" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500" placeholder="密码" />
        <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">验证码</label>
        <div class="flex items-center gap-2 mb-4">
          <input id="loginCaptcha" type="text" class="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" placeholder="输入验证码" maxlength="6" />
          <img id="captchaImg" alt="验证码" title="点击刷新" class="h-10 w-28 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer object-cover" />
        </div>
        <div id="loginErr" class="hidden text-xs text-red-600 mb-3"></div>
        <button id="btnSubmitLogin" class="w-full h-10 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">登录</button>
      </div>
    </div>`;
  let captchaId = "";
  async function refreshCaptcha() {
    try {
      const c = await api("/api/auth/captcha");
      captchaId = c.id;
      document.getElementById("captchaImg").src = c.image;
    } catch (e) {
      toast(e.message, "error");
    }
  }
  refreshCaptcha();
  root.querySelector("[data-close]").addEventListener("click", () => root.innerHTML = "");
  document.getElementById("captchaImg").addEventListener("click", refreshCaptcha);
  const user = root.querySelector("#loginUser");
  user.focus();
  const pass = root.querySelector("#loginPass");
  const captchaInput = root.querySelector("#loginCaptcha");
  const submit = async () => {
    const errEl = root.querySelector("#loginErr");
    errEl.classList.add("hidden");
    if (!user.value.trim() || !pass.value) {
      errEl.textContent = "请输入用户名和密码";
      errEl.classList.remove("hidden");
      return;
    }
    if (!captchaInput.value.trim()) {
      errEl.textContent = "请输入验证码";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      const r = await api("/api/auth/login", { method: "POST", body: {
        username: user.value.trim(),
        password: pass.value,
        captcha_id: captchaId,
        captcha: captchaInput.value.trim()
      } });
      setToken(r.token);
      state.user = r.user;
      try {
        state.myFolders = await api("/api/auth/my-folders");
      } catch (_) {
        state.myFolders = { all: r.user.role === "admin", folder_ids: [] };
      }
      root.innerHTML = "";
      renderUserArea();
      toast(`欢迎，${r.user.display_name || r.user.username}`, "success");
      const tree = await import("./tree.js");
      await tree.loadProjects();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
      refreshCaptcha();
    }
  };
  root.querySelector("#btnSubmitLogin").addEventListener("click", submit);
  const onEnter = (e) => {
    if (e.key === "Enter") submit();
  };
  pass.addEventListener("keydown", onEnter);
  captchaInput.addEventListener("keydown", onEnter);
}
async function showProfileModal() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[520px] max-w-[92vw] max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-lg font-semibold flex items-center gap-2">${window.icon("user")} 个人资料</h3>
          <button data-close class="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">${window.icon("close")}</button>
        </div>
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <div class="flex items-center gap-4">
            <div id="avatarWrap" class="shrink-0 cursor-pointer group relative">
              ${state.user.avatar ? `<img src="${escapeHtml(state.user.avatar)}" class="h-20 w-20 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700" />` : `<span class="h-20 w-20 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center">${window.icon("user").replace("w-4 h-4", "w-9 h-9")}</span>`}
              <div class="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition">更换头像</div>
            </div>
            <div>
              <div class="font-semibold">${escapeHtml(state.user.display_name || state.user.username)}</div>
              <div class="text-sm text-slate-500 dark:text-slate-400">@${escapeHtml(state.user.username)} · ${isAdmin() ? "管理员" : "工程师"}</div>
              <input id="avatarFile" type="file" accept="image/*" class="hidden" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">显示名</label>
              <input id="pfName" value="${escapeHtml(state.user.display_name || "")}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">邮箱</label>
              <input id="pfEmail" value="${escapeHtml(state.user.email || "")}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">电话</label>
              <input id="pfPhone" value="${escapeHtml(state.user.phone || "")}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">QQ</label>
              <input id="pfQq" value="${escapeHtml(state.user.qq || "")}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">修改密码（留空不改）</label>
            <input id="pfPass" type="password" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
        </div>
        <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button id="btnTokenManage" class="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5">${window.icon("key")} API Token</button>
          <button data-close class="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">取消</button>
          <button id="btnSaveProfile" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">保存</button>
        </div>
      </div>
    </div>`;
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => root.innerHTML = ""));
  const avatarFile = root.querySelector("#avatarFile");
  root.querySelector("#avatarWrap").addEventListener("click", () => avatarFile.click());
  avatarFile.addEventListener("change", async () => {
    const file = avatarFile.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("头像图片需小于 2MB", "error");
      return;
    }
    const dataUrl = await readAsDataURL(file);
    try {
      const u = await api("/api/auth/me/avatar", { method: "PUT", body: { avatar: dataUrl } });
      state.user = u;
      renderUserArea();
      root.querySelector("#avatarWrap").innerHTML = `<img src="${escapeHtml(dataUrl)}" class="h-20 w-20 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700" />`;
      toast("头像已更新", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  });
  root.querySelector("#btnSaveProfile").addEventListener("click", async () => {
    try {
      const u = await api("/api/auth/me", { method: "PUT", body: {
        display_name: root.querySelector("#pfName").value.trim(),
        email: root.querySelector("#pfEmail").value.trim(),
        phone: root.querySelector("#pfPhone").value.trim(),
        qq: root.querySelector("#pfQq").value.trim(),
        password: root.querySelector("#pfPass").value || void 0
      } });
      state.user = u;
      renderUserArea();
      toast("资料已保存", "success");
      root.innerHTML = "";
    } catch (e) {
      toast(e.message, "error");
    }
  });
  root.querySelector("#btnTokenManage").addEventListener("click", () => showTokenModal());
}
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
async function showTokenModal() {
  let tokens;
  try {
    tokens = await api("/api/auth/api-tokens");
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  let projects = [];
  if (isAdmin()) {
    try {
      projects = await api("/api/projects");
    } catch (_) {
    }
  }
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[620px] max-w-[92vw] max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-lg font-semibold flex items-center gap-2">${window.icon("key")} API Token</h3>
          <button data-close class="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">${window.icon("close")}</button>
        </div>
        <div class="flex-1 overflow-y-auto p-5">
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">API Token 用于 AI / 脚本以 <code class="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">?token=TOKEN</code> 或 <code class="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Authorization: Bearer TOKEN</code> 方式调用接口读写文档。</p>
          <div id="tokenList" class="space-y-2"></div>
        </div>
        <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button id="btnNewToken" class="w-full h-10 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition">新建 Token</button>
        </div>
      </div>
    </div>`;
  root.querySelector("[data-close]").addEventListener("click", () => root.innerHTML = "");
  renderTokenList(root, tokens);
  root.querySelector("#btnNewToken").addEventListener("click", async () => {
    const name = await promptDialog({ title: "新建 API Token", placeholder: "用途说明（如：AI 自动维护文档）" });
    if (!name || !name.trim()) return;
    try {
      const r = await api("/api/auth/api-tokens", { method: "POST", body: { name: name.trim() } });
      root.innerHTML = `
        <div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div class="w-[480px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
            <h3 class="text-lg font-semibold flex items-center gap-2">${window.icon("key")} Token 已生成</h3>
            <p class="text-xs text-amber-600 dark:text-amber-400 mt-2 mb-3">请立即复制保存，此 Token 仅显示一次！</p>
            <textarea readonly class="w-full h-20 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono outline-none">${r.token}</textarea>
            <div class="flex justify-end gap-2 mt-4">
              <button id="btnCopyToken" class="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">复制</button>
              <button id="btnDoneToken" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">完成</button>
            </div>
          </div>
        </div>`;
      root.querySelector("#btnCopyToken").addEventListener("click", () => {
        const ta = root.querySelector("textarea");
        ta.select();
        document.execCommand("copy");
        toast("已复制", "success");
      });
      root.querySelector("#btnDoneToken").addEventListener("click", () => showTokenModal());
    } catch (e) {
      toast(e.message, "error");
    }
  });
}
function renderTokenList(root, tokens) {
  const list = root.querySelector("#tokenList");
  if (!tokens.length) {
    list.innerHTML = `<p class="text-sm text-slate-400 dark:text-slate-500 text-center py-6">暂无 Token</p>`;
    return;
  }
  list.innerHTML = "";
  for (const t of tokens) {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0";
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">${escapeHtml(t.name)}</div>
        <div class="text-xs text-slate-400 dark:text-slate-500">${escapeHtml(t.username || "")} · 创建于 ${escapeHtml(t.created_at || "")}</div>
      </div>
      <button data-del="${t.id}" class="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">${window.icon("trash")}</button>`;
    list.appendChild(row);
    row.querySelector(`[data-del="${t.id}"]`).addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "删除 Token", message: "确定删除该 API Token？使用它的 AI/脚本将立即失效。", danger: true });
      if (!ok) return;
      try {
        await api(`/api/auth/api-tokens/${t.id}`, { method: "DELETE" });
        toast("已删除", "success");
        showTokenModal();
      } catch (e) {
        toast(e.message, "error");
      }
    });
  }
}
async function showAdminPanel() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[860px] max-w-[94vw] h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 class="text-lg font-semibold flex items-center gap-2">${window.icon("gear")} 管理员后台</h3>
          <button data-close class="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">${window.icon("close")}</button>
        </div>
        <div class="flex flex-1 overflow-hidden">
          <nav class="w-44 border-r border-slate-100 dark:border-slate-800 py-3 space-y-1">
            <button data-tab="site" class="admin-tab w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 text-brand-600 bg-brand-50 dark:bg-brand-900/30">${window.icon("gear")} 站点设置</button>
            <button data-tab="users" class="admin-tab w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">${window.icon("shield")} 用户管理</button>
          </nav>
          <div class="flex-1 overflow-y-auto p-6" id="adminBody"></div>
        </div>
      </div>
    </div>`;
  root.querySelector("[data-close]").addEventListener("click", () => root.innerHTML = "");
  const tabs = root.querySelectorAll(".admin-tab");
  tabs.forEach((t) => t.addEventListener("click", async () => {
    tabs.forEach((x) => x.className = "admin-tab w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800");
    t.className = "admin-tab w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 text-brand-600 bg-brand-50 dark:bg-brand-900/30";
    if (t.dataset.tab === "site") await renderSettingsTab(root);
    else await renderUsersTab(root);
  }));
  await renderSettingsTab(root);
}
async function renderSettingsTab(root) {
  const body = root.querySelector("#adminBody");
  body.innerHTML = `
    <h4 class="font-semibold mb-4">站点设置</h4>
    <div class="space-y-4 max-w-md">
      <div><label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">站点名称</label>
        <input id="setName" value="${escapeHtml(state.settings.site_name || "")}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
      <div><label class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">站点描述</label>
        <input id="setDesc" value="${escapeHtml(state.settings.site_desc || "")}" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
      <button id="btnSaveSettings" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">保存设置</button>
    </div>`;
  body.querySelector("#btnSaveSettings").addEventListener("click", async () => {
    try {
      await api("/api/settings", { method: "PUT", body: { site_name: body.querySelector("#setName").value.trim(), site_desc: body.querySelector("#setDesc").value.trim() } });
      state.settings.site_name = body.querySelector("#setName").value.trim();
      state.settings.site_desc = body.querySelector("#setDesc").value.trim();
      document.getElementById("siteName").textContent = state.settings.site_name || "DocPI";
      document.title = `${state.settings.site_name || "DocPI"} · 开发文档公示`;
      toast("设置已保存", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  });
}
async function renderUsersTab(root) {
  const body = root.querySelector("#adminBody");
  let users;
  try {
    users = await api("/api/auth/users");
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  body.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h4 class="font-semibold">用户管理</h4>
      <button id="btnNewUser" class="h-8 px-3 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">新建用户</button>
    </div>
    <div id="usersList" class="space-y-1"></div>`;
  body.querySelector("#btnNewUser").addEventListener("click", () => userForm(root));
  const list = body.querySelector("#usersList");
  for (const u of users) {
    const admin = u.role === "admin";
    const row = document.createElement("div");
    row.className = "flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0";
    row.innerHTML = `
      <span class="h-9 w-9 rounded-full ${admin ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"} flex items-center justify-center shrink-0">${u.avatar ? `<img src="${escapeHtml(u.avatar)}" class="h-9 w-9 rounded-full object-cover"/>` : window.icon("user")}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">${escapeHtml(u.display_name || u.username)}</span>
          <span class="text-[11px] px-1.5 py-0.5 rounded ${admin ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}">${admin ? "管理员" : "工程师"}</span>
        </div>
        <div class="text-xs text-slate-400 dark:text-slate-500">@${escapeHtml(u.username)}${u.email ? " · " + escapeHtml(u.email) : ""}${u.phone ? " · " + escapeHtml(u.phone) : ""}</div>
      </div>
      <div class="flex gap-1 shrink-0">
        ${!admin ? `<button data-grant="${u.id}" class="h-7 px-2.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700">授权文件夹</button>` : ""}
        <button data-edit="${u.id}" class="h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">${window.icon("edit")}</button>
        <button data-del="${u.id}" class="${u.protected ? "hidden" : ""} h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">${window.icon("trash")}</button>
      </div>`;
    list.appendChild(row);
    row.querySelector(`[data-grant="${u.id}"]`)?.addEventListener("click", () => showGrantModal(u));
    row.querySelector(`[data-edit="${u.id}"]`)?.addEventListener("click", () => userEditForm(root, u));
    row.querySelector(`[data-del="${u.id}"]`)?.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "删除用户", message: `确定删除用户「${u.username}」？`, danger: true });
      if (!ok) return;
      try {
        await api(`/api/auth/users/${u.id}`, { method: "DELETE" });
        toast("已删除", "success");
        renderUsersTab(root);
      } catch (e) {
        toast(e.message, "error");
      }
    });
  }
}
async function showGrantModal(u) {
  let projects;
  try {
    projects = await api("/api/projects");
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  for (const p of projects) {
    p.folders = await api(`/api/projects/${p.id}/folders`);
  }
  const granted = await api(`/api/auth/users/${u.id}/folders`);
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[520px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 class="font-semibold">授权文件夹 · ${escapeHtml(u.username)}</h3>
          <button data-close class="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">${window.icon("close")}</button>
        </div>
        <div class="flex-1 overflow-y-auto p-5" id="grantBody"></div>
        <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 justify-end">
          <button data-cancel class="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">取消</button>
          <button id="btnSaveGrant" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">保存</button>
        </div>
      </div>
    </div>`;
  const selected = new Set(granted);
  const body = root.querySelector("#grantBody");
  const checkboxes = [];
  function buildTree(folders, parentId, depth) {
    const children = folders.filter((f) => f.parent_id === parentId);
    for (const f of children) {
      const wrap = document.createElement("label");
      wrap.className = "flex items-center gap-2 py-1.5 cursor-pointer";
      wrap.style.paddingLeft = `${depth * 20}px`;
      wrap.innerHTML = `<input type="checkbox" data-fid="${f.id}" class="grant-check accent-blue-600" ${selected.has(f.id) ? "checked" : ""} /> <span class="text-sm">${escapeHtml(f.name)}</span>`;
      body.appendChild(wrap);
      checkboxes.push(wrap.querySelector("input"));
      buildTree(folders, f.id, depth + 1);
    }
  }
  if (!projects.length) body.innerHTML = '<p class="text-sm text-slate-400 text-center py-6">暂无项目</p>';
  for (const p of projects) {
    body.innerHTML += `<div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2 mb-1">${escapeHtml(p.name)}</div>`;
    buildTree(p.folders, null, 0);
  }
  root.querySelector("[data-close]").addEventListener("click", () => renderUsersTabByRoot());
  root.querySelector("[data-cancel]").addEventListener("click", () => renderUsersTabByRoot());
  root.querySelector("#btnSaveGrant").addEventListener("click", async () => {
    const ids = checkboxes.filter((c) => c.checked).map((c) => Number(c.dataset.fid));
    try {
      await api(`/api/auth/users/${u.id}/folders`, { method: "PUT", body: { folder_ids: ids } });
      toast("已保存", "success");
      renderUsersTabByRoot();
    } catch (e) {
      toast(e.message, "error");
    }
  });
  function renderUsersTabByRoot() {
    showAdminPanel();
  }
}
function userForm(root) {
  root.innerHTML = `
    <div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[400px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
        <h3 class="text-lg font-semibold mb-4">新建用户</h3>
        <input id="fuUser" type="text" placeholder="用户名" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="fuName" type="text" placeholder="显示名（可选）" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="fuPass" type="password" placeholder="密码" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="fuEmail" type="text" placeholder="邮箱（可选）" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="fuPhone" type="text" placeholder="电话（可选）" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="fuQq" type="text" placeholder="QQ（可选）" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <select id="fuRole" class="w-full rounded-lg border px-3 py-2 text-sm mb-4 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600">
          <option value="engineer">工程师</option><option value="admin">管理员</option>
        </select>
        <div id="fuErr" class="hidden text-xs text-red-600 mb-3"></div>
        <div class="flex gap-2 justify-end">
          <button data-cancel class="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">取消</button>
          <button id="btnCreateUser" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">创建</button>
        </div>
      </div>
    </div>`;
  root.querySelector("[data-cancel]").addEventListener("click", () => showAdminPanel());
  root.querySelector("#btnCreateUser").addEventListener("click", async () => {
    const errEl = root.querySelector("#fuErr");
    const username = root.querySelector("#fuUser").value.trim();
    const password = root.querySelector("#fuPass").value;
    if (!username || !password) {
      errEl.textContent = "用户名和密码不能为空";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      await api("/api/auth/users", { method: "POST", body: {
        username,
        password,
        display_name: root.querySelector("#fuName").value.trim(),
        email: root.querySelector("#fuEmail").value.trim(),
        phone: root.querySelector("#fuPhone").value.trim(),
        qq: root.querySelector("#fuQq").value.trim(),
        role: root.querySelector("#fuRole").value
      } });
      toast("用户已创建", "success");
      showAdminPanel();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  });
}
function userEditForm(root, u) {
  root.innerHTML = `
    <div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="w-[400px] max-w-[90vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
        <h3 class="text-lg font-semibold mb-4">编辑用户 · ${escapeHtml(u.username)}</h3>
        <input id="euName" type="text" value="${escapeHtml(u.display_name || "")}" placeholder="显示名" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="euEmail" type="text" value="${escapeHtml(u.email || "")}" placeholder="邮箱" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="euPhone" type="text" value="${escapeHtml(u.phone || "")}" placeholder="电话" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="euQq" type="text" value="${escapeHtml(u.qq || "")}" placeholder="QQ" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <input id="euPass" type="password" placeholder="新密码（留空不改）" class="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600" />
        <select id="euRole" class="w-full rounded-lg border px-3 py-2 text-sm mb-4 outline-none focus:border-brand-500 dark:bg-slate-800 dark:border-slate-600">
          <option value="engineer" ${u.role === "engineer" ? "selected" : ""}>工程师</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>管理员</option>
        </select>
        <div id="euErr" class="hidden text-xs text-red-600 mb-3"></div>
        <div class="flex gap-2 justify-end">
          <button data-cancel class="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">取消</button>
          <button id="btnSaveUser" class="h-9 px-4 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700">保存</button>
        </div>
      </div>
    </div>`;
  root.querySelector("[data-cancel]").addEventListener("click", () => showAdminPanel());
  root.querySelector("#btnSaveUser").addEventListener("click", async () => {
    const body = {
      display_name: root.querySelector("#euName").value.trim(),
      email: root.querySelector("#euEmail").value.trim(),
      phone: root.querySelector("#euPhone").value.trim(),
      qq: root.querySelector("#euQq").value.trim(),
      role: root.querySelector("#euRole").value
    };
    const password = root.querySelector("#euPass").value;
    if (password) body.password = password;
    try {
      await api(`/api/auth/users/${u.id}`, { method: "PUT", body });
      toast("已保存", "success");
      showAdminPanel();
    } catch (e) {
      const errEl = root.querySelector("#euErr");
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  });
}
function initAuth() {
  setOnUnauthorized(() => {
    if (state.user) {
      setToken("");
      state.user = null;
      state.myFolders = { all: false, folder_ids: [] };
      renderUserArea();
      toast("登录已过期，请重新登录", "error");
    }
  });
}
export {
  canEditFolder,
  checkMe,
  initAuth,
  renderUserArea,
  showAdminPanel,
  showProfileModal
};
//# sourceMappingURL=auth.js.map
