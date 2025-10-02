import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import debounce from 'lodash.debounce'
import axios from 'axios'
import Login from './Login'

function useSaving() {
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const markSaving = () => setStatus('saving')
  const markSaved = () => { setStatus('saved'); setLastSavedAt(new Date()) }
  const markError = () => setStatus('error')

  return { status, lastSavedAt, markSaving, markSaved, markError }
}

export default function App() {
  const { status, lastSavedAt, markSaving, markSaved, markError } = useSaving()
  const [token, setToken] = useState<string | null>(null)

  const saveDraft = useCallback(async (json: any) => {
    if (!token) return
    markSaving()
    try {
      await axios.put('/api/ebook', json, { headers: { Authorization: `Bearer ${token}` } })
      markSaved()
    } catch (e) {
      console.error(e)
      markError()
    }
  }, [token])

  const debouncedSave = useMemo(() => debounce(saveDraft, 2000), [saveDraft])

  // 10-minute safeguard autosave
  useEffect(() => {
    const id = setInterval(() => {
      if (editor) {
        saveDraft(editor.getJSON())
      }
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [saveDraft])

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: '<p>Start writing your book...</p>',
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getJSON())
    },
  })

  if (!token) {
    return <Login onToken={setToken} />
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Made in World - Ebook Editor</h3>
        <div>
          {status === 'saving' && <span>Saving…</span>}
          {status === 'saved' && <span>Saved{lastSavedAt ? ` at ${lastSavedAt.toLocaleTimeString()}` : ''}</span>}
          {status === 'error' && <span style={{ color: 'red' }}>Save failed</span>}
        </div>
      </header>
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, minHeight: 400 }}>
        <EditorContent editor={editor} />
      </div>
      <div style={{ marginTop: 16 }}>
        <button onClick={async () => {
          if (!editor) return
          try {
            await axios.post('/api/ebook/versions', null, { headers: { Authorization: `Bearer ${token}` } })
            alert('Manual version created')
          } catch (e) { alert('Failed to create version') }
        }}>Save version</button>
        <button style={{ marginLeft: 8 }} onClick={async () => {
          if (!editor) return
          try {
            await axios.post('/api/ebook/publish', null, { headers: { Authorization: `Bearer ${token}` } })
            alert('Published!')
          } catch (e) { alert('Failed to publish') }
        }}>Publish</button>
      </div>
    </div>
  )
}

