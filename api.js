/**
 * 日翊收發進貨平台 - API 呼叫模組
 * 統一封裝所有後端 API 請求
 */

const BASE = '';  // 同源，不需要前綴

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(BASE + url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '請求失敗');
    return data.data;
  } catch (e) {
    console.error(`[API] ${url}`, e.message);
    throw e;
  }
}

// ── 帳號驗證 ──────────────────────────────────────────
const AuthAPI = {
  login:    (userId, password)   => apiFetch('/api/auth/login',    { method: 'POST', body: { userId, password } }),
  logout:   ()                   => apiFetch('/api/auth/logout',   { method: 'POST' }),
  me:       ()                   => apiFetch('/api/auth/me'),
  register: (userId, password, name) => apiFetch('/api/auth/register', { method: 'POST', body: { userId, password, name } })
};

// ── 角色管理 ──────────────────────────────────────────
const RoleAPI = {
  list:   ()                      => apiFetch('/api/roles'),
  create: (name, tabs)            => apiFetch('/api/roles',          { method: 'POST',   body: { name, tabs } }),
  update: (id, name, tabs)        => apiFetch(`/api/roles/${id}`,    { method: 'PUT',    body: { name, tabs } }),
  delete: (id)                    => apiFetch(`/api/roles/${id}`,    { method: 'DELETE' })
};

// ── 使用者管理 ────────────────────────────────────────
const UserAPI = {
  list:   ()                      => apiFetch('/api/users'),
  create: (userId, password, name, roleId) =>
                                     apiFetch('/api/users',          { method: 'POST',   body: { userId, password, name, roleId } }),
  update: (userId, name, roleId, password) =>
                                     apiFetch(`/api/users/${userId}`,{ method: 'PUT',    body: { name, roleId, password } }),
  delete: (userId)                => apiFetch(`/api/users/${userId}`,{ method: 'DELETE' })
};

// ── 進貨資料 ──────────────────────────────────────────
const ProductAPI = {
  getByDate:    (date)       => apiFetch(`/api/products?date=${date}`),
  getDates:     ()           => apiFetch('/api/products/dates'),
  importItems:  (items, date)=> apiFetch('/api/products/import',       { method: 'POST', body: { items, date } }),
  create:       (data)       => apiFetch('/api/products',               { method: 'POST', body: data }),
  delete:       (id)         => apiFetch(`/api/products/${id}`,         { method: 'DELETE' }),
  batchDelete:  (ids)        => apiFetch('/api/products/batch-delete',  { method: 'POST', body: { ids } }),
  receive:      (id, data)   => apiFetch(`/api/products/${id}/receive`, { method: 'PUT',  body: data }),
  review:       (id, data)   => apiFetch(`/api/products/${id}/review`,  { method: 'PUT',  body: data }),
  reply:        (id, data)   => apiFetch(`/api/products/${id}/reply`,   { method: 'PUT',  body: data })
};
