const API_URL = process.env.NEXT_PUBLIC_API_URL;

let accessToken = null;
let unauthorizedHandler = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

// The refresh token rotates on every use — if two requests both 401 at once
// (near-certain here, since most pages fire several API calls in parallel)
// and each independently calls this, the second sees an already-rotated
// cookie and gets read as token reuse, which kills the whole session. Sharing
// one in-flight promise means concurrent callers get one real request.
let refreshPromise = null;

function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      accessToken = data.accessToken;
      return accessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseBody(res) {
  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  if (contentType.includes("application/pdf")) return res.blob();
  return null;
}

async function request(path, { method = "GET", body, headers, retry = true } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { method, body, headers, retry: false });
    }
    if (unauthorizedHandler) unauthorizedHandler();
    const error = new Error("Session expired");
    error.status = 401;
    throw error;
  }

  const data = await parseBody(res);

  if (!res.ok) {
    const message = (data && typeof data === "object" && data.error) || res.statusText;
    const error = new Error(message);
    error.status = res.status;
    error.issues = data?.issues;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body ?? {} }),
  patch: (path, body) => request(path, { method: "PATCH", body: body ?? {} }),
  del: (path) => request(path, { method: "DELETE" }),
};

export async function login(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseBody(res);
  if (!res.ok) {
    const error = new Error(data?.error || "Login failed");
    error.status = res.status;
    throw error;
  }
  accessToken = data.accessToken;
  return data.user;
}

export async function logout() {
  await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  accessToken = null;
}

export { refreshAccessToken as bootstrapSession };
