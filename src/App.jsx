import { useCallback, useEffect, useMemo, useState } from 'react'
import { createConsumer } from '@rails/actioncable'
import {
  cableUrl,
  createSharedVideo,
  deleteSharedVideo,
  fetchCurrentUser,
  fetchSharedVideos,
  login,
  register,
} from './api'
import { youtubeThumbnailUrl } from './youtube'
import './App.css'

const TOKEN_KEY = 'yt_share_token'
const USER_KEY = 'yt_share_user'

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const u = JSON.parse(raw)
    if (
      u &&
      typeof u.id === 'number' &&
      typeof u.email === 'string' &&
      typeof u.name === 'string'
    ) {
      return u
    }
    return null
  } catch {
    return null
  }
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  autoComplete,
  minLength,
  required,
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggleVisible}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() =>
    localStorage.getItem(TOKEN_KEY) ? readStoredUser() : null,
  )
  const [videos, setVideos] = useState([])
  const [shareUrl, setShareUrl] = useState('')
  const [formError, setFormError] = useState('')
  const [listError, setListError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authFields, setAuthFields] = useState({
    email: '',
    password: '',
    password_confirmation: '',
    name: '',
  })
  const [toast, setToast] = useState(null)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [showRegPasswordConfirm, setShowRegPasswordConfirm] = useState(false)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    setShowLoginPassword(false)
    setShowRegPassword(false)
    setShowRegPasswordConfirm(false)
  }, [authMode])

  const persistAuth = useCallback((nextToken, nextUser) => {
    if (nextToken) {
      localStorage.setItem(TOKEN_KEY, nextToken)
      if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  useEffect(() => {
    if (!token || user) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const u = await fetchCurrentUser(token)
        if (cancelled || !u) return
        setUser(u)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
      } catch (err) {
        if (!cancelled && err.status === 401) persistAuth(null, null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, user, persistAuth])

  const loadVideos = useCallback(async () => {
    if (!token) {
      setVideos([])
      return
    }
    try {
      const list = await fetchSharedVideos(token)
      setVideos(Array.isArray(list) ? list : [])
    } catch {
      setVideos([])
    }
  }, [token])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  useEffect(() => {
    if (!token) return undefined

    const consumer = createConsumer(cableUrl(token))
    const sub = consumer.subscriptions.create('VideoNotificationsChannel', {
      received(data) {
        if (data?.type === 'new_video') {
          setToast({
            title: data.title,
            sharer_name: data.sharer_name,
            youtube_video_id: data.youtube_video_id,
          })
          loadVideos()
        }
      },
    })

    return () => {
      sub.unsubscribe()
      consumer.disconnect()
    }
  }, [token, loadVideos])

  const onAuthSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    try {
      if (authMode === 'register') {
        const data = await register(authFields)
        persistAuth(data.token, data.user)
      } else {
        const data = await login({
          email: authFields.email,
          password: authFields.password,
        })
        persistAuth(data.token, data.user)
      }
    } catch (err) {
      setFormError(err.message)
    }
  }

  const onRemoveShared = async (id) => {
    setListError('')
    setRemovingId(id)
    try {
      await deleteSharedVideo(token, id)
      setVideos((list) => list.filter((v) => v.id !== id))
    } catch (err) {
      setListError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  const onShare = async (e) => {
    e.preventDefault()
    setFormError('')
    setListError('')
    try {
      await createSharedVideo(token, shareUrl.trim())
      setShareUrl('')
      await loadVideos()
    } catch (err) {
      setFormError(err.message)
    }
  }

  const logout = () => {
    persistAuth(null, null)
    setVideos([])
    setToast(null)
    setFormError('')
    setListError('')
  }

  const heading = useMemo(
    () => (user ? `Hi, ${user.name}` : 'YouTube video sharing'),
    [user],
  )

  const appClass = `app${toast ? ' has-toast' : ''}`

  return (
    <div className={appClass}>
      {toast && (
        <div className="banner" role="status">
          <div className="banner-main">
            {toast.youtube_video_id && (
              <img
                className="banner-thumb"
                src={youtubeThumbnailUrl(toast.youtube_video_id)}
                alt=""
                width={88}
                height={50}
              />
            )}
            <span>
              <strong>{toast.sharer_name}</strong> shared: {toast.title}
            </span>
          </div>
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setToast(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <header className="app-header">
        <h1>{heading}</h1>
        {user ? (
          <p className="sub">
            Signed in as {user.email}
            <button type="button" className="link" onClick={logout}>
              Log out
            </button>
          </p>
        ) : (
          <p className="sub">Sign in to share videos and see the feed.</p>
        )}
      </header>

      {!user ? (
        <section className="auth-card">
          <h2>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-lead">
            {authMode === 'login'
              ? 'Enter your email and password to continue.'
              : 'All fields are required. Use at least 8 characters for your password.'}
          </p>
          <form onSubmit={onAuthSubmit}>
            {authMode === 'register' && (
              <div className="field">
                <label htmlFor="auth-name">Full name</label>
                <input
                  id="auth-name"
                  type="text"
                  value={authFields.name}
                  onChange={(ev) =>
                    setAuthFields((f) => ({ ...f, name: ev.target.value }))
                  }
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                value={authFields.email}
                onChange={(ev) =>
                  setAuthFields((f) => ({ ...f, email: ev.target.value }))
                }
                autoComplete="email"
                required
              />
            </div>
            {authMode === 'login' ? (
              <PasswordInput
                id="auth-password-login"
                label="Password"
                value={authFields.password}
                onChange={(ev) =>
                  setAuthFields((f) => ({ ...f, password: ev.target.value }))
                }
                visible={showLoginPassword}
                onToggleVisible={() => setShowLoginPassword((v) => !v)}
                autoComplete="current-password"
                minLength={8}
                required
              />
            ) : (
              <>
                <PasswordInput
                  id="auth-password-reg"
                  label="Password"
                  value={authFields.password}
                  onChange={(ev) =>
                    setAuthFields((f) => ({ ...f, password: ev.target.value }))
                  }
                  visible={showRegPassword}
                  onToggleVisible={() => setShowRegPassword((v) => !v)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <PasswordInput
                  id="auth-password-confirm"
                  label="Confirm password"
                  value={authFields.password_confirmation}
                  onChange={(ev) =>
                    setAuthFields((f) => ({
                      ...f,
                      password_confirmation: ev.target.value,
                    }))
                  }
                  visible={showRegPasswordConfirm}
                  onToggleVisible={() => setShowRegPasswordConfirm((v) => !v)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </>
            )}
            {formError && <p className="error">{formError}</p>}
            <div className="auth-actions">
              <button type="submit" className="primary">
                {authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
              <p className="auth-switch">
                {authMode === 'login'
                  ? 'New here?'
                  : 'Already have an account?'}{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'register' : 'login')
                    setFormError('')
                  }}
                >
                  {authMode === 'login' ? 'Register' : 'Log in'}
                </button>
              </p>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel">
          <h2>Share a YouTube link</h2>
          <form onSubmit={onShare}>
            <div className="row">
              <label style={{ flex: 1 }}>
                URL
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={shareUrl}
                  onChange={(ev) => setShareUrl(ev.target.value)}
                  required
                />
              </label>
              <button type="submit" className="primary">
                Share
              </button>
            </div>
            {formError && <p className="error">{formError}</p>}
          </form>
        </section>
      )}

      {user && (
        <section className="panel">
          <h2>Shared videos</h2>
          {listError && <p className="error">{listError}</p>}
          {videos.length === 0 ? (
            <p>No videos yet.</p>
          ) : (
            <ul className="videos">
              {videos.map((v) => {
                const thumb = v.youtube_video_id
                  ? youtubeThumbnailUrl(v.youtube_video_id)
                  : null
                return (
                  <li key={v.id} className="video-card">
                    {thumb && (
                      <a
                        className="video-thumb"
                        href={v.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={thumb} alt="" loading="lazy" />
                      </a>
                    )}
                    <div className="video-body">
                      <a href={v.youtube_url} target="_blank" rel="noreferrer">
                        {v.title}
                      </a>
                      <div className="video-meta-row">
                        <div className="meta">
                          Shared by {v.sharer_name} ·{' '}
                          {new Date(v.created_at).toLocaleString()}
                        </div>
                        {v.removable && (
                          <button
                            type="button"
                            className="video-remove"
                            onClick={() => onRemoveShared(v.id)}
                            disabled={removingId === v.id}
                          >
                            {removingId === v.id ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
