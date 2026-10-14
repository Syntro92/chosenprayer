// Tiny client for the site's /api/admin/* endpoints. The panel is served from the same origin as the
// site, so the browser attaches the Supabase session cookie by itself; nothing is stored in JS.

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

let onUnauthorized: (() => void) | null = null;
/** The auth store registers itself here so any 401 sends the user back to the login screen. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function url(path: string, query?: Query) {
  const u = new URL(`/api/admin${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.pathname + u.search;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), {
      method,
      credentials: 'same-origin',
      // FormData sets its own multipart Content-Type (with the boundary); everything else is JSON.
      headers: opts.body !== undefined && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body)
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401 && path !== '/session') onUnauthorized?.();
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? res.statusText ?? 'Something went wrong.', e?.fields ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { body: form })
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
