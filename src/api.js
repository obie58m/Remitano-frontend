/**
 * API base URL.
 * - Dev (default): empty → same-origin `/api/...` so Vite proxies to Rails (avoids CORS / "Failed to fetch").
 * - Production: set VITE_API_URL=https://your-api.example.com
 */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE ? `${API_BASE}${p}` : p
}

async function apiFetch(path, options) {
  try {
    return await fetch(apiUrl(path), options)
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        'Could not reach the API. From backend/, run `bin/rails server -p 3000`. In dev, use `npm run dev` (Vite proxies /api to port 3000). If you set VITE_API_URL in .env, ensure that host is reachable and CORS allows this origin.',
      )
    }
    throw err
  }
}

function authHeaders(token) {
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export async function register(payload) {
  const res = await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.errors?.join?.(', ') || data.error || 'Register failed')
  }
  return data
}

export async function login(payload) {
  const res = await apiFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Login failed')
  return data
}

/** Current user for the given JWT; throws with `err.status === 401` if token is invalid or expired. */
export async function fetchCurrentUser(token) {
  const res = await apiFetch('/api/v1/auth/me', {
    headers: authHeaders(token),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    const err = new Error(data.error || 'Session expired')
    err.status = 401
    throw err
  }
  if (!res.ok) throw new Error(data.error || 'Could not load profile')
  return data.user
}

export async function fetchSharedVideos(token) {
  const res = await apiFetch('/api/v1/shared_videos', {
    headers: authHeaders(token),
  })
  const data = await res.json().catch(() => [])
  if (!res.ok) throw new Error(data.error || 'Could not load videos')
  return data
}

export async function createSharedVideo(token, youtubeUrl) {
  const res = await apiFetch('/api/v1/shared_videos', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ youtube_url: youtubeUrl }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.errors?.join?.(', ') || 'Share failed')
  }
  return data
}

export async function deleteSharedVideo(token, id) {
  const res = await apiFetch(`/api/v1/shared_videos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (res.status === 204) return
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || data.errors?.join?.(', ') || 'Remove failed')
  }
}

export function cableUrl(token) {
  let wsBase
  if (API_BASE) {
    wsBase = API_BASE.replace(/^https/, 'wss').replace(/^http/, 'ws')
  } else if (typeof window !== 'undefined') {
    const { protocol, host } = window.location
    wsBase = protocol === 'https:' ? `wss://${host}` : `ws://${host}`
  } else {
    wsBase = 'ws://127.0.0.1:5173'
  }
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${wsBase}/cable${q}`
}
