import axios from 'axios'

const TOKEN_KEY = 'ebook_token'
const REFRESH_KEY = 'ebook_refresh_token'

export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE || 'https://device-api.expomadeinworld.com'

export function getAccessToken(): string | null {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.token || null } catch { return null }
}
export function setAccessToken(token: string, expires_at?: string) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expires_at }))
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
}
export function getAccessTokenExp(): number | null {
  try { return new Date(JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')?.expires_at).getTime() || null } catch { return null }
}
export function getRefreshToken(): string | null {
  try { return JSON.parse(localStorage.getItem(REFRESH_KEY) || 'null')?.refresh_token || null } catch { return null }
}
export function setRefreshToken(refresh_token: string, refresh_expires_at?: string) {
  localStorage.setItem(REFRESH_KEY, JSON.stringify({ refresh_token, refresh_expires_at }))
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

let isRefreshing = false
let waiters: { resolve: (t: string)=>void; reject: (e:any)=>void }[] = []

async function refreshOnce(): Promise<string> {
  if (isRefreshing) return new Promise((resolve,reject)=>waiters.push({resolve,reject}))
  isRefreshing = true
  try {
    const rt = getRefreshToken()
    if (!rt) throw new Error('No refresh token')
    const res = await axios.post(`${AUTH_BASE}/api/auth/token/refresh`, { refresh_token: rt, rotate: false })
    const token = res.data?.token as string
    const tokenExp = res.data?.expires_at as string
    const newRt = res.data?.refresh_token as string | undefined
    const newRtExp = res.data?.refresh_expires_at as string | undefined
    if (!token) throw new Error('Invalid refresh response')
    setAccessToken(token, tokenExp)
    if (newRt && newRtExp) setRefreshToken(newRt, newRtExp)
    waiters.forEach(w => w.resolve(token)); waiters = []
    return token
  } catch (e) {
    waiters.forEach(w => w.reject(e)); waiters = []
    clearTokens()
    throw e
  } finally {
    isRefreshing = false
  }
}

export function installAxiosInterceptors() {
  axios.interceptors.request.use(async (cfg) => {
    const url = typeof cfg.url === 'string' ? cfg.url : ''
    const isRefreshCall = url.includes('/api/auth/token/refresh')

    // Proactively refresh if access token is very close to expiring (<10s)
    // IMPORTANT: never try to refresh while performing the refresh call itself to avoid deadlocks.
    if (!isRefreshCall) {
      const exp = getAccessTokenExp()
      if (exp && exp - Date.now() < 10_000) {
        try { await refreshOnce() } catch {}
      }
    }

    // Attach Authorization except for refresh call (body carries refresh_token)
    if (!isRefreshCall) {
      const tok = getAccessToken()
      if (tok) {
        cfg.headers = cfg.headers || {}
        cfg.headers['Authorization'] = `Bearer ${tok}`
      }
    }
    return cfg
  })

  axios.interceptors.response.use(r => r, async (error) => {
    const original = error.config || {}
    const url = typeof original.url === 'string' ? original.url : ''
    const isRefreshCall = url.includes('/api/auth/token/refresh')

    if (!isRefreshCall && error?.response?.status === 401 && !original?._retry) {
      original._retry = true
      try {
        const newTok = await refreshOnce()
        original.headers = original.headers || {}
        original.headers['Authorization'] = `Bearer ${newTok}`
        return axios(original)
      } catch (e) {
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  })
}

