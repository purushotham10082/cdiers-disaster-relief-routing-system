export const getToken = () => localStorage.getItem('cdiers_token');
export const getUser = () => { try { return JSON.parse(localStorage.getItem('cdiers_user')); } catch { return null; } };
export const setSession = (t, u) => { localStorage.setItem('cdiers_token', t); localStorage.setItem('cdiers_user', JSON.stringify(u)); };
export const clearSession = () => { localStorage.removeItem('cdiers_token'); localStorage.removeItem('cdiers_user'); };

export async function api(method, url, body) {
  const t = getToken();
  let r;
  try {
    r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Cannot reach the API server. Is the backend running on port 5000?'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/auth/login') { clearSession(); window.location.reload(); }
  if (!r.ok) throw new Error(j.details ? `${j.error}: ${j.details.join('; ')}` : j.error || 'Request failed');
  return j;
}
