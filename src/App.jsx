import { useCallback, useEffect, useState } from 'react'
import { createConsumer } from '@rails/actioncable'
import {
  cableUrl,
  createSharedVideo,
  deleteSharedVideo,
  fetchCurrentUser,
  fetchSharedVideos,
  login,
  register,
  voteSharedVideo,
} from './api'
import { youtubeEmbedUrl, youtubeThumbnailUrl } from './youtube'
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

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() =>
    localStorage.getItem(TOKEN_KEY) ? readStoredUser() : null,
  )
  const [videos, setVideos] = useState([])
  const [page, setPage] = useState('list') // list | share | login | register
  const [shareUrl, setShareUrl] = useState('')
  const [shareDescription, setShareDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [listError, setListError] = useState('')
  const [loginFields, setLoginFields] = useState({ email: '', password: '' })
  const [registerFields, setRegisterFields] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
  })
  const [toast, setToast] = useState(null)
  const [showLoginPasswordPage, setShowLoginPasswordPage] = useState(false)
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [showRegPasswordConfirm, setShowRegPasswordConfirm] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [votingId, setVotingId] = useState(null)

  const defaultNameFromEmail = useCallback((email) => {
    const clean = (email || '').toString().trim()
    const local = clean.split('@')[0] || clean
    const base = local.replace(/[._-]+/g, ' ').trim()
    if (!base) return 'User'
    return base
      .split(/\s+/)
      .slice(0, 4)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }, [])

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
    try {
      const list = await fetchSharedVideos(token)
      setVideos(Array.isArray(list) ? list : [])
    } catch {
      setVideos([])
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchSharedVideos(token)
        if (!cancelled) setVideos(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setVideos([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

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

  const onLoginSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    try {
      const data = await login({
        email: loginFields.email.trim(),
        password: loginFields.password,
      })
      persistAuth(data.token, data.user)
      setPage('list')
    } catch (err) {
      setFormError(err.message)
    }
  }

  const onRegisterSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    try {
      const payload = {
        ...registerFields,
        email: registerFields.email.trim(),
        name:
          registerFields.name.trim() ||
          defaultNameFromEmail(registerFields.email),
      }
      const data = await register(payload)
      persistAuth(data.token, data.user)
      setPage('list')
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
      if (!token) throw new Error('Please log in to share a movie.')
      await createSharedVideo(token, shareUrl.trim(), shareDescription.trim())
      setShareUrl('')
      setShareDescription('')
      setPage('list')
      await loadVideos()
    } catch (err) {
      setFormError(err.message)
    }
  }

  const onVote = async (id, nextValue) => {
    setListError('')
    try {
      if (!token) throw new Error('Please log in to vote.')
      setVotingId(id)
      const updated = await voteSharedVideo(token, id, nextValue)
      setVideos((list) => list.map((v) => (v.id === id ? updated : v)))
    } catch (err) {
      setListError(err.message)
    } finally {
      setVotingId(null)
    }
  }

  const logout = () => {
    persistAuth(null, null)
    setToast(null)
    setFormError('')
    setListError('')
    setPage('list')
    loadVideos()
  }

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

      <header className="nav">
        <div className="nav-left">
          <div className="brand" role="banner">
            <span className="brand-mark" aria-hidden="true">
              ⌂
            </span>
            <span className="brand-name">Funny Movies</span>
          </div>
        </div>
        <div className="nav-right">
          {user ? (
            <>
              <span className="welcome">Welcome {user.email}</span>
              <button
                type="button"
                className="nav-btn"
                onClick={() => setPage('share')}
              >
                Share a movie
              </button>
              <button type="button" className="nav-btn" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="nav-btn primary"
                onClick={() => {
                  setFormError('')
                  setPage('login')
                }}
              >
                Login
              </button>
              <button
                type="button"
                className="nav-btn"
                onClick={() => {
                  setFormError('')
                  setPage('register')
                }}
              >
                Register
              </button>
            </>
          )}
        </div>
      </header>

      {formError && <p className="error">{formError}</p>}
      {listError && <p className="error">{listError}</p>}

      {page === 'login' ? (
        <section className="auth-page">
          <div className="auth-card-prod">
            <h2>Login</h2>
            <p className="auth-lead-prod">
              Enter your email and password to continue.
            </p>
            <form onSubmit={onLoginSubmit} className="auth-form-prod">
              <label className="auth-field">
                Email
                <input
                  type="email"
                  value={loginFields.email}
                  onChange={(e) =>
                    setLoginFields((s) => ({ ...s, email: e.target.value }))
                  }
                  autoComplete="email"
                  required
                />
              </label>
              <label className="auth-field">
                Password
                <div className="auth-password-row">
                  <input
                    type={showLoginPasswordPage ? 'text' : 'password'}
                    value={loginFields.password}
                    onChange={(e) =>
                      setLoginFields((s) => ({ ...s, password: e.target.value }))
                    }
                    autoComplete="current-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="auth-toggle"
                    onClick={() => setShowLoginPasswordPage((v) => !v)}
                    aria-pressed={showLoginPasswordPage}
                  >
                    {showLoginPasswordPage ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <div className="auth-actions-prod">
                <button type="submit" className="auth-primary">
                  Login
                </button>
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={() => setPage('register')}
                >
                  Go to Register
                </button>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => setPage('list')}
                >
                  Back to list
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : page === 'register' ? (
        <section className="auth-page">
          <div className="auth-card-prod">
            <h2>Register</h2>
            <p className="auth-lead-prod">
              Create an account to share movies and vote. Password must be at
              least 8 characters.
            </p>
            <form onSubmit={onRegisterSubmit} className="auth-form-prod">
              <label className="auth-field">
                Full name
                <input
                  type="text"
                  value={registerFields.name}
                  onChange={(e) =>
                    setRegisterFields((s) => ({ ...s, name: e.target.value }))
                  }
                  autoComplete="name"
                  placeholder={defaultNameFromEmail(registerFields.email)}
                />
              </label>
              <label className="auth-field">
                Email
                <input
                  type="email"
                  value={registerFields.email}
                  onChange={(e) =>
                    setRegisterFields((s) => ({ ...s, email: e.target.value }))
                  }
                  autoComplete="email"
                  required
                />
              </label>
              <label className="auth-field">
                Password
                <div className="auth-password-row">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={registerFields.password}
                    onChange={(e) =>
                      setRegisterFields((s) => ({
                        ...s,
                        password: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="auth-toggle"
                    onClick={() => setShowRegPassword((v) => !v)}
                    aria-pressed={showRegPassword}
                  >
                    {showRegPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <label className="auth-field">
                Confirm password
                <div className="auth-password-row">
                  <input
                    type={showRegPasswordConfirm ? 'text' : 'password'}
                    value={registerFields.password_confirmation}
                    onChange={(e) =>
                      setRegisterFields((s) => ({
                        ...s,
                        password_confirmation: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="auth-toggle"
                    onClick={() => setShowRegPasswordConfirm((v) => !v)}
                    aria-pressed={showRegPasswordConfirm}
                  >
                    {showRegPasswordConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <div className="auth-actions-prod">
                <button type="submit" className="auth-primary">
                  Create account
                </button>
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={() => setPage('login')}
                >
                  Go to Login
                </button>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => setPage('list')}
                >
                  Back to list
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : page === 'share' ? (
        <section className="share-page">
          <div className="share-card">
            <h2>Share a Youtube movie</h2>
            <form onSubmit={onShare}>
              <div className="share-row">
                <label className="share-label">
                  Youtube URL:
                  <input
                    type="url"
                    value={shareUrl}
                    onChange={(ev) => setShareUrl(ev.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="share-row">
                <label className="share-label">
                  Description:
                  <textarea
                    value={shareDescription}
                    onChange={(e) => setShareDescription(e.target.value)}
                    rows={3}
                    placeholder="Why is this movie funny?"
                  />
                </label>
              </div>
              <div className="share-actions">
                <button type="submit" className="share-btn">
                  Share
                </button>
                <button
                  type="button"
                  className="share-btn ghost"
                  onClick={() => setPage('list')}
                >
                  Back
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <main className="list-page">
          {videos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No shared movies yet</div>
              <div className="empty-sub">
                {user
                  ? 'Click “Share a movie” to post the first one.'
                  : 'Log in to share a movie and vote.'}
              </div>
            </div>
          ) : (
            <ul className="movie-list">
              {videos.map((v) => {
                const embed = youtubeEmbedUrl(v.youtube_video_id)
                const isUp = v.my_vote === 1
                const isDown = v.my_vote === -1
                return (
                  <li key={v.id} className="movie-item">
                  <div className="movie-player">
                    {embed ? (
                      <iframe
                        src={embed}
                        title={v.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <div className="movie-player-fallback" />
                    )}
                  </div>
                  <div className="movie-info">
                    <div className="movie-top">
                      <div>
                        <div className="movie-title">{v.title}</div>
                        <div className="movie-shared">
                          Shared by: {v.sharer_email || v.sharer_name}
                        </div>
                      </div>
                      <div className="movie-votes">
                        <button
                          type="button"
                          className={`vote-btn ${isUp ? 'active' : ''}`}
                          onClick={() => onVote(v.id, isUp ? 0 : 1)}
                          disabled={votingId === v.id}
                          title="Up-vote"
                        >
                          👍
                        </button>
                        <span className="vote-count">{v.upvotes_count}</span>
                        <button
                          type="button"
                          className={`vote-btn ${isDown ? 'active' : ''}`}
                          onClick={() => onVote(v.id, isDown ? 0 : -1)}
                          disabled={votingId === v.id}
                          title="Down-vote"
                        >
                          👎
                        </button>
                        <span className="vote-count">{v.downvotes_count}</span>
                      </div>
                    </div>

                    <div className="movie-desc">
                      <div className="movie-desc-label">Description:</div>
                      <div className="movie-desc-text">
                        {v.description?.trim() ? v.description : '—'}
                      </div>
                    </div>

                    <div className="movie-actions">
                      <a
                        className="movie-link"
                        href={v.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open on YouTube
                      </a>
                      {v.removable && (
                        <button
                          type="button"
                          className="movie-remove"
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
        </main>
      )}
    </div>
  )
}
