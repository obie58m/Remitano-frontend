import { useCallback, useEffect, useMemo, useState } from 'react'
import { createConsumer } from '@rails/actioncable'
import {
  cableUrl,
  createSharedVideo,
  fetchSharedVideos,
  login,
  register,
} from './api'
import { youtubeThumbnailUrl } from './youtube'
import './App.css'

const TOKEN_KEY = 'yt_share_token'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [videos, setVideos] = useState([])
  const [shareUrl, setShareUrl] = useState('')
  const [formError, setFormError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authFields, setAuthFields] = useState({
    email: '',
    password: '',
    password_confirmation: '',
    name: '',
  })
  const [toast, setToast] = useState(null)

  const persistAuth = useCallback((nextToken, nextUser) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    else localStorage.removeItem(TOKEN_KEY)
    setToken(nextToken)
    setUser(nextUser)
  }, [])

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

  const onShare = async (e) => {
    e.preventDefault()
    setFormError('')
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
  }

  const heading = useMemo(
    () => (user ? `Hi, ${user.name}` : 'YouTube video sharing'),
    [user],
  )

  return (
    <div className="app" style={{ paddingTop: toast ? '3.75rem' : undefined }}>
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
          <button type="button" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      )}

      <header>
        <h1>{heading}</h1>
        {user && (
          <p>
            Signed in as {user.email}{' '}
            <button type="button" className="link" onClick={logout}>
              Log out
            </button>
          </p>
        )}
      </header>

      {!user ? (
        <section className="panel">
          <h2>{authMode === 'login' ? 'Log in' : 'Create account'}</h2>
          <form onSubmit={onAuthSubmit}>
            {authMode === 'register' && (
              <div className="row">
                <label>
                  Name
                  <input
                    value={authFields.name}
                    onChange={(ev) =>
                      setAuthFields((f) => ({ ...f, name: ev.target.value }))
                    }
                    required={authMode === 'register'}
                  />
                </label>
              </div>
            )}
            <div className="row">
              <label>
                Email
                <input
                  type="email"
                  value={authFields.email}
                  onChange={(ev) =>
                    setAuthFields((f) => ({ ...f, email: ev.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authFields.password}
                  onChange={(ev) =>
                    setAuthFields((f) => ({ ...f, password: ev.target.value }))
                  }
                  required
                  minLength={8}
                />
              </label>
            </div>
            {authMode === 'register' && (
              <div className="row">
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={authFields.password_confirmation}
                    onChange={(ev) =>
                      setAuthFields((f) => ({
                        ...f,
                        password_confirmation: ev.target.value,
                      }))
                    }
                    required
                    minLength={8}
                  />
                </label>
              </div>
            )}
            {formError && <p className="error">{formError}</p>}
            <div className="row">
              <button type="submit" className="primary">
                {authMode === 'login' ? 'Log in' : 'Register'}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login')
                  setFormError('')
                }}
              >
                {authMode === 'login'
                  ? 'Need an account? Register'
                  : 'Have an account? Log in'}
              </button>
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
                      <div className="meta">
                        Shared by {v.sharer_name} ·{' '}
                        {new Date(v.created_at).toLocaleString()}
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
