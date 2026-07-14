// Session, backend API client, and localStorage helpers.

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('bilisops_user') || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) sessionStorage.setItem('bilisops_user', JSON.stringify(session));
  else sessionStorage.removeItem('bilisops_user');
}

export async function api(path, opts = {}) {
  const session = getSession();
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.token || ''}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && session) {
    setSession(null);
    window.location.reload();
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

export function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem('bilisops_' + key));
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  localStorage.setItem('bilisops_' + key, JSON.stringify(value));
}

export function timeLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function initials(name) {
  return String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
