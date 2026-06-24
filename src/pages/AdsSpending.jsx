import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format, eachDayOfInterval, parseISO } from 'date-fns'

const C = {
  bg: '#13151f', surface: '#1c1f2e', card: '#222538', border: '#2e3350',
  accent: '#e8394a', accentSoft: '#e8394a18',
  green: '#22c55e', greenSoft: '#22c55e18',
  orange: '#f97316', blue: '#3b82f6',
  purple: '#a855f7', text: '#e2e5f0', muted: '#6b7490', faint: '#343855',
}

const fmt = n => Number(n || 0).toLocaleString()
const fmtSAR = n => `${fmt(Math.round(n || 0))} SAR`

// Historical exchange rates to SAR (approximate, we'll fetch real ones)
const RATES_TO_SAR = { SAR: 1, EGP: 0.073, USD: 3.75 }

async function fetchExchangeRate(currency, date) {
  if (currency === 'SAR') return 1
  try {
    const r = await fetch(`https://api.frankfurter.app/${date}?from=${currency}&to=SAR`)
    const data = await r.json()
    return data?.rates?.SAR || RATES_TO_SAR[currency] || 1
  } catch {
    return RATES_TO_SAR[currency] || 1
  }
}

function Input({ label, type = 'text', value, onChange, placeholder, required, min, max }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {label} {required && <span style={{ color: C.accent }}>*</span>}
      </label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required} min={min} max={max}
        style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '9px 12px', color: C.text, fontSize: 13, outline: 'none',
          width: '100%', boxSizing: 'border-box'
        }}
      />
    </div>
  )
}

function Select({ label, value, onChange, options, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {label} {required && <span style={{ color: C.accent }}>*</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)} required={required}
        style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '9px 12px', color: value ? C.text : C.muted, fontSize: 13,
          outline: 'none', width: '100%', cursor: 'pointer'
        }}>
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: C.surface }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: C.muted,
            fontSize: 20, cursor: 'pointer', lineHeight: 1
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AdsSpending({ user }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [merchantOptions, setMerchantOptions] = useState([])
  const [productOptions, setProductOptions] = useState([])

  // Form state
  const [form, setForm] = useState({
    merchant_id: '', sku: '', product_name: '',
    date_from: '', date_to: '',
    total_amount: '', currency: 'SAR', notes: ''
  })
  const [ratePreview, setRatePreview] = useState(null)

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ads_spending')
      .select('*')
      .order('date_from', { ascending: false })
    setEntries(data || [])
    setLoading(false)
  }, [])

  const loadOptions = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('merchant_id, sku, product_name')
      .limit(5000)
    if (data) {
      const merchants = [...new Set(data.map(o => String(o.merchant_id)).filter(Boolean))].sort()
      setMerchantOptions(merchants)
      const products = {}
      data.forEach(o => {
        if (o.sku) products[o.sku] = o.product_name || o.sku
      })
      setProductOptions(Object.entries(products).sort((a, b) => a[1].localeCompare(b[1])))
    }
  }, [])

  useEffect(() => { loadEntries(); loadOptions() }, [loadEntries, loadOptions])

  // Preview exchange rate when currency/date changes
  useEffect(() => {
    if (form.currency !== 'SAR' && form.date_from) {
      fetchExchangeRate(form.currency, form.date_from).then(rate => {
        setRatePreview(rate)
      })
    } else {
      setRatePreview(null)
    }
  }, [form.currency, form.date_from])

  // Auto-fill product name when SKU selected
  const handleSkuChange = val => {
    const found = productOptions.find(([sku]) => sku === val)
    setField('sku', val)
    if (found) setField('product_name', found[1])
  }

  const openAdd = () => {
    setForm({ merchant_id: '', sku: '', product_name: '', date_from: '', date_to: '', total_amount: '', currency: 'SAR', notes: '' })
    setEditEntry(null)
    setError('')
    setShowForm(true)
  }

  const openEdit = entry => {
    setForm({
      merchant_id: entry.merchant_id,
      sku: entry.sku,
      product_name: entry.product_name || '',
      date_from: entry.date_from,
      date_to: entry.date_to,
      total_amount: String(entry.total_amount),
      currency: entry.currency,
      notes: entry.notes || ''
    })
    setEditEntry(entry)
    setError('')
    setShowForm(true)
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this entry?')) return
    await supabase.from('ads_spending').delete().eq('id', id)
    loadEntries()
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const dateFrom = parseISO(form.date_from)
      const dateTo = parseISO(form.date_to)
      const days = eachDayOfInterval({ start: dateFrom, end: dateTo }).length
      const rate = await fetchExchangeRate(form.currency, form.date_from)
      const totalSar = parseFloat(form.total_amount) * rate

      const payload = {
        merchant_id: form.merchant_id,
        sku: form.sku,
        product_name: form.product_name,
        date_from: form.date_from,
        date_to: form.date_to,
        total_amount: parseFloat(form.total_amount),
        currency: form.currency,
        amount_sar: Math.round(totalSar * 100) / 100,
        exchange_rate: rate,
        notes: form.notes,
        submitted_by: user?.id,
        submitted_by_email: user?.email,
      }

      if (editEntry) {
        await supabase.from('ads_spending').update(payload).eq('id', editEntry.id)
      } else {
        await supabase.from('ads_spending').insert(payload)
      }

      setShowForm(false)
      loadEntries()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    }
    setSubmitting(false)
  }

  // Summary stats
  const totalSar = entries.reduce((s, e) => s + (e.amount_sar || 0), 0)
  const totalEntries = entries.length

  // Daily breakdown for a given entry
  const getDailyAmount = entry => {
    const days = eachDayOfInterval({ start: parseISO(entry.date_from), end: parseISO(entry.date_to) }).length
    return Math.round((entry.amount_sar / days) * 100) / 100
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>Ads Spending Log</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>
            Log ad spend by merchant & product — auto-converts to SAR
          </div>
        </div>
        <button onClick={openAdd} style={{
          background: C.accent, color: '#fff', border: 'none',
          borderRadius: 9, padding: '10px 20px', fontSize: 14,
          cursor: 'pointer', fontWeight: 700
        }}>+ Log Spend</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Logged Entries', value: fmt(totalEntries), accent: C.blue },
          { label: 'Total Ads Spent (SAR)', value: fmtSAR(totalSar), accent: C.accent },
        ].map(card => (
          <div key={card.label} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '16px 20px', flex: 1, position: 'relative', overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.accent }} />
            <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{card.label}</div>
            <div style={{ color: C.text, fontSize: 24, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Spending Entries</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Daily average = Total ÷ Days in range</div>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
            No entries yet — click "Log Spend" to add the first one!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Merchant', 'SKU', 'Product', 'Date From', 'Date To', 'Days', 'Amount', 'Currency', 'Rate', 'Total SAR', 'Daily SAR', 'Submitted By', 'Notes', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', color: C.muted,
                      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: `1px solid ${C.border}`, background: C.surface,
                      whiteSpace: 'nowrap', fontWeight: 600
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => {
                  const days = eachDayOfInterval({ start: parseISO(entry.date_from), end: parseISO(entry.date_to) }).length
                  const dailySar = Math.round((entry.amount_sar / days) * 10) / 10
                  return (
                    <tr key={entry.id} style={{ borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surface}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 14px', color: C.text, whiteSpace: 'nowrap' }}>{entry.merchant_id}</td>
                      <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{entry.sku}</td>
                      <td style={{ padding: '10px 14px', color: C.text, maxWidth: 200 }}>
                        <span title={entry.product_name}>{entry.product_name?.slice(0, 30)}{entry.product_name?.length > 30 ? '…' : ''}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{entry.date_from}</td>
                      <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{entry.date_to}</td>
                      <td style={{ padding: '10px 14px', color: C.text, textAlign: 'center' }}>{days}</td>
                      <td style={{ padding: '10px 14px', color: C.text, whiteSpace: 'nowrap' }}>{fmt(entry.total_amount)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: entry.currency === 'SAR' ? C.greenSoft : entry.currency === 'USD' ? C.blueSoft : C.accentSoft,
                          color: entry.currency === 'SAR' ? C.green : entry.currency === 'USD' ? C.blue : C.accent,
                          padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700
                        }}>{entry.currency}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{entry.exchange_rate?.toFixed(4)}</td>
                      <td style={{ padding: '10px 14px', color: C.green, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtSAR(entry.amount_sar)}</td>
                      <td style={{ padding: '10px 14px', color: C.orange, whiteSpace: 'nowrap' }}>{fmt(dailySar)} SAR/day</td>
                      <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap', fontSize: 12 }}>{entry.submitted_by_email?.split('@')[0]}</td>
                      <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12, maxWidth: 150 }}>
                        <span title={entry.notes}>{entry.notes?.slice(0, 20)}{entry.notes?.length > 20 ? '…' : ''}</span>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEdit(entry)} style={{
                          background: 'transparent', color: C.blue, border: `1px solid ${C.border}`,
                          borderRadius: 5, padding: '3px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6
                        }}>Edit</button>
                        <button onClick={() => handleDelete(entry.id)} style={{
                          background: 'transparent', color: C.accent, border: `1px solid ${C.border}`,
                          borderRadius: 5, padding: '3px 10px', fontSize: 12, cursor: 'pointer'
                        }}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal title={editEntry ? 'Edit Spend Entry' : 'Log Ad Spend'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <Select
                label="Merchant"
                value={form.merchant_id}
                onChange={v => setField('merchant_id', v)}
                required
                options={[{ value: '', label: '— Select Merchant —' }, ...merchantOptions.map(m => ({ value: m, label: m }))]}
              />
              <Select
                label="Product SKU"
                value={form.sku}
                onChange={handleSkuChange}
                required
                options={[{ value: '', label: '— Select SKU —' }, ...productOptions.map(([sku, name]) => ({ value: sku, label: `${sku} · ${name?.slice(0, 30)}` }))]}
              />
            </div>

            {form.product_name && (
              <div style={{ background: C.surface, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: C.muted, fontSize: 13 }}>
                📦 {form.product_name}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <Input label="Date From" type="date" value={form.date_from} onChange={v => setField('date_from', v)} required />
              <Input label="Date To" type="date" value={form.date_to} onChange={v => setField('date_to', v)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
              <Input label="Total Amount Spent" type="number" value={form.total_amount} onChange={v => setField('total_amount', v)} placeholder="e.g. 5000" required min="0" />
              <Select
                label="Currency"
                value={form.currency}
                onChange={v => setField('currency', v)}
                options={[
                  { value: 'SAR', label: '🇸🇦 SAR' },
                  { value: 'EGP', label: '🇪🇬 EGP' },
                  { value: 'USD', label: '🇺🇸 USD' },
                ]}
              />
            </div>

            {/* Rate Preview */}
            {form.currency !== 'SAR' && ratePreview && form.total_amount && (
              <div style={{
                background: C.greenSoft, border: `1px solid ${C.green}40`,
                borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                color: C.green, fontSize: 13
              }}>
                💱 {form.currency} → SAR rate on {form.date_from}: <strong>{ratePreview.toFixed(4)}</strong>
                {form.total_amount && ` · Total: ${fmtSAR(parseFloat(form.total_amount) * ratePreview)}`}
                {form.date_from && form.date_to && (() => {
                  try {
                    const days = eachDayOfInterval({ start: parseISO(form.date_from), end: parseISO(form.date_to) }).length
                    return ` · ${days} days · ${fmt(Math.round(parseFloat(form.total_amount) * ratePreview / days))} SAR/day`
                  } catch { return '' }
                })()}
              </div>
            )}

            {/* Days preview */}
            {form.date_from && form.date_to && form.currency === 'SAR' && form.total_amount && (() => {
              try {
                const days = eachDayOfInterval({ start: parseISO(form.date_from), end: parseISO(form.date_to) }).length
                return (
                  <div style={{
                    background: C.blueSoft, border: `1px solid ${C.blue}40`,
                    borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                    color: C.blue, fontSize: 13
                  }}>
                    📅 {days} days · <strong>{fmt(Math.round(parseFloat(form.total_amount) / days))} SAR/day</strong>
                  </div>
                )
              } catch { return null }
            })()}

            <div style={{ marginBottom: 20 }}>
              <Input label="Notes (optional)" value={form.notes} onChange={v => setField('notes', v)} placeholder="Campaign name, product launch, etc." />
            </div>

            {error && (
              <div style={{ background: '#2d1b1b', border: '1px solid #5a2020', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowForm(false)} style={{
                background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer'
              }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{
                background: submitting ? C.faint : C.accent, color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 24px', fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700
              }}>
                {submitting ? 'Saving...' : editEntry ? 'Update Entry' : 'Log Spend'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
