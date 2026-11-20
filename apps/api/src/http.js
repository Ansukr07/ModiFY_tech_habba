import crypto from "node:crypto";

export function requestId() {
  return crypto.randomUUID();
}

export function sendError(res, status, code, message, extra = {}) {
  res.status(status).json({
    error: {
      code,
      message,
      request_id: extra.request_id || requestId(),
      retryable: Boolean(extra.retryable),
      field_errors: extra.field_errors,
    },
  });
}

export function sendData(res, data, status = 200) {
  res.status(status).json({ data });
}

export function rejectCibil(obj) {
  const s = JSON.stringify(obj);
  return s.includes("cibilScore") || s.includes("cibil_score");
}

export function hashJson(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(obj))).digest("hex");
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.keys(v)
      .sort()
      .reduce((a, k) => {
        a[k] = canonical(v[k]);
        return a;
      }, {});
  }
  return v;
}
