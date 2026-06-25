import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format, eachDayOfInterval, parseISO, subDays } from 'date-fns'

const C = {
  bg: '#13151f', surface: '#1c1f2e', card: '#222538', border: '#2e3350',
  accent: '#e8394a', accentSoft: '#e8394a18',
  green: '#22c55e', greenSoft: '#22c55e18',
  orange: '#f97316', orangeSoft: '#f9731618',
  blue: '#3b82f6', blueSoft: '#3b82f618',
  purple: '#a855f7', text: '#e2e5f0', muted: '#6b7490', faint: '#343855',
}

const fmt = n => Number(n || 0).toLocaleString()
const fmtSAR = n => `${fmt(Math.round(n || 0))} SAR`

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

function Label({ children, required }) {
  return (
    <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
      {children} {required && <span style={{ color: C.accent }}>*</span>}
    </div>
  )
}

function inputStyle(highlight) {
  return {
    background: C.bg, border: `1px solid ${highlight ? C.accent : C.border}`,
    borderRadius: 7, padding: '7px 10px', color: C.text,
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box'
  }
}

export default function AdsSpending({ user, isAdmin, merchantId }) {
  // Top filters
  const [overallFrom, setOverallFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [overallTo, setOverallTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedMerchant, setSelectedMerchant] = useState(isAdmin ? '' : (merchantId || ''))

  // Data
  const [merchantOptions, setMerchantOptions] = useState([])
  const [productRows, setProductRows] = useState([]) // [{sku, productName, totalOrders, firstDate, lastDate, loggedDates, fromDate, toDate, amount, currency}]
  const [existingEntries, setExistingEntries] = useState([])
  const [allEntries, setAllEntries] = useState([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [activeView, setActiveView] = useState('bulk') // 'bulk' | 'log'

  // Load merchants
  const loadMerchants = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('merchant_id')
      .gte('created_at', overallFrom)
      .lte('created_at', overallTo + 'T23:59:59')
    if (data) {
      const merchants = [...new Set(data.map(o => String(o.merchant_id)).filter(Boolean))].sort()
      setMerchantOptions(merchants)
    }
  }, [overallFrom, overallTo])

  // Load all existing spend entries
  const loadEntries = useCallback(async () => {
    setLoadingEntries(true)
    const { data } = await supabase.from('ads_spending').select('*').order('date_from', { ascending: false })
    setAllEntries(data || [])
    setLoadingEntries(false)
  }, [])

  useEffect(() => { loadMerchants(); loadEntries() }, [loadMerchants, loadEntries])

  // When merchant + date range selected, load product rows
  useEffect(() => {
    if (!selectedMerchant || !overallFrom || !overallTo) {
      setProductRows([])
      return
    }
    loadProductRows()
  }, [selectedMerchant, overallFrom, overallTo])

  const loadProductRows = async () => {
    setLoadingRows(true)
    setProductRows([])

    // Fetch orders for this merchant in date range
    let allOrders = []
    let page = 0
    while (true) {
      const { data } = await supabase
        .from('orders')
        .select('sku, product_name, created_at')
        .eq('merchant_id', selectedMerchant)
        .gte('created_at', overallFrom)
        .lte('created_at', overallTo + 'T23:59:59')
        .range(page * 1000, (page + 1) * 1000 - 1)
      if (!data || data.length === 0) break
      allOrders = allOrders.concat(data)
      if (data.length < 1000) break
      page++
    }

    // Group by product
    const byProduct = {}
    for (const o of allOrders) {
      const sku = o.sku || 'unknown'
      const name = o.product_name || sku
      const key = `${sku}||${name}`
      if (!byProduct[key]) byProduct[key] = { sku, productName: name, dates: [] }
      const d = o.created_at?.slice(0, 10)
      if (d) byProduct[key].dates.push(d)
    }

    // Fetch existing spend entries for this merchant
    const { data: spendData } = await supabase
      .from('ads_spending')
      .select('*')
      .eq('merchant_id', selectedMerchant)

    // Build logged dates per product
    const loggedByProduct = {}
    for (const entry of (spendData || [])) {
      const key = `${entry.sku}||${entry.product_name}`
      if (!loggedByProduct[key]) loggedByProduct[key] = new Set()
      try {
        const days = eachDayOfInterval({ start: parseISO(entry.date_from), end: parseISO(entry.date_to) })
        days.forEach(d => loggedByProduct[key].add(format(d, 'yyyy-MM-dd')))
      } catch {}
    }

    // Build rows
    const rows = Object.entries(byProduct).map(([key, prod]) => {
      const allDates = [...new Set(prod.dates)].sort()
      const loggedDates = loggedByProduct[key] || new Set()

      // Only dates within overall range that are NOT logged
      const unloggedDates = allDates.filter(d =>
        d >= overallFrom && d <= overallTo && !loggedDates.has(d)
      )

      const fullyLogged = unloggedDates.length === 0
      const fromDate = unloggedDates.length > 0 ? unloggedDates[0] : allDates[0] || overallFrom
      const toDate = unloggedDates.length > 0 ? unloggedDates[unloggedDates.length - 1] : allDates[allDates.length - 1] || overallTo

      return {
        key,
        sku: prod.sku,
        productName: prod.productName,
        totalOrders: prod.dates.length,
        fromDate,
        toDate,
        fullyLogged,
        unloggedDays: unloggedDates.length,
        amount: '',
        currency: 'SAR',
      }
    }).sort((a, b) => b.totalOrders - a.totalOrders)

    setProductRows(rows)
    setLoadingRows(false)
  }

  const updateRow = (key, field, value) => {
    setProductRows(rows => rows.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  const handleBulkSubmit = async () => {
    const toSubmit = productRows.filter(r => r.amount && parseFloat(r.amount) > 0 && !r.fullyLogged)
    if (toSubmit.length === 0) {
      setSubmitError('No amounts entered!')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')

    try {
      for (const row of toSubmit) {
        const rate = await fetchExchangeRate(row.currency, row.fromDate)
        const totalSar = parseFloat(row.amount) * rate
        const [sku, productName] = row.key.split('||')
        await supabase.from('ads_spending').insert({
          merchant_id: selectedMerchant,
          sku,
          product_name: productName,
          date_from: row.fromDate,
          date_to: row.toDate,
          total_amount: parseFloat(row.amount),
          currency: row.currency,
          amount_sar: Math.round(totalSar * 100) / 100,
          exchange_rate: rate,
          submitted_by: user?.id,
          submitted_by_email: user?.email,
        })
      }
      setSubmitSuccess(`✅ Logged ${toSubmit.length} entries successfully!`)
      loadEntries()
      loadProductRows()
    } catch (e) {
      setSubmitError(e.message || 'Error submitting')
    }
    setSubmitting(false)
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this entry?')) return
    await supabase.from('ads_spending').delete().eq('id', id)
    loadEntries()
    if (selectedMerchant) loadProductRows()
  }

  const totalSar = allEntries.reduce((s, e) => s + (e.amount_sar || 0), 0)
  const filledRows = productRows.filter(r => r.amount && parseFloat(r.amount) > 0)

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto', color: C.text, fontFamily: "'Inter', sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>Ads Spending</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>Log ad spend by merchant & product</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['bulk', 'log'].map(v => (
            <button key={v} onClick={() => setActiveView(v)} style={{
              background: activeView === v ? C.accent : C.card,
              color: activeView === v ? '#fff' : C.muted,
              border: `1px solid ${activeView === v ? C.accent : C.border}`,
              borderRadius: 8, padding: '8px 16px', fontSize: 13,
              cursor: 'pointer', fontWeight: 600
            }}>
              {v === 'bulk' ? '📋 Bulk Entry' : '📜 All Entries'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Entries', value: fmt(allEntries.length), accent: C.blue },
          { label: 'Total Ads Spent (SAR)', value: fmtSAR(totalSar), accent: C.accent },
        ].map(card => (
          <div key={card.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: card.accent }} />
            <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{card.label}</div>
            <div style={{ color: C.text, fontSize: 24, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* BULK ENTRY VIEW */}
      {activeView === 'bulk' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>

          {/* Filters */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <Label>Overall Date Range</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={overallFrom} onChange={e => setOverallFrom(e.target.value)} style={inputStyle(false)} />
                <span style={{ color: C.muted }}>→</span>
                <input type="date" value={overallTo} onChange={e => setOverallTo(e.target.value)} style={inputStyle(false)} />
              </div>
            </div>
            <div style={{ minWidth: 200 }}>
              <Label required>Merchant</Label>
              {isAdmin ? (
              <select value={selectedMerchant} onChange={e => setSelectedMerchant(e.target.value)}
                style={{ ...inputStyle(!!selectedMerchant), cursor: 'pointer' }}>
                <option value="">— Select Merchant —</option>
                {merchantOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              ) : (
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', color: C.accent, fontSize: 13, fontWeight: 600 }}>
                  Merchant {merchantId}
                </div>
              )}
            </div>
            {selectedMerchant && productRows.length > 0 && (
              <div style={{ color: C.muted, fontSize: 13, marginLeft: 'auto', alignSelf: 'center' }}>
                {productRows.filter(r => !r.fullyLogged).length} products need spend logging
              </div>
            )}
          </div>

          {/* Product Rows */}
          {!selectedMerchant ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.muted }}>
              Select a merchant to see their products
            </div>
          ) : loadingRows ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.muted }}>Loading products...</div>
          ) : productRows.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: C.muted }}>No orders found for this merchant in the selected date range</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Product', 'SKU', 'Orders', 'Unlogged Days', 'Date From', 'Date To', 'Amount Spent', 'Currency', 'Daily Avg', 'Status'].map(h => (
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
                    {productRows.map(row => {
                      const dailyAvg = row.amount && parseFloat(row.amount) > 0
                        ? (() => {
                          try {
                            const days = eachDayOfInterval({ start: parseISO(row.fromDate), end: parseISO(row.toDate) }).length
                            return Math.round(parseFloat(row.amount) / days)
                          } catch { return 0 }
                        })() : 0

                      return (
                        <tr key={row.key} style={{
                          borderBottom: `1px solid ${C.border}`,
                          opacity: row.fullyLogged ? 0.5 : 1,
                          background: row.fullyLogged ? C.surface + '80' : 'transparent'
                        }}>
                          {/* Product Name */}
                          <td style={{ padding: '12px 14px', color: C.text, maxWidth: 220 }}>
                            <span title={row.productName} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.productName?.slice(0, 40)}{row.productName?.length > 40 ? '…' : ''}
                            </span>
                          </td>
                          {/* SKU */}
                          <td style={{ padding: '12px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{row.sku}</td>
                          {/* Orders */}
                          <td style={{ padding: '12px 14px', color: C.text, textAlign: 'right' }}>
                            <span style={{ background: C.blueSoft, color: C.blue, padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>
                              {fmt(row.totalOrders)}
                            </span>
                          </td>
                          {/* Unlogged Days */}
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <span style={{
                              background: row.fullyLogged ? C.greenSoft : C.accentSoft,
                              color: row.fullyLogged ? C.green : C.accent,
                              padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12
                            }}>
                              {row.fullyLogged ? '✓ Done' : `${row.unloggedDays} days`}
                            </span>
                          </td>
                          {/* Date From */}
                          <td style={{ padding: '12px 14px' }}>
                            <input type="date" value={row.fromDate}
                              onChange={e => updateRow(row.key, 'fromDate', e.target.value)}
                              disabled={row.fullyLogged}
                              style={{ ...inputStyle(false), width: 140, opacity: row.fullyLogged ? 0.4 : 1 }}
                            />
                          </td>
                          {/* Date To */}
                          <td style={{ padding: '12px 14px' }}>
                            <input type="date" value={row.toDate}
                              onChange={e => updateRow(row.key, 'toDate', e.target.value)}
                              disabled={row.fullyLogged}
                              style={{ ...inputStyle(false), width: 140, opacity: row.fullyLogged ? 0.4 : 1 }}
                            />
                          </td>
                          {/* Amount */}
                          <td style={{ padding: '12px 14px' }}>
                            <input type="number" value={row.amount}
                              onChange={e => updateRow(row.key, 'amount', e.target.value)}
                              disabled={row.fullyLogged}
                              placeholder="0"
                              style={{ ...inputStyle(!!row.amount && parseFloat(row.amount) > 0), width: 120, opacity: row.fullyLogged ? 0.4 : 1 }}
                            />
                          </td>
                          {/* Currency */}
                          <td style={{ padding: '12px 14px' }}>
                            <select value={row.currency}
                              onChange={e => updateRow(row.key, 'currency', e.target.value)}
                              disabled={row.fullyLogged}
                              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', cursor: 'pointer', opacity: row.fullyLogged ? 0.4 : 1 }}>
                              <option value="SAR">🇸🇦 SAR</option>
                              <option value="EGP">🇪🇬 EGP</option>
                              <option value="USD">🇺🇸 USD</option>
                            </select>
                          </td>
                          {/* Daily Avg */}
                          <td style={{ padding: '12px 14px', color: C.orange, whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {dailyAvg > 0 ? `${fmt(dailyAvg)}/day` : '—'}
                          </td>
                          {/* Status */}
                          <td style={{ padding: '12px 14px' }}>
                            {row.fullyLogged ? (
                              <span style={{ color: C.green, fontSize: 12 }}>✓ Logged</span>
                            ) : row.amount && parseFloat(row.amount) > 0 ? (
                              <span style={{ color: C.accent, fontSize: 12 }}>● Ready</span>
                            ) : (
                              <span style={{ color: C.faint, fontSize: 12 }}>○ Empty</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Submit Bar */}
              <div style={{
                padding: '16px 20px', borderTop: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16
              }}>
                <div style={{ fontSize: 13, color: C.muted }}>
                  {filledRows.length > 0 ? (
                    <span style={{ color: C.text }}>
                      <strong style={{ color: C.accent }}>{filledRows.length}</strong> product{filledRows.length > 1 ? 's' : ''} ready to log
                    </span>
                  ) : 'Enter amounts for products to log spend'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {submitError && <span style={{ color: C.accent, fontSize: 13 }}>{submitError}</span>}
                  {submitSuccess && <span style={{ color: C.green, fontSize: 13 }}>{submitSuccess}</span>}
                  <button
                    onClick={handleBulkSubmit}
                    disabled={submitting || filledRows.length === 0}
                    style={{
                      background: filledRows.length === 0 ? C.faint : C.accent,
                      color: '#fff', border: 'none', borderRadius: 8,
                      padding: '10px 24px', fontSize: 14, cursor: filledRows.length === 0 ? 'not-allowed' : 'pointer',
                      fontWeight: 700
                    }}>
                    {submitting ? 'Saving...' : `Log ${filledRows.length || ''} Entries`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ALL ENTRIES VIEW */}
      {activeView === 'log' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>All Spending Entries</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>Daily average = Total ÷ Days in range</div>
          </div>
          {loadingEntries ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
          ) : allEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>No entries yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Merchant', 'SKU', 'Product', 'Date From', 'Date To', 'Days', 'Amount', 'CCY', 'Total SAR', 'Daily SAR', 'By', ''].map(h => (
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
                  {allEntries.map(entry => {
                    let days = 1
                    try { days = eachDayOfInterval({ start: parseISO(entry.date_from), end: parseISO(entry.date_to) }).length } catch {}
                    const dailySar = Math.round((entry.amount_sar / days) * 10) / 10
                    return (
                      <tr key={entry.id} style={{ borderBottom: `1px solid ${C.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surface}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px 14px', color: C.text, whiteSpace: 'nowrap' }}>{entry.merchant_id}</td>
                        <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap', fontSize: 12 }}>{entry.sku}</td>
                        <td style={{ padding: '10px 14px', color: C.text, maxWidth: 180 }}>
                          <span title={entry.product_name}>{entry.product_name?.slice(0, 28)}{entry.product_name?.length > 28 ? '…' : ''}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{entry.date_from}</td>
                        <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{entry.date_to}</td>
                        <td style={{ padding: '10px 14px', color: C.text, textAlign: 'right' }}>{days}</td>
                        <td style={{ padding: '10px 14px', color: C.text, whiteSpace: 'nowrap' }}>{fmt(entry.total_amount)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            background: entry.currency === 'SAR' ? C.greenSoft : entry.currency === 'USD' ? C.blueSoft : C.accentSoft,
                            color: entry.currency === 'SAR' ? C.green : entry.currency === 'USD' ? C.blue : C.accent,
                            padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700
                          }}>{entry.currency}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: C.green, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtSAR(entry.amount_sar)}</td>
                        <td style={{ padding: '10px 14px', color: C.orange, whiteSpace: 'nowrap' }}>{fmt(dailySar)}/day</td>
                        <td style={{ padding: '10px 14px', color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{entry.submitted_by_email?.split('@')[0]}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
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
      )}

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
        input[type="number"]::-webkit-inner-spin-button { opacity: 0.3; }
        select option { background: #1c1f2e; }
      `}</style>
    </div>
  )
}
