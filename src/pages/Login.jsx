import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{
        background: '#1a1d27',
        border: '1px solid #2a2d3e',
        borderRadius: 16,
        padding: '48px 40px',
        width: 380,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.5px',
            marginBottom: 6
          }}>
            NML & Sllr
          </div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>
            Performance Dashboard
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                background: '#0f1117',
                border: '1px solid #2a2d3e',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="you@company.com"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                background: '#0f1117',
                border: '1px solid #2a2d3e',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: '#2d1b1b',
              border: '1px solid #5a2020',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#f87171',
              fontSize: 13,
              marginBottom: 16
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#374151' : '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '12px',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
