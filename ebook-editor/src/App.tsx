import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import debounce from 'lodash.debounce'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

import axios from 'axios'
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'https://device-api.expomadeinworld.com'
import Login from './Login'
import Toolbar from './Toolbar'
import WordCount from './WordCount'
import { ThemeProvider, useThemeMode } from './theme'
import './i18n'
import { useTranslation } from 'react-i18next'
import { AUTH_BASE, getRefreshToken, setAccessToken, setRefreshToken } from './auth'


function useSaving() {
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const markSaving = () => setStatus('saving')
  const markSaved = () => { setStatus('saved'); setLastSavedAt(new Date()) }
  const markError = () => setStatus('error')
  return { status, lastSavedAt, markSaving, markSaved, markError }
}

function Shell({ children, status, lastSavedAt, toolbar, actionsRight }: React.PropsWithChildren<{ status: string; lastSavedAt: Date | null; toolbar: React.ReactNode; actionsRight?: React.ReactNode }>) {
  const { mode, setMode } = useThemeMode()
  const { t, i18n } = useTranslation()
  return (
    <div className="editor-app">
      <div className="editor-header">
        <div className="editor-topbar">
          <div className="topbar-left">
            {toolbar}
          </div>
          <div className="topbar-right">
            <span className={`status-badge ${status === 'error' ? 'error' : status === 'saved' ? 'success' : ''}`}>
              {status === 'saving' && t('status.saving')}
              {status === 'saved' && t('status.saved_at', { time: lastSavedAt ? lastSavedAt.toLocaleTimeString() : '' })}
              {status === 'error' && t('status.save_failed')}
            </span>
            {actionsRight}
            <button
              className="theme-toggle lang-toggle"
              onClick={() => { const next = i18n.language === 'zh' ? 'en' : 'zh'; i18n.changeLanguage(next); try { localStorage.setItem('lang', next) } catch {} }}
              aria-label="Toggle language"
            >
              {i18n.language === 'zh' ? 'EN' : '中文'}
            </button>
            <button className="theme-toggle" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} aria-label="Toggle theme">
              {mode === 'light' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M10 6C10 10.4183 13.5817 14 18 14C19.4386 14 20.7885 13.6203 21.9549 12.9556C21.4738 18.0302 17.2005 22 12 22C6.47715 22 2 17.5228 2 12C2 6.79948 5.9698 2.52616 11.0444 2.04507C10.3797 3.21152 10 4.56142 10 6ZM4 12C4 16.4183 7.58172 20 12 20C14.9654 20 17.5757 18.3788 18.9571 15.9546C18.6407 15.9848 18.3214 16 18 16C12.4772 16 8 11.5228 8 6C8 5.67863 8.01524 5.35933 8.04536 5.04293C5.62119 6.42426 4 9.03458 4 12ZM18.1642 2.29104L19 2.5V3.5L18.1642 3.70896C17.4476 3.8881 16.8881 4.4476 16.709 5.16417L16.5 6H15.5L15.291 5.16417C15.1119 4.4476 14.5524 3.8881 13.8358 3.70896L13 3.5V2.5L13.8358 2.29104C14.5524 2.1119 15.1119 1.5524 15.291 0.835829L15.5 0H16.5L16.709 0.835829C16.8881 1.5524 17.4476 2.1119 18.1642 2.29104ZM23.1642 7.29104L24 7.5V8.5L23.1642 8.70896C22.4476 8.8881 21.8881 9.4476 21.709 10.1642L21.5 11H20.5L20.291 10.1642C20.1119 9.4476 19.5524 8.8881 18.8358 8.70896L18 8.5V7.5L18.8358 7.29104C19.5524 7.1119 20.1119 6.5524 20.291 5.83583L20.5 5H21.5L21.709 5.83583C21.8881 6.5524 22.4476 7.1119 23.1642 7.29104Z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16ZM11 1H13V4H11V1ZM11 20H13V23H11V20ZM3.51472 4.92893L4.92893 3.51472L7.05025 5.63604L5.63604 7.05025L3.51472 4.92893ZM16.9497 18.364L18.364 16.9497L20.4853 19.0711L19.0711 20.4853L16.9497 18.364ZM19.0711 3.51472L20.4853 4.92893L18.364 7.05025L16.9497 5.63604L19.0711 3.51472ZM5.63604 16.9497L7.05025 18.364L4.92893 20.4853L3.51472 19.0711L5.63604 16.9497ZM23 11V13H20V11H23ZM4 11V13H1V11H4Z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="editor-container">
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const { status, lastSavedAt, markSaving, markSaved, markError } = useSaving()
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [token, setToken] = useState<string | null>(null)
  const [authBoot, setAuthBoot] = useState<boolean>(true)

  useEffect(() => {
    (async () => {
      try {
        const stored = (() => { try { return JSON.parse(localStorage.getItem('ebook_token') || 'null') } catch { return null } })()
        const tok = stored?.token as string | undefined
        const exp = stored?.expires_at ? new Date(stored.expires_at as string).getTime() : null
        if (tok && exp && exp - Date.now() > 5000) {
          setToken(tok)
          return
        }
        const rt = getRefreshToken()
        if (rt) {
          try {
            const res = await axios.post(`${AUTH_BASE}/api/auth/token/refresh`, { refresh_token: rt, rotate: false })
            const newTok = res.data?.token as string | undefined
            const tokenExp = res.data?.expires_at as string | undefined
            const newRt = res.data?.refresh_token as string | undefined
            const newRtExp = res.data?.refresh_expires_at as string | undefined
            if (newTok) {
              setAccessToken(newTok, tokenExp)
              if (newRt && newRtExp) setRefreshToken(newRt, newRtExp)
              setToken(newTok)
              return
            }
          } catch {}
        }
      } finally {
        setAuthBoot(false)
      }
    })()
  }, [])

  const saveDraft = useCallback(async (json: any) => {
    if (!token) return
    markSaving()
    try {
      await axios.put(`${API_BASE}/api/ebook`, json, { headers: { Authorization: `Bearer ${token}` } })
      markSaved()
    } catch (e) {
      console.error(e)
      // Do not force logout on first 401; interceptors will attempt silent refresh and retry.
      // If refresh truly fails, subsequent calls will still fail and the user can reauthenticate.
      markError()
    }
  }, [token])

  const debouncedSave = useMemo(() => debounce(saveDraft, 2000), [saveDraft])

  const saveRef = useRef(debouncedSave)
  useEffect(() => { saveRef.current = debouncedSave; return () => debouncedSave.cancel?.() }, [debouncedSave])

  const { t } = useTranslation()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Superscript,
      Subscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem,
      Image,
      Link.configure({ openOnClick: false }),

      // Placeholder.configure({ placeholder: 'Getting started\n\nType to begin  use the toolbar for formatting' }),

      Placeholder.configure({ placeholder: t('placeholder.editor') }),

    ],
    content: '<p>Start writing your book...</p>',
    onUpdate: ({ editor }) => { saveRef.current(editor.getJSON()) },
  })

  useEffect(() => {
    const id = setInterval(() => { if (editor) saveDraft(editor.getJSON()) }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [saveDraft, editor])

  // Fetch latest draft on init (after token + editor are ready) and hydrate editor
  useEffect(() => {
    if (!token || !editor) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/ebook`, { headers: { Authorization: `Bearer ${token}` } })
        const content = res.data?.content
        if (!cancelled && content && typeof content === 'object' && Object.keys(content || {}).length > 0) {
          // Do not emit update to avoid triggering autosave immediately
          editor.commands.setContent(content, false)
        }
      } catch (e) {
        console.warn('Failed to load draft on init', e)
        if ((e as any)?.response?.status === 401) {
          try { localStorage.removeItem('ebook_token') } catch {}
          setToken(null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [token, editor])

  if (authBoot) return <div />
  if (!token) return <Login onToken={setToken} />

  return (
    <ThemeProvider>
      <Shell
        status={status}
        lastSavedAt={lastSavedAt}
        toolbar={<Toolbar editor={editor} zoomLevel={zoomLevel} onZoomChange={setZoomLevel} />}
        actionsRight={(
          <>
            <button className="secondary-btn" onClick={async () => {
              if (!editor) return
              try {
                await axios.post(`${API_BASE}/api/ebook/versions`, null)
                alert(t('actions.version_success'))
              } catch (e) { alert(t('actions.version_fail')) }
            }}>{t('actions.save_version')}</button>
            <button className="primary-btn" onClick={async () => {
              if (!editor) return
              try {
                await axios.post(`${API_BASE}/api/ebook/publish`, null)
                alert(t('actions.publish_success'))
              } catch (e) { alert(t('actions.publish_fail')) }
            }}>{t('actions.publish')}</button>
          </>
        )}
      >
        <div className="editor-surface">
          <div className="editor-viewport" style={{ ['--zoom' as any]: 1 + (zoomLevel - 1) * 0.4 }}>
            <EditorContent editor={editor} />
          </div>
        </div>
        {editor && <WordCount editor={editor} />}
      </Shell>
    </ThemeProvider>
  )
}
