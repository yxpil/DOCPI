let token = localStorage.getItem("docpi_token") || "";
let onUnauthorized = null;
function getToken() {
  return token;
}
function setToken(t) {
  token = t || "";
  if (token) localStorage.setItem("docpi_token", token);
  else localStorage.removeItem("docpi_token");
}
function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}
async function api(path, { method = "GET", body, raw = false } = {}) {
  const headers = {};
  if (body !== void 0 && !raw) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== void 0 ? raw ? body : JSON.stringify(body) : void 0
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
  }
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const msg = data?.error || `请求失败 (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
export {
  api,
  getToken,
  setOnUnauthorized,
  setToken
};
//# sourceMappingURL=api.js.map
