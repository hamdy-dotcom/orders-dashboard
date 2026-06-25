import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AdsSpending from './pages/AdsSpending'

const C = {
  bg: '#13151f', surface: '#1c1f2e', card: '#222538', border: '#2e3350',
  accent: '#e8394a', text: '#e2e5f0', muted: '#6b7490', faint: '#343855',
  blue: '#3b82f6', blueSoft: '#3b82f618', green: '#22c55e',
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activePage, setActivePage] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data || { role: 'admin', merchant_id: null }) // fallback to admin if no profile
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: 'Inter, sans-serif' }}>
      Loading...
    </div>
  )

  if (!session) return <Login />

  // Wait for profile to load before rendering
  if (!profile) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: 'Inter, sans-serif' }}>
      Loading profile...
    </div>
  )

  const isAdmin = profile?.role === 'admin'
  const merchantId = profile?.merchant_id || null

  const navItems = [
    { id: 'dashboard', label: '📊 Performance' },
    { id: 'ads', label: '📣 Ads Spending' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Top Nav */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 54,
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: C.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>N</div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px', color: C.text }}>NML & Sllr</span>
            {!isAdmin && merchantId && (
              <span style={{ background: C.accent + '22', color: C.accent, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>
                Merchant {merchantId}
              </span>
            )}
            {isAdmin && (
              <span style={{ background: C.blueSoft, color: C.blue, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>
                Admin
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setActivePage(item.id)} style={{
                background: activePage === item.id ? C.accent + '22' : 'transparent',
                color: activePage === item.id ? C.accent : C.muted,
                border: 'none', borderRadius: 7, padding: '6px 14px',
                fontSize: 13, cursor: 'pointer', fontWeight: activePage === item.id ? 700 : 400
              }}>{item.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>{session.user?.email}</span>
          <button onClick={() => supabase.auth.signOut()} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '6px 12px', fontSize: 13, cursor: 'pointer'
          }}>Sign out</button>
        </div>
      </div>

      {activePage === 'dashboard' && <Dashboard user={session.user} isAdmin={isAdmin} merchantId={merchantId} />}
      {activePage === 'ads' && <AdsSpending user={session.user} isAdmin={isAdmin} merchantId={merchantId} />}
    </div>
  )
}
