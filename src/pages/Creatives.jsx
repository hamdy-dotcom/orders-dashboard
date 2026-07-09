import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const C = {
  bg: '#13151f', surface: '#1c1f2e', card: '#222538', border: '#2e3350',
  accent: '#e8394a', accentSoft: '#e8394a18',
  green: '#22c55e', greenSoft: '#22c55e18',
  orange: '#f97316', orangeSoft: '#f9731618',
  blue: '#3b82f6', blueSoft: '#3b82f618',
  purple: '#a855f7', text: '#e2e5f0', muted: '#6b7490', faint: '#343855',
}

function Panel({ title, sub, children, action }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: { color: C.orange, bg: C.orangeSoft, label: 'Pending' },
    approved: { color: C.green, bg: C.greenSoft, label: 'Approved' },
    rejected: { color: C.accent, bg: C.accentSoft, label: 'Rejected' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>
      {s.label}
    </span>
  )
}

function ProductPicker({ value, onChange, inputStyle, labelStyle }) {
  const [products, setProducts] = useState([])
  const [mode, setMode] = useState('select')
  const [newName, setNewName] = useState('')

  useEffect(() => {
    supabase.from('products').select('id, product_name, sku').order('product_name').then(({ data }) => {
      setProducts(data || [])
    })
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const { data, error } = await supabase.from('products').insert({ product_name: newName.trim() }).select().single()
    if (!error && data) {
      setProducts(p => [...p, data].sort((a, b) => a.product_name.localeCompare(b.product_name)))
      onChange(data.product_name)
      setMode('select')
      setNewName('')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Product Name</label>
        <button onClick={() => setMode(m => m === 'select' ? 'create' : 'select')} style={{
          background: 'none', border: 'none', color: C.blue, fontSize: 11,
          cursor: 'pointer', fontWeight: 600, padding: 0
        }}>{mode === 'select' ? '+ New product' : '← Pick existing'}</button>
      </div>
      {mode === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle }}>
          <option value="">— Select product —</option>
          {products.map(p => (
            <option key={p.id} value={p.product_name}>{p.product_name}</option>
          ))}
        </select>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="New product name"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleCreate} disabled={!newName.trim()} style={{
            background: newName.trim() ? C.green : C.faint,
            color: '#fff', border: 'none', borderRadius: 7,
            padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed'
          }}>Add</button>
        </div>
      )}
    </div>
  )
}

// Modal viewer for images and videos
function MediaModal({ creative, onClose }) {
  if (!creative) return null
  const isImage = creative.file_type?.startsWith('image/')
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, backdropFilter: 'blur(4px)'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, borderRadius: 12, overflow: 'hidden',
        maxWidth: 900, width: '100%', border: `1px solid ${C.border}`
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{creative.title}</div>
            {creative.product_name && <div style={{ fontSize: 12, color: C.muted }}>📦 {creative.product_name}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={creative.file_url} download target="_blank" rel="noreferrer"
              style={{ background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 7, textDecoration: 'none' }}>
              ⬇ Download
            </a>
            <button onClick={onClose} style={{ background: C.faint, border: 'none', color: C.text, borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✕ Close</button>
          </div>
        </div>
        {/* Media */}
        <div style={{ background: C.bg, maxHeight: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isImage ? (
            <img src={creative.file_url} alt={creative.title}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
          ) : (
            <video src={creative.file_url} controls autoPlay
              style={{ maxWidth: '100%', maxHeight: '75vh' }} />
          )}
        </div>
      </div>
    </div>
  )
}

// Table row for a single creative
function CreativeRow({ creative, isAdmin, onApprove, onReject, onDelete, onPreview, teamMembers }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const isImage = creative.file_type?.startsWith('image/')
  const assignedUser = teamMembers?.find(u => u.id === creative.assigned_to)
  const submittedUser = teamMembers?.find(u => u.id === creative.submitted_by)
  const source = creative.direction === 'admin_to_team' ? 'Admin' : 'Team'
  const sourceColor = creative.direction === 'admin_to_team' ? C.blue : C.purple

  return (
    <>
      <tr style={{ borderBottom: `1px solid ${C.border}` }}
        onMouseEnter={e => e.currentTarget.style.background = C.surface}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {/* Thumbnail */}
        <td style={{ padding: '10px 14px', width: 64 }}>
          <div onClick={() => onPreview(creative)} style={{
            width: 52, height: 52, borderRadius: 7, overflow: 'hidden',
            background: C.bg, cursor: 'pointer', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${C.border}`
          }}>
            {isImage ? (
              <img src={creative.file_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ fontSize: 22 }}>🎬</div>
            )}
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.15s'
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <span style={{ fontSize: 18 }}>▶</span>
            </div>
          </div>
        </td>
        {/* Title */}
        <td style={{ padding: '10px 14px' }}>
          <div style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{creative.title}</div>
          <div style={{ fontSize: 11, color: C.faint }}>{new Date(creative.created_at).toLocaleDateString()}</div>
        </td>
        {/* Product */}
        <td style={{ padding: '10px 14px', color: C.muted, fontSize: 13 }}>
          {creative.product_name || <span style={{ color: C.faint }}>—</span>}
        </td>
        {/* Source */}
        <td style={{ padding: '10px 14px' }}>
          <span style={{ background: sourceColor + '22', color: sourceColor, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>
            {source}
          </span>
        </td>
        {/* User */}
        <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12 }}>
          {creative.direction === 'admin_to_team' && assignedUser
            ? <span>→ {assignedUser.email}</span>
            : submittedUser
            ? <span>↑ {submittedUser.email}</span>
            : <span style={{ color: C.faint }}>—</span>}
        </td>
        {/* Type */}
        <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12 }}>
          {isImage ? '🖼 Image' : '🎬 Video'}
        </td>
        {/* Status */}
        <td style={{ padding: '10px 14px' }}>
          <StatusBadge status={creative.status} />
        </td>
        {/* Actions */}
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => onPreview(creative)} style={{
              background: C.faint, color: C.text, border: 'none',
              fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer'
            }}>▶ Play</button>

            {isAdmin && creative.direction === 'team_to_admin' && creative.status === 'pending' && (
              <>
                <button onClick={() => onApprove(creative.id)} style={{
                  background: C.greenSoft, color: C.green, border: 'none',
                  fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer'
                }}>✓</button>
                <button onClick={() => setNotesOpen(o => !o)} style={{
                  background: C.accentSoft, color: C.accent, border: 'none',
                  fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 6, cursor: 'pointer'
                }}>✗</button>
              </>
            )}
            {isAdmin && (
              <button onClick={() => onDelete(creative.id, creative.file_url)} style={{
                background: 'none', color: C.faint, border: 'none',
                fontSize: 14, padding: '4px', borderRadius: 6, cursor: 'pointer'
              }}>🗑</button>
            )}
          </div>
        </td>
      </tr>
      {notesOpen && (
        <tr style={{ background: C.surface }}>
          <td colSpan={8} style={{ padding: '8px 14px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                placeholder="Rejection reason (optional)"
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none' }} />
              <button onClick={() => { onReject(creative.id, rejectNote); setNotesOpen(false) }} style={{
                background: C.accent, color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>Confirm Reject</button>
              <button onClick={() => setNotesOpen(false)} style={{
                background: 'none', color: C.muted, border: 'none', fontSize: 12, cursor: 'pointer'
              }}>Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CreativesTable({ items, isAdmin, onApprove, onReject, onDelete, onPreview, teamMembers, emptyMsg, loading }) {
  if (loading) return <div style={{ color: C.muted, padding: 20 }}>Loading...</div>
  if (!items.length) return <div style={{ color: C.muted, padding: '20px 0', textAlign: 'center' }}>{emptyMsg}</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            {['Preview', 'Title', 'Product', 'Source', 'User', 'Type', 'Status', 'Actions'].map(h => (
              <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(c => (
            <CreativeRow key={c.id} creative={c} isAdmin={isAdmin}
              onApprove={onApprove} onReject={onReject}
              onDelete={onDelete} onPreview={onPreview}
              teamMembers={teamMembers} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Creatives({ user, isAdmin }) {
  const [creatives, setCreatives] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState(isAdmin ? 'pending' : 'mine')
  const [previewCreative, setPreviewCreative] = useState(null)

  const [adminForm, setAdminForm] = useState({ title: '', product_name: '', sku: '', assigned_to: '', files: [], notes: '' })
  const [teamForm, setTeamForm] = useState({ title: '', product_name: '', sku: '', files: [], notes: '' })

  const loadCreatives = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('creatives').select('*').order('created_at', { ascending: false })
    setCreatives(data || [])
    setLoading(false)
  }, [])

  const loadTeamMembers = useCallback(async () => {
    const { data, error } = await supabase.from('user_profiles').select('id, email, role')
    if (error) console.error('user_profiles error:', error)
    setTeamMembers((data || []).filter(m => m.role === 'merchant'))
  }, [])

  useEffect(() => {
    loadCreatives()
    if (isAdmin) loadTeamMembers()
  }, [loadCreatives, loadTeamMembers, isAdmin])

  const uploadFile = async (file) => {
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('creatives').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('creatives').getPublicUrl(path)
    return { url: data.publicUrl, type: file.type, path }
  }

  const handleAdminSubmit = async () => {
    if (!adminForm.files.length || !adminForm.title || !adminForm.assigned_to) return
    setUploading(true)
    try {
      for (const file of adminForm.files) {
        const { url, type } = await uploadFile(file)
        await supabase.from('creatives').insert({
          title: adminForm.files.length > 1 ? `${adminForm.title} (${file.name})` : adminForm.title,
          file_url: url, file_type: type,
          product_name: adminForm.product_name || null,
          sku: adminForm.sku || null,
          assigned_to: adminForm.assigned_to,
          submitted_by: user.id,
          direction: 'admin_to_team', status: 'approved',
          notes: adminForm.notes || null,
        })
      }
      setAdminForm({ title: '', product_name: '', sku: '', assigned_to: '', files: [], notes: '' })
      loadCreatives()
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  const handleTeamSubmit = async () => {
    if (!teamForm.files.length || !teamForm.title) return
    setUploading(true)
    try {
      for (const file of teamForm.files) {
        const { url, type } = await uploadFile(file)
        await supabase.from('creatives').insert({
          title: teamForm.files.length > 1 ? `${teamForm.title} (${file.name})` : teamForm.title,
          file_url: url, file_type: type,
          product_name: teamForm.product_name || null,
          sku: teamForm.sku || null,
          assigned_to: user.id, submitted_by: user.id,
          direction: 'team_to_admin', status: 'pending',
          notes: teamForm.notes || null,
        })
      }
      setTeamForm({ title: '', product_name: '', sku: '', files: [], notes: '' })
      loadCreatives()
    } catch (e) { console.error(e) }
    setUploading(false)
  }

  const handleApprove = async (id) => {
    await supabase.from('creatives').update({ status: 'approved' }).eq('id', id)
    loadCreatives()
  }

  const handleReject = async (id, notes) => {
    await supabase.from('creatives').update({ status: 'rejected', notes }).eq('id', id)
    loadCreatives()
  }

  const handleDelete = async (id, fileUrl) => {
    const path = fileUrl.split('/creatives/')[1]
    if (path) await supabase.storage.from('creatives').remove([path])
    await supabase.from('creatives').delete().eq('id', id)
    loadCreatives()
  }

  const pending = creatives.filter(c => c.direction === 'team_to_admin' && c.status === 'pending')
  const assigned = creatives.filter(c => c.direction === 'admin_to_team')
  const allSubmissions = creatives.filter(c => c.direction === 'team_to_admin')
  const mine = creatives.filter(c => c.direction === 'admin_to_team' && c.assigned_to === user.id)
  const mySubmissions = creatives.filter(c => c.submitted_by === user.id && c.direction === 'team_to_admin')

  const tabs = isAdmin
    ? [
        { id: 'pending', label: '⏳ Pending Approval', count: pending.length },
        { id: 'assigned', label: '📤 Assigned to Team', count: assigned.length },
        { id: 'submissions', label: '📋 All Submissions', count: allSubmissions.length },
        { id: 'upload', label: '➕ Assign Creative' },
      ]
    : [
        { id: 'mine', label: '🎨 My Creatives', count: mine.length },
        { id: 'mysubmissions', label: '📤 My Submissions', count: mySubmissions.length },
        { id: 'submit', label: '➕ Submit for Approval' },
      ]

  const tableProps = { isAdmin, onApprove: handleApprove, onReject: handleReject, onDelete: handleDelete, onPreview: setPreviewCreative, teamMembers, loading }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7,
    padding: '7px 12px', color: C.text, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
  }
  const labelStyle = { color: C.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 5, display: 'block' }

  const FileInput = ({ files, onChange }) => (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={labelStyle}>Upload Files * (image or video)</label>
      <input type="file" accept="image/*,video/*" multiple
        onChange={e => onChange(prev => [...prev, ...Array.from(e.target.files)])}
        style={{ ...inputStyle, padding: '6px 12px' }} />
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
              <span>📎 {f.name} <span style={{ color: C.faint }}>({(f.size / 1024 / 1024).toFixed(1)} MB)</span></span>
              <button onClick={() => onChange(prev => prev.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>{files.length} file{files.length > 1 ? 's' : ''} queued</span>
            <label style={{ fontSize: 12, color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>
              + Add more
              <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }}
                onChange={e => onChange(prev => [...prev, ...Array.from(e.target.files)])} />
            </label>
            <button onClick={() => onChange([])} style={{ fontSize: 12, color: C.faint, background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Media Modal */}
      <MediaModal creative={previewCreative} onClose={() => setPreviewCreative(null)} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? C.accent : C.card,
            color: activeTab === t.id ? '#fff' : C.muted,
            border: `1px solid ${activeTab === t.id ? C.accent : C.border}`,
            borderRadius: 9, padding: '8px 18px', fontSize: 13,
            cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                background: activeTab === t.id ? '#ffffff33' : C.faint,
                color: activeTab === t.id ? '#fff' : C.muted,
                fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ADMIN TABS */}
      {isAdmin && activeTab === 'pending' && (
        <Panel title="Pending Approval" sub="Creatives submitted by team members waiting for your review">
          <CreativesTable items={pending} emptyMsg="No creatives pending approval 🎉" {...tableProps} />
        </Panel>
      )}

      {isAdmin && activeTab === 'assigned' && (
        <Panel title="Assigned to Team" sub="Creatives you assigned to team members">
          <CreativesTable items={assigned} emptyMsg="No creatives assigned yet" {...tableProps} />
        </Panel>
      )}

      {isAdmin && activeTab === 'submissions' && (
        <Panel title="All Submissions" sub="All creatives submitted by team members">
          <CreativesTable items={allSubmissions} emptyMsg="No submissions yet" {...tableProps} />
        </Panel>
      )}

      {isAdmin && activeTab === 'upload' && (
        <Panel title="Assign Creative to Team Member" sub="Upload a creative and assign it exclusively to a team member">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 640 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Creative Title *</label>
              <input value={adminForm.title} onChange={e => setAdminForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Summer Campaign Video 1" style={inputStyle} />
            </div>
            <ProductPicker value={adminForm.product_name} onChange={v => setAdminForm(f => ({ ...f, product_name: v }))} inputStyle={inputStyle} labelStyle={labelStyle} />
            <div>
              <label style={labelStyle}>SKU</label>
              <input value={adminForm.sku} onChange={e => setAdminForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. SKU-001" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Assign To *</label>
              <select value={adminForm.assigned_to} onChange={e => setAdminForm(f => ({ ...f, assigned_to: e.target.value }))} style={inputStyle}>
                <option value="">— Select team member —</option>
                {teamMembers.length === 0 && <option disabled>No team members found</option>}
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <input value={adminForm.notes} onChange={e => setAdminForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes for the team member" style={inputStyle} />
            </div>
            <FileInput files={adminForm.files} onChange={files => setAdminForm(f => ({ ...f, files: typeof files === 'function' ? files(f.files) : files }))} />
            <div style={{ gridColumn: '1 / -1' }}>
              <button disabled={uploading || !adminForm.files.length || !adminForm.title || !adminForm.assigned_to}
                onClick={handleAdminSubmit} style={{
                  background: (uploading || !adminForm.files.length || !adminForm.title || !adminForm.assigned_to) ? C.faint : C.accent,
                  color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 700,
                  cursor: (uploading || !adminForm.files.length || !adminForm.title || !adminForm.assigned_to) ? 'not-allowed' : 'pointer'
                }}>
                {uploading ? '⏳ Uploading...' : `📤 Assign ${adminForm.files.length > 1 ? adminForm.files.length + ' Creatives' : 'Creative'}`}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* TEAM TABS */}
      {!isAdmin && activeTab === 'mine' && (
        <Panel title="My Creatives" sub="Creatives assigned to you by the admin — approved for campaign use">
          <CreativesTable items={mine} emptyMsg="No creatives assigned to you yet" {...tableProps} />
        </Panel>
      )}

      {!isAdmin && activeTab === 'mysubmissions' && (
        <Panel title="My Submissions" sub="Creatives you submitted for admin approval">
          <CreativesTable items={mySubmissions} emptyMsg="You haven't submitted any creatives yet" {...tableProps} />
        </Panel>
      )}

      {!isAdmin && activeTab === 'submit' && (
        <Panel title="Submit Creative for Approval" sub="Upload a creative to be reviewed and approved by admin before use">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 640 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Creative Title *</label>
              <input value={teamForm.title} onChange={e => setTeamForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Product Demo Video" style={inputStyle} />
            </div>
            <ProductPicker value={teamForm.product_name} onChange={v => setTeamForm(f => ({ ...f, product_name: v }))} inputStyle={inputStyle} labelStyle={labelStyle} />
            <div>
              <label style={labelStyle}>SKU</label>
              <input value={teamForm.sku} onChange={e => setTeamForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. SKU-001" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <input value={teamForm.notes} onChange={e => setTeamForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any context or notes for the admin" style={inputStyle} />
            </div>
            <FileInput files={teamForm.files} onChange={files => setTeamForm(f => ({ ...f, files: typeof files === 'function' ? files(f.files) : files }))} />
            <div style={{ gridColumn: '1 / -1' }}>
              <button disabled={uploading || !teamForm.files.length || !teamForm.title}
                onClick={handleTeamSubmit} style={{
                  background: (uploading || !teamForm.files.length || !teamForm.title) ? C.faint : C.blue,
                  color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 700,
                  cursor: (uploading || !teamForm.files.length || !teamForm.title) ? 'not-allowed' : 'pointer'
                }}>
                {uploading ? '⏳ Uploading...' : `📨 Submit ${teamForm.files.length > 1 ? teamForm.files.length + ' Creatives' : 'for Approval'}`}
              </button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
