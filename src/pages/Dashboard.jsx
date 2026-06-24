import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchDailyTimeline,
  fetchTodayVsYesterday,
  fetchMerchantPerformance,
  fetchSkuPerformance,
  fetchMerchantSkuPerformance,
  calcMetrics,
  fetchOrders
} from '../lib/data'
import { format, subDays } from 'date-fns'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const C = {
  bg: '#13151f',
  surface: '#1c1f2e',
  card: '#222538',
  border: '#2e3350',
  accent: '#e8394a',
  accentSoft: '#e8394a18',
  green: '#22c55e',
  greenSoft: '#22c55e18',
  orange: '#f97316',
  orangeSoft: '#f9731618',
  blue: '#3b82f6',
  blueSoft: '#3b82f618',
  purple: '#a855f7',
  text: '#e2e5f0',
  muted: '#6b7490',
  faint: '#343855',
}

const fmt = n => Number(n || 0).toLocaleString()
const fmtSAR = n => `${fmt(Math.round(n || 0))}`
const fmtPct = n => `${Number(n || 0).toFixed(1)}%`

function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const start = prev.current
    const diff = target - start
    const steps = 30
    let i = 0
    const timer = setInterval(() => {
      i++
      setVal(Math.round(start + diff * (i / steps)))
      if (i >= steps) { clearInterval(timer); prev.current = target }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [target, duration])
  return val
}

function KpiCard({ label, value, formatted, sub, accent, icon }) {
  const animated = useCountUp(value)
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
      flex: '1 1 160px',
      minWidth: 150,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: accent || C.accent,
        borderRadius: '14px 14px 0 0'
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          {label}
        </div>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div style={{ color: C.text, fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
        {formatted ? formatted(animated) : fmt(animated)}
      </div>
      {sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function RateBadge({ value }) {
  const n = parseFloat(value) || 0
  const color = n >= 70 ? C.green : n >= 50 ? C.orange : C.accent
  const bg = n >= 70 ? C.greenSoft : n >= 50 ? C.orangeSoft : C.accentSoft
  return (
    <span style={{
      background: bg, color, padding: '3px 9px',
      borderRadius: 6, fontSize: 12, fontWeight: 700,
      fontVariantNumeric: 'tabular-nums'
    }}>
      {fmtPct(n)}
    </span>
  )
}

function Panel({ title, sub, children, action }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{title}</div>
          {sub && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '12px 16px', fontSize: 13
    }}>
      <div style={{ color: C.muted, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 3 }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name?.includes('%') ? fmtPct(p.value) : fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function SortableTable({ columns, rows, loading, maxRows = 50 }) {
  const [sort, setSort] = useState({ key: columns[0]?.key, dir: -1 })
  const [page, setPage] = useState(1)
  const PER = 15

  const sorted = [...(rows || [])].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === 'string') return sort.dir * av.localeCompare(bv)
    return sort.dir * ((av || 0) - (bv || 0))
  })

  const pages = Math.max(1, Math.ceil(sorted.length / PER))
  const slice = sorted.slice((page - 1) * PER, page * PER)

  const handleSort = key => {
    setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }))
    setPage(1)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
  )

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: '10px 14px', textAlign: col.align || 'right',
                    color: sort.key === col.key ? C.accent : C.muted,
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: `1px solid ${C.border}`, background: C.surface,
                    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                    fontWeight: 600
                  }}>
                  {col.label} {sort.key === col.key ? (sort.dir < 0 ? '↓' : '↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding: '10px 14px', textAlign: col.align || 'right',
                    color: C.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'
                  }}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: C.muted, fontSize: 12
        }}>
          <span>Page {page} of {pages} · {sorted.length} rows</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              ←
            </button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeline, setTimeline] = useState([])
  const [hourly, setHourly] = useState([])
  const [merchants, setMerchants] = useState([])
  const [skus, setSkus] = useState([])
  const [merchantSkus, setMerchantSkus] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [activeTab, setActiveTab] = useState('daily')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = dateFrom + 'T00:00:00'
      const to = dateTo + 'T23:59:59'
      const [tl, hly, merch, sku, msku, orders] = await Promise.all([
        fetchDailyTimeline(from, to),
        fetchTodayVsYesterday(),
        fetchMerchantPerformance(from, to),
        fetchSkuPerformance(from, to),
        fetchMerchantSkuPerformance(from, to),
        fetchOrders(from, to)
      ])
      setTimeline(tl)
      setHourly(hly)
      setMerchants(merch)
      setSkus(sku)
      setMerchantSkus(msku)
      setSummary(calcMetrics(orders))
      setLastUpdated(new Date())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const quickRange = days => {
    setDateFrom(format(subDays(new Date(), days), 'yyyy-MM-dd'))
    setDateTo(format(new Date(), 'yyyy-MM-dd'))
  }

  const dailyCols = [
    { key: 'day', label: 'Date', align: 'left', render: v => <span style={{ color: C.muted }}>{v}</span> },
    { key: 'total', label: 'Orders', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', render: v => <span style={{ color: C.green }}>{fmt(v)}</span> },
    { key: 'confirmationRate', label: 'CR%', render: v => <RateBadge value={v} /> },
    { key: 'dispatchRate', label: 'Dispatch%', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', render: v => <RateBadge value={v} /> },
    { key: 'netDeliveryRate', label: 'NDR%', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg SAR', render: v => fmtSAR(v) },
    { key: 'confirmedCod', label: 'Conf. COD', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'DLVD COD', render: v => <span style={{ color: C.green }}>{fmtSAR(v)}</span> },
  ]

  const merchantCols = [
    { key: 'merchantId', label: 'Merchant', align: 'left' },
    { key: 'total', label: 'Orders', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', render: v => fmt(v) },
    { key: 'confirmationRate', label: 'CR%', render: v => <RateBadge value={v} /> },
    { key: 'dispatchRate', label: 'Dispatch%', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', render: v => <RateBadge value={v} /> },
    { key: 'netDeliveryRate', label: 'NDR%', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg SAR', render: v => fmtSAR(v) },
    { key: 'confirmedCod', label: 'Conf. COD', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'DLVD COD', render: v => <span style={{ color: C.green }}>{fmtSAR(v)}</span> },
  ]

  const skuCols = [
    { key: 'sku', label: 'SKU', align: 'left' },
    { key: 'productName', label: 'Product', align: 'left', render: v => <span title={v} style={{ color: C.text }}>{v?.slice(0, 35)}{v?.length > 35 ? '…' : ''}</span> },
    { key: 'total', label: 'Orders', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', render: v => fmt(v) },
    { key: 'confirmationRate', label: 'CR%', render: v => <RateBadge value={v} /> },
    { key: 'dispatchRate', label: 'Dispatch%', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', render: v => <RateBadge value={v} /> },
    { key: 'netDeliveryRate', label: 'NDR%', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg SAR', render: v => fmtSAR(v) },
    { key: 'confirmedCod', label: 'Conf. COD', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'DLVD COD', render: v => <span style={{ color: C.green }}>{fmtSAR(v)}</span> },
  ]

  const merchantSkuCols = [
    { key: 'merchantId', label: 'Merchant', align: 'left' },
    { key: 'sku', label: 'SKU', align: 'left' },
    { key: 'productName', label: 'Product', align: 'left', render: v => <span title={v}>{v?.slice(0, 30)}{v?.length > 30 ? '…' : ''}</span> },
    { key: 'total', label: 'Orders', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', render: v => fmt(v) },
    { key: 'confirmationRate', label: 'CR%', render: v => <RateBadge value={v} /> },
    { key: 'dispatchRate', label: 'Dispatch%', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', render: v => <RateBadge value={v} /> },
    { key: 'netDeliveryRate', label: 'NDR%', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg SAR', render: v => fmtSAR(v) },
    { key: 'confirmedCod', label: 'Conf. COD', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'DLVD COD', render: v => <span style={{ color: C.green }}>{fmtSAR(v)}</span> },
  ]

  const tabs = [
    { id: 'daily', label: 'Daily Performance' },
    { id: 'merchant', label: 'By Merchant' },
    { id: 'sku', label: 'By SKU' },
    { id: 'merchantsku', label: 'Merchant × Product' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 14 }}>

      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 54,
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, background: C.accent, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#fff'
          }}>N</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>NML & Sllr</span>
          <span style={{ color: C.faint }}>·</span>
          <span style={{ color: C.muted, fontSize: 13 }}>Performance</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'pulse 2s infinite' }} />
              {format(lastUpdated, 'HH:mm')}
            </div>
          )}
          <button onClick={load} disabled={loading} style={{
            background: loading ? C.faint : C.accent, color: '#fff',
            border: 'none', borderRadius: 7, padding: '6px 14px',
            fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600
          }}>
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{
            background: 'transparent', color: C.muted,
            border: `1px solid ${C.border}`, borderRadius: 7,
            padding: '6px 12px', fontSize: 13, cursor: 'pointer'
          }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>

        {/* Filters */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <span style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Range</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7,
            padding: '6px 10px', color: C.text, fontSize: 13, outline: 'none'
          }} />
          <span style={{ color: C.muted }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7,
            padding: '6px 10px', color: C.text, fontSize: 13, outline: 'none'
          }} />
          <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => quickRange(d)} style={{
                background: C.bg, color: C.muted, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: '5px 11px', fontSize: 12, cursor: 'pointer', fontWeight: 500
              }}>
                {d}d
              </button>
            ))}
          </div>
          {summary && !loading && (
            <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 12 }}>
              {fmt(summary.total)} orders in range
            </span>
          )}
        </div>

        {/* KPI Cards */}
        {summary && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <KpiCard label="Total Orders" value={summary.total} icon="📦" />
            <KpiCard label="Confirmed" value={summary.confirmed} accent={C.green} icon="✅"
              sub={fmtPct(summary.confirmationRate) + ' CR'} />
            <KpiCard label="Dispatched" value={summary.dispatched} accent={C.blue} icon="🚚"
              sub={fmtPct(summary.dispatchRate) + ' of confirmed'} />
            <KpiCard label="Delivered" value={summary.delivered} accent={C.purple} icon="🏠"
              sub={fmtPct(summary.deliveryRate) + ' delivery rate'} />
            <KpiCard label="Conf. Rate" value={Math.round(summary.confirmationRate * 10) / 10}
              formatted={v => v + '%'}
              accent={summary.confirmationRate >= 60 ? C.green : C.accent} icon="📊" />
            <KpiCard label="Delivery Rate" value={Math.round(summary.deliveryRate * 10) / 10}
              formatted={v => v + '%'}
              accent={summary.deliveryRate >= 60 ? C.green : C.accent} icon="📈" />
            <KpiCard label="Total COD" value={Math.round(summary.totalCod)}
              formatted={v => fmt(v) + ' SAR'} icon="💰" />
            <KpiCard label="Delivered COD" value={Math.round(summary.deliveredCod)}
              formatted={v => fmt(v) + ' SAR'} accent={C.green} icon="💵" />
            <KpiCard label="Avg Order SAR" value={Math.round(summary.avgSellingPrice)}
              formatted={v => fmt(v) + ' SAR'} accent={C.orange} icon="🏷️" />
          </div>
        )}

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Timeline Chart */}
          <Panel title="Daily Orders Timeline" sub="Orders, confirmed & rates over time">
            <div style={{ padding: '16px 8px 8px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={timeline} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 11 }}
                    tickFormatter={v => v?.slice(5)} stroke={C.border} />
                  <YAxis yAxisId="left" tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]}
                    tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border}
                    tickFormatter={v => v + '%'} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="total" stroke={C.blue} dot={false} strokeWidth={2} name="Total" />
                  <Line yAxisId="left" type="monotone" dataKey="confirmed" stroke={C.green} dot={false} strokeWidth={2} name="Confirmed" />
                  <Line yAxisId="right" type="monotone" dataKey="confirmationRate" stroke={C.accent} dot={false} strokeWidth={2} name="CR%" strokeDasharray="5 3" />
                  <Line yAxisId="right" type="monotone" dataKey="deliveryRate" stroke={C.purple} dot={false} strokeWidth={2} name="Del%" strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Today vs Yesterday */}
          <Panel title="Today vs Yesterday" sub="Hourly order volume comparison">
            <div style={{ padding: '16px 8px 8px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="hour" tick={{ fill: C.muted, fontSize: 10 }} stroke={C.border}
                    tickFormatter={v => v?.slice(0, 2)} interval={2} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
                  <Bar dataKey="today" fill={C.blue} name="Today" radius={[3, 3, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="yesterday" fill={C.faint} name="Yesterday" radius={[3, 3, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Tables */}
        <Panel
          title="Performance Tables"
          sub="Detailed breakdown — click headers to sort"
          action={
            <div style={{ display: 'flex', gap: 4 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  background: activeTab === t.id ? C.accent : C.bg,
                  color: activeTab === t.id ? '#fff' : C.muted,
                  border: `1px solid ${activeTab === t.id ? C.accent : C.border}`,
                  borderRadius: 7, padding: '5px 12px', fontSize: 12,
                  cursor: 'pointer', fontWeight: 600
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          }
        >
          {activeTab === 'daily' && (
            <SortableTable columns={dailyCols} rows={[...timeline].reverse()} loading={loading} />
          )}
          {activeTab === 'merchant' && (
            <SortableTable columns={merchantCols} rows={merchants} loading={loading} />
          )}
          {activeTab === 'sku' && (
            <SortableTable columns={skuCols} rows={skus} loading={loading} />
          )}
          {activeTab === 'merchantsku' && (
            <SortableTable columns={merchantSkuCols} rows={merchantSkus} loading={loading} />
          )}
        </Panel>

      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
        * { scrollbar-width: thin; scrollbar-color: ${C.faint} transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.faint}; border-radius: 3px; }
      `}</style>
    </div>
  )
}
