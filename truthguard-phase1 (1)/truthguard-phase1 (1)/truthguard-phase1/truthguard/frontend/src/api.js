export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Request failed');
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields || {};
  }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = { ...headers };
  if (body && !isFormData && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: Object.keys(finalHeaders).length > 0 ? finalHeaders : undefined,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: { message: 'Cannot reach the server. Check your connection.' } });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
