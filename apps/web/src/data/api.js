export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error?.message || "Request failed");
    err.code = body.error?.code;
    err.retryable = Boolean(body.error?.retryable);
    throw err;
  }
  return body.data ?? body;
}

export const idem = () => crypto.randomUUID();
