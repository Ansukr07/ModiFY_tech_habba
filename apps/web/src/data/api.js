export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Request failed");
  return body.data ?? body;
}

export const idem = () => crypto.randomUUID();
