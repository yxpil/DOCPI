// API 客户端：Cookie 会话为主，兼容 Bearer token（AI 调用）
let token = localStorage.getItem('docpi_token') || '';
let onUnauthorized: (() => void) | null = null;

export function getToken(): string {
  return token;
}

export function setToken(t: string): void {
  token = t || '';
  if (token) localStorage.setItem('docpi_token', token);
  else localStorage.removeItem('docpi_token');
}

export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  raw?: boolean;
}

export interface ApiError extends Error {
  status: number;
}

export async function api<T = any>(
  path: string,
  { method = 'GET', body, raw = false }: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? (raw ? (body as BodyInit) : JSON.stringify(body)) : undefined,
  });

  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch (_) {
    /* 非 JSON 响应 */
  }

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    const msg = (data as { error?: string } | null)?.error || `请求失败 (${res.status})`;
    const err = new Error(msg) as ApiError;
    err.status = res.status;
    throw err;
  }
  return data as T;
}
