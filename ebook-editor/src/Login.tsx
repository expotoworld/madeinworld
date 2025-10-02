import React, { useState } from 'react'
import axios from 'axios'

export default function Login({ onToken }: { onToken: (t: string) => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<0|1>(0)
  const [error, setError] = useState('')
  const AUTH_BASE = import.meta.env.VITE_AUTH_BASE || 'https://device-api.expomadeinworld.com'

  const sendCode = async () => {
    setError('')
    try {
      await axios.post(`${AUTH_BASE}/api/auth/send-verification`, { email })
      setStep(1)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to send code')
    }
  }

  const verify = async () => {
    setError('')
    try {
      const res = await axios.post(`${AUTH_BASE}/api/auth/verify-code`, { email, code })
      const token: string = res.data?.token
      const role: string = res.data?.user?.role
      if (role !== 'Author') {
        setError('This interface is restricted to Author users')
        return
      }
      onToken(token)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Verification failed')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '72px auto' }}>
      <h3>Ebook Editor Login</h3>
      <p>Author-only access</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {step === 0 && (
        <div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ width: '100%', padding: 8 }} />
          <button style={{ marginTop: 12 }} onClick={sendCode}>Send code</button>
        </div>
      )}
      {step === 1 && (
        <div>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" style={{ width: '100%', padding: 8 }} />
          <button style={{ marginTop: 12 }} onClick={verify}>Verify</button>
        </div>
      )}
    </div>
  )
}

