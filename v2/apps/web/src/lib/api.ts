/* ============================================================================
   The API client. Token in localStorage, attached on every call; a 401 clears
   it and lands on the login page — one code path for "session over" everywhere.
   ========================================================================== */

const TOKEN_KEY = 'pestops.token';

export const getToken = () =>
  typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError(401, 'Signed out');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new ApiError(res.status, msg || res.statusText);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown) => call<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
};

/* ---------------------------------------------------------------- types */

export interface SessionUser {
  id: string; name: string; role: string; email: string; color: string; photo: string;
}

export interface Company {
  id: string; name: string; tagline: string; phone: string; email: string;
  gstin: string; addr: string; city: string; state: string; pin: string;
  gstRate: number; logo: string; sign: string; seal: string;
  hoursFrom: string; hoursTo: string;
  hoursDays: number[]; terms: string[];
  docTerms?: { quotation?: string[]; invoice?: string[]; contract?: string[]; service?: string[] };
  roleAccess?: Record<string, Record<string, boolean>>;
}

export interface Bootstrap {
  company: Company;
  branches: Array<{ id: string; name: string; code: string; areas: string[] }>;
  users: Array<{
    id: string; name: string; role: string; title: string; color: string;
    photo: string; skills: string[]; branches: string[];
  }>;
  services: Array<{
    id: string; code: string; name: string; cat: string; price: number;
    unit: string; mins: number; warranty: string; desc: string;
  }>;
}

export interface Client {
  id: string; name: string; type: string; contact: string; phone: string;
  email: string; addr: string; city: string; pin: string; gstin: string;
  since: string; color: string; area: string; branch: string;
  // the full v1 record — optional so older rows stay valid
  custKind?: string; salutation?: string; firstName?: string; lastName?: string;
  company?: string; language?: string; workPhone?: string; channels?: string[];
  gstTreatment?: string; placeOfSupply?: string; pan?: string; taxPref?: string;
  currency?: string; openingBalance?: number; payTerms?: string;
  propertySize?: string; portal?: boolean;
  billing?: Record<string, string>; shipping?: Record<string, string>;
  contacts?: Array<Record<string, string>>;
  docs?: Array<{ name: string; size: number; type: string; data: string }>;
  remarks?: string;
}

export interface DashboardStats {
  clients: number; leads: number; quotes: number; contracts: number;
  jobsToday: number; doneToday: number; waiting: number;
  billed: number; collected: number; outstanding: number;
}
