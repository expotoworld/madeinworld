import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import debounce from 'lodash.debounce'
import axios from 'axios'
import Login from './Login'
import Toolbar from './Toolbar'
import { ThemeProvider, useThemeMode } from './theme'

function useSaving() {
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const markSaving = () => setStatus('saving')
  const markSaved = () => { setStatus('saved'); setLastSavedAt(new Date()) }
  const markError = () => setStatus('error')
  return { status, lastSavedAt, markSaving, markSaved, markError }
}

function Shell({ children, status, lastSavedAt }: React.PropsWithChildren<{ status: string; lastSavedAt: Date | null }>) {
  const { mode, setMode } = useThemeMode()
  return (
    <div className="editor-app">
      <div className="editor-header">
        <div className="brand-topbar">
          <h3 className="brand-title">Made in World — Ebook Editor</h3>
          <div className="flex gap-8">
            <span className={`status-badge ${status === 'error' ? 'error' : status === 'saved' ? 'success' : ''}`}>
              {status === 'saving' && 'Saving	'}
              {status === 'saved' && `Saved${lastSavedAt ? ` at ${lastSavedAt.toLocaleTimeString()}` : ''}`}
              {status === 'error' && 'Save failed'}
            </span>
            <button className="theme-toggle" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}>
              {mode === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

export default function App() {
  const { status, lastSavedAt, markSaving, markSaved, markError } = useSaving()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    try { const t = JSON.parse(localStorage.getItem('ebook_token') || 'null')?.token || null; if (t) setToken(t); } catch {}
  }, [])

  const saveDraft = useCallback(async (json: any) => {
    if (!token) return
    markSaving()
    try {
      await axios.put('/api/ebook', json)
      markSaved()
    } catch (e) {
      console.error(e)
      markError()
    }
  }, [token])

  const debouncedSave = useMemo(() => debounce(saveDraft, 2000), [saveDraft])

  const saveRef = useRef(debouncedSave)
  useEffect(() => { saveRef.current = debouncedSave; return () => debouncedSave.cancel?.() }, [debouncedSave])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Getting started\n\nType to begin  use the toolbar for formatting' }),
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
        const res = await axios.get('/api/ebook')
        const content = res.data?.content
        if (!cancelled && content && typeof content === 'object' && Object.keys(content || {}).length > 0) {
          // Do not emit update to avoid triggering autosave immediately
          editor.commands.setContent(content, false)
        }
      } catch (e) {
        console.warn('Failed to load draft on init', e)
      }
    })()
    return () => { cancelled = true }
  }, [token, editor])

  if (!token) return <Login onToken={setToken} />

  return (
    <ThemeProvider>
      <Shell status={status} lastSavedAt={lastSavedAt}>
        <Toolbar editor={editor} />
        <div className="editor-surface">
          <EditorContent editor={editor} />
        </div>
        <div className="mt-16 flex gap-8">
          <button className="primary-btn" onClick={async () => {
            if (!editor) return
            try {
              await axios.post('/api/ebook/versions', null)
              alert('Manual version created')
            } catch (e) { alert('Failed to create version') }
          }}>Save version</button>
          <button className="secondary-btn" onClick={async () => {
            if (!editor) return
            try {
              await axios.post('/api/ebook/publish', null)
              alert('Published!')
            } catch (e) { alert('Failed to publish') }
          }}>Publish</button>
        </div>
      </Shell>
    </ThemeProvider>
  )
}
