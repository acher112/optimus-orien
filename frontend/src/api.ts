export type User = {
  id: number;
  name: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_color?: string;
  avatar_image?: string;
  role: string;
  organisation: number | null;
  organisation_name?: string | null;
  allow_org_admin_student_access?: boolean;
  school: number | null;
  school_name?: string | null;
  is_staff?: boolean;
  is_superuser?: boolean;
  must_change_password?: boolean;
  student_id?: number | null;
  currency?: string;
  csrfToken?: string;
};

export const API_BASE_URL = '/api/v1/';

export type Dashboard = {
  counts: { students: number; schools: number; classes: number; open_cases: number; teachers: number };
  stats: { academic_average: number | null; attendance_rate: number | null; grade_records: number; attendance_records: number };
  schools: { id: number; name: string; students: number; academic_average: number | null; attendance_rate: number | null }[];
  recent_cases: Case[];
  recent_students: Student[];
  attention: number;
  recent_notifications: { id: number; title: string; body: string }[];
};

export type Student = {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  admission_number: string;
  class_name?: string;
  school__name?: string;
  active?: boolean;
};

export type Case = { id: number; title: string; status: string; priority: string; student_id: number; student_name?: string; school_name?: string };
export type Resource = { id: number; [key: string]: unknown };

let csrfToken = '';

export function getCookieCsrf(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(^|;)\s*csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
}

export async function fetchCsrfToken(force = false): Promise<string> {
  const cookieVal = getCookieCsrf();
  if (!force && cookieVal) {
    csrfToken = cookieVal;
    return csrfToken;
  }
  try {
    const r = await fetch('/api/v1/auth/csrf/', { credentials: 'include' });
    if (r.ok) {
      const data = await r.json();
      if (data && data.csrfToken) {
        csrfToken = data.csrfToken;
        return csrfToken;
      }
    }
  } catch {}
  return csrfToken || cookieVal;
}

if (typeof window !== 'undefined') {
  // Pre-warm CSRF token in the background so form submits never wait for a preliminary round-trip
  fetchCsrfToken().catch(() => {});
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const cookieVal = getCookieCsrf();
    if (cookieVal) {
      csrfToken = cookieVal;
    } else if (!csrfToken) {
      await fetchCsrfToken(true);
    }
  }

  const cleanUrl = url.replace(/^\/?(api\/v1\/)?/, '');
  const isAuthMe = cleanUrl.includes('auth/me');
  const makeReq = (token: string) => fetch('/api/v1/' + cleanUrl, {
    ...options,
    credentials: 'include',
    cache: options.cache || (isAuthMe ? 'no-store' : 'default'),
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && token ? { 'X-CSRFToken': token } : {}),
      ...(isAuthMe ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } : {}),
      ...(options.headers || {})
    }
  });

  let response = await makeReq(csrfToken);

  // If 403 CSRF failure occurs on a mutation, get fresh token and retry once
  if (!response.ok && response.status === 403 && method !== 'GET') {
    let clonedText = '';
    try { clonedText = await response.clone().text(); } catch {}
    if (clonedText.toLowerCase().includes('csrf')) {
      const freshToken = await fetchCsrfToken(true);
      response = await makeReq(freshToken);
    }
  }

  if (!response.ok) {
    const ct = response.headers.get('content-type') || '';
    let info: any = {};
    if (ct.includes('application/json')) {
      try { info = await response.json(); } catch {}
    }

    const detailStr = (typeof info === 'string' ? info : (info?.detail || info?.message || '')).toLowerCase();
    const isLoginOrRegister = cleanUrl.includes('auth/login') || cleanUrl.includes('auth/register');
    const isAuthFailure = !isLoginOrRegister && (
      response.status === 401 ||
      (response.status === 403 && (
        detailStr.includes('authentication') ||
        detailStr.includes('credentials were not provided') ||
        detailStr.includes('not authenticated') ||
        detailStr.includes('session') ||
        info?.code === 'not_authenticated'
      ))
    );

    if (isAuthFailure) {
      try {
        localStorage.removeItem('optimus_user');
        localStorage.removeItem('optimus_active_campus_id');
        localStorage.removeItem('optimus_subscription');
        localStorage.removeItem('optimus_entitlements');
        sessionStorage.clear();
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('optimus:session-expired', {
          detail: { url, status: response.status }
        }));

        const path = window.location.pathname;
        const isAuthOrPublic = path === '/login' || path === '/register' || path === '/signin' ||
          path === '/' || path.startsWith('/about') || path.startsWith('/privacy') ||
          path.startsWith('/terms') || path.startsWith('/contact') || path.startsWith('/platform') ||
          path.startsWith('/portals');

        if (!isAuthOrPublic) {
          if (path === '/admin' || path.startsWith('/admin')) {
            window.history.replaceState(null, '', '/admin?session_expired=1');
          } else {
            window.history.replaceState(null, '', '/login?session_expired=1');
          }
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      }

      throw new Error('Your session has expired. Please sign in again.');
    }

    if (!ct.includes('application/json')) {
      if (response.status === 403) throw new Error('Access denied (403). Your session may have expired — please refresh and sign in again.');
      if (response.status === 401) throw new Error('Authentication required (401). Please sign in.');
      throw new Error(`Server error ${response.status}. Please try again or contact support.`);
    }

    if (info) {
      if (typeof info === 'string') throw new Error(info);
      if (info.detail) throw new Error(info.detail);
      if (Array.isArray(info.non_field_errors) && info.non_field_errors.length) throw new Error(info.non_field_errors.join(', '));
      const entries = Object.entries(info);
      if (entries.length > 0) {
        const msgs = entries.map(([k, v]) => `${k.replace('_', ' ')}: ${Array.isArray(v) ? v.join(' ') : String(v)}`);
        throw new Error(msgs.join('; '));
      }
    }
    throw new Error(`HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  const text = await response.text();
  if (!text || !text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export const login = async (username: string, password: string) => {
  const u = await request<User & { csrfToken?: string }>('auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (u.csrfToken) {
    csrfToken = u.csrfToken;
  }
  return u;
};

export const register = async (data: Record<string, unknown>) => {
  const u = await request<User & { csrfToken?: string }>('auth/register/', { method: 'POST', body: JSON.stringify(data) });
  if (u.csrfToken) {
    csrfToken = u.csrfToken;
  }
  return u;
};

export const logout = async () => {
  try {
    await request('auth/logout/', { method: 'POST' });
  } finally {
    csrfToken = '';
  }
};

export const list = async <T>(name: string, params?: Record<string, string | number>) => {
  let [base, existingQuery] = name.split('?');
  base = base.replace(/\/+$/, '') + '/';
  const q = new URLSearchParams(existingQuery || '');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
  }
  // For core reference collections used in dropdowns (classes, subjects, schools, years, teachers),
  // ensure page_size=500 so dropdowns are never truncated by the default 25 pagination limit.
  const cleanBase = base.replace(/^\/+|\/+$/g, '');
  if (['classes', 'subjects', 'schools', 'years', 'teachers'].includes(cleanBase) && !q.has('page_size') && !q.has('page')) {
    q.set('page_size', '500');
  }
  const qs = q.toString();
  const url = qs ? `${base}?${qs}` : base;
  const x = await request<{ results: T[] } | T[]>(url);
  return Array.isArray(x) ? x : x.results;
};

export const create = (name: string, data: Record<string, unknown>) =>
  request<Resource>(name + '/', { method: 'POST', body: JSON.stringify(data) });

export const update = (name: string, id: number, data: Record<string, unknown>) =>
  request<Resource>(`${name}/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });

export const destroy = (name: string, id: number) =>
  request<void>(`${name}/${id}/`, { method: 'DELETE' });

export const createAccount = (data: Record<string, unknown>) =>
  request<Record<string, unknown>>('accounts/', { method: 'POST', body: JSON.stringify(data) });

export const registerCampus = (data: Record<string, unknown>) =>
  request<Resource>('campuses/register/', { method: 'POST', body: JSON.stringify(data) });

export const schoolUsers = (schoolId: number) =>
  request<{ results: Array<{ id: number; name: string; username: string; email?: string; role: string; date_joined?: string; admission_number?: string }> }>(
    `schools/${schoolId}/users/`
  );

export const updateProfile = (data: Record<string, unknown>) =>
  request<User>('auth/me/', { method: 'PATCH', body: JSON.stringify(data) });

export const changePassword = (data: { current_password?: string; password?: string; old_password?: string; new_password?: string }) =>
  request<{ ok: boolean; detail: string }>('auth/password/', { method: 'POST', body: JSON.stringify(data) });

export const forgotPassword = (identifier: string) =>
  request<{ ok: boolean; detail: string; uid: string; token: string; email?: string }>('auth/forgot-password/', {
    method: 'POST',
    body: JSON.stringify({ identifier })
  });

export const resetPassword = (data: { uid: string; token: string; password: string }) =>
  request<{ ok: boolean; detail: string }>('auth/reset-password/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
