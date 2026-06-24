import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchOrders,
  fetchTodayVsYesterday,
  applyFilters,
  calcMetrics,
  computeDailyTimeline,
  computeMerchantPerformance,
  computeSkuPerformance,
  computeMerchantSkuPerformance,
} from '../lib/data'
import { format, subDays } from 'date-fns'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const C = {
  bg: '#13151f', surface: '#1c1f2e', card: '#222538', border: '#2e3350',
  accent: '#e8394a', accentSoft: '#e8394a18',
  green: '#22c55e', greenSoft: '#22c55e18',
  orange: '#f97316', orangeSoft: '#f9731618',
  blue: '#3b82f6', blueSoft: '#3b82f618',
  purple: '#a855f7', text: '#e2e5f0', muted: '#6b7490', faint: '#343855',
}

const fmt = n => Number(n || 0).toLocaleString()
const fmtSAR = n => `${fmt(Math.round(n || 0))}`
const fmtPct = n => `${Number(n || 0).toFixed(1)}%`

function useCountUp(target, duration = 600) {
  const [val, setVal] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const start = prev.current
    const diff = target - start
    const steps = 20
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
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: '18px 20px', position: 'relative', overflow: 'hidden',
      flex: '1 1 160px', minWidth: 150,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent || C.accent, borderRadius: '14px 14px 0 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div style={{ color: C.text, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
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
    <span style={{ background: bg, color, padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
      {fmtPct(n)}
    </span>
  )
}

function Panel({ title, sub, children, action }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
      <div style={{ color: C.muted, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 3 }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function MultiSelect({ label, options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = val => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val))
    else onChange([...selected, val])
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 160 }}>
      <div onClick={() => setOpen(o => !o)} style={{
        background: C.bg, border: `1px solid ${selected.length ? C.accent : C.border}`,
        borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        color: selected.length ? C.text : C.muted, fontSize: 13, userSelect: 'none'
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
          {selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`}
        </span>
        <span style={{ color: C.muted, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          {selected.length > 0 && (
            <div onClick={() => onChange([])} style={{
              padding: '8px 12px', color: C.accent, fontSize: 12,
              cursor: 'pointer', borderBottom: `1px solid ${C.border}`, fontWeight: 600
            }}>
              Clear all
            </div>
          )}
          {options.map(opt => (
            <div key={opt} onClick={() => toggle(opt)} style={{
              padding: '8px 12px', cursor: 'pointer', fontSize: 13,
              color: selected.includes(opt) ? C.accent : C.text,
              background: selected.includes(opt) ? C.accentSoft : 'transparent',
              display: 'flex', alignItems: 'center', gap: 8
            }}
              onMouseEnter={e => e.currentTarget.style.background = selected.includes(opt) ? C.accentSoft : C.faint}
              onMouseLeave={e => e.currentTarget.style.background = selected.includes(opt) ? C.accentSoft : 'transparent'}
            >
              <span style={{
                width: 14, height: 14, borderRadius: 3, border: `1px solid ${selected.includes(opt) ? C.accent : C.muted}`,
                background: selected.includes(opt) ? C.accent : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, color: '#fff'
              }}>
                {selected.includes(opt) ? '✓' : ''}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RangeSlider({ min, max, value, onChange, label }) {
  const [localMin, setLocalMin] = useState(value[0])
  const [localMax, setLocalMax] = useState(value[1])

  useEffect(() => { setLocalMin(value[0]); setLocalMax(value[1]) }, [value])

  const pct = v => ((v - min) / (max - min)) * 100

  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
        {label}: <span style={{ color: C.text }}>{fmt(localMin)} – {fmt(localMax)} SAR</span>
      </div>
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: C.faint, borderRadius: 2 }} />
        <div style={{
          position: 'absolute', left: pct(localMin) + '%', right: (100 - pct(localMax)) + '%',
          height: 4, background: C.accent, borderRadius: 2
        }} />
        <input type="range" min={min} max={max} value={localMin}
          onChange={e => { const v = Math.min(Number(e.target.value), localMax - 1); setLocalMin(v) }}
          onMouseUp={() => onChange([localMin, localMax])}
          onTouchEnd={() => onChange([localMin, localMax])}
          style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: 20 }}
        />
        <input type="range" min={min} max={max} value={localMax}
          onChange={e => { const v = Math.max(Number(e.target.value), localMin + 1); setLocalMax(v) }}
          onMouseUp={() => onChange([localMin, localMax])}
          onTouchEnd={() => onChange([localMin, localMax])}
          style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: 20 }}
        />
      </div>
    </div>
  )
}

function SortableTable({ columns, rows, loading }) {
  const [sort, setSort] = useState({ key: columns[1]?.key || columns[0]?.key, dir: -1 })
  const [page, setPage] = useState(1)
  const PER = 15

  useEffect(() => { setPage(1) }, [rows])

  const sorted = useMemo(() => [...(rows || [])].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (typeof av === 'string') return sort.dir * av.localeCompare(bv)
    return sort.dir * ((av || 0) - (bv || 0))
  }), [rows, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / PER))
  const slice = sorted.slice((page - 1) * PER, page * PER)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>
  if (!rows?.length) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>No data</div>

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} onClick={() => setSort(s => ({ key: col.key, dir: s.key === col.key ? -s.dir : -1 }))}
                  style={{
                    padding: '10px 14px', textAlign: col.align || 'right',
                    color: sort.key === col.key ? C.accent : C.muted,
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: `1px solid ${C.border}`, background: C.surface,
                    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', fontWeight: 600
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
                  <td key={col.key} style={{ padding: '10px 14px', textAlign: col.align || 'right', color: C.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: C.muted, fontSize: 12 }}>
          <span>Page {page} of {pages} · {sorted.length} rows</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>←</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>→</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [rawOrders, setRawOrders] = useState([])
  const [hourly, setHourly] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [activeTab, setActiveTab] = useState('daily')

  // Filters
  const [selectedMerchants, setSelectedMerchants] = useState([])
  const [selectedProducts, setSelectedProducts] = useState([])
  const [codRange, setCodRange] = useState([0, 10000])
  const [codBounds, setCodBounds] = useState([0, 10000])
  const [excludeLast10, setExcludeLast10] = useState(false)
  const [dispatchFrom, setDispatchFrom] = useState('')
  const [dispatchTo, setDispatchTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = dateFrom + 'T00:00:00'
      const to = dateTo + 'T23:59:59'
      const [orders, hly] = await Promise.all([
        fetchOrders(from, to),
        fetchTodayVsYesterday()
      ])
      setRawOrders(orders)
      setHourly(hly)

      // Set COD bounds from actual data
      if (orders.length > 0) {
        const cods = orders.map(o => parseFloat(o.cod) || 0)
        const minC = Math.floor(Math.min(...cods))
        const maxC = Math.ceil(Math.max(...cods))
        setCodBounds([minC, maxC])
        setCodRange([minC, maxC])
      }

      // Reset filters on new date range
      setSelectedMerchants([])
      setSelectedProducts([])
      setDispatchFrom('')
      setDispatchTo('')
      setExcludeLast10(false)

      setLastUpdated(new Date())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // Unique options from raw orders
  const merchantOptions = useMemo(() =>
    [...new Set(rawOrders.map(o => String(o.merchant_id || 'Unknown')))].sort(),
    [rawOrders])

  const productOptions = useMemo(() =>
    [...new Set(rawOrders.map(o => o.product_name || 'Unknown'))].sort(),
    [rawOrders])

  // Apply filters
  const filteredOrders = useMemo(() => applyFilters(rawOrders, {
    merchants: selectedMerchants,
    products: selectedProducts,
    minCod: codRange[0],
    maxCod: codRange[1],
    excludeLast10Days: excludeLast10,
    dispatchFrom,
    dispatchTo,
  }), [rawOrders, selectedMerchants, selectedProducts, codRange, excludeLast10, dispatchFrom, dispatchTo])

  // Computed tables from filtered orders
  const summary = useMemo(() => calcMetrics(filteredOrders), [filteredOrders])
  const timeline = useMemo(() => computeDailyTimeline(filteredOrders), [filteredOrders])
  const merchants = useMemo(() => computeMerchantPerformance(filteredOrders), [filteredOrders])
  const skus = useMemo(() => computeSkuPerformance(filteredOrders), [filteredOrders])
  const merchantSkus = useMemo(() => computeMerchantSkuPerformance(filteredOrders), [filteredOrders])

  const quickRange = days => {
    setDateFrom(format(subDays(new Date(), days), 'yyyy-MM-dd'))
    setDateTo(format(new Date(), 'yyyy-MM-dd'))
  }

  const activeFiltersCount = selectedMerchants.length + selectedProducts.length +
    (excludeLast10 ? 1 : 0) + (dispatchFrom || dispatchTo ? 1 : 0) +
    (codRange[0] !== codBounds[0] || codRange[1] !== codBounds[1] ? 1 : 0)

  const resetFilters = () => {
    setSelectedMerchants([])
    setSelectedProducts([])
    setCodRange(codBounds)
    setExcludeLast10(false)
    setDispatchFrom('')
    setDispatchTo('')
  }

  const commonCols = [
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

  const dailyCols = [
    { key: 'day', label: 'Date', align: 'left', render: v => <span style={{ color: C.muted }}>{v}</span> },
    ...commonCols
  ]

  const merchantCols = [
    { key: 'merchantId', label: 'Merchant', align: 'left' },
    ...commonCols
  ]

  const skuCols = [
    { key: 'sku', label: 'SKU', align: 'left' },
    { key: 'productName', label: 'Product', align: 'left', render: v => <span title={v}>{v?.slice(0, 35)}{v?.length > 35 ? '…' : ''}</span> },
    ...commonCols
  ]

  const merchantSkuCols = [
    { key: 'merchantId', label: 'Merchant', align: 'left' },
    { key: 'sku', label: 'SKU', align: 'left' },
    { key: 'productName', label: 'Product', align: 'left', render: v => <span title={v}>{v?.slice(0, 28)}{v?.length > 28 ? '…' : ''}</span> },
    ...commonCols
  ]

  const tabs = [
    { id: 'daily', label: 'Daily' },
    { id: 'merchant', label: 'Merchant' },
    { id: 'sku', label: 'SKU' },
    { id: 'merchantsku', label: 'Merchant × Product' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', -apple-system, sans-serif", fontSize: 14 }}>

      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 54, position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: C.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>N</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>NML & Sllr</span>
          <span style={{ color: C.faint }}>·</span>
          <span style={{ color: C.muted, fontSize: 13 }}>Performance</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
              {format(lastUpdated, 'HH:mm')}
            </div>
          )}
          <button onClick={load} disabled={loading} style={{
            background: loading ? C.faint : C.accent, color: '#fff', border: 'none',
            borderRadius: 7, padding: '6px 14px', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600
          }}>
            {loading ? '...' : '↻ Refresh'}
          </button>
          <button onClick={() => supabase.auth.signOut()} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '6px 12px', fontSize: 13, cursor: 'pointer'
          }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>

        {/* Filter Panel */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: '16px 20px', marginBottom: 20
        }}>
          {/* Row 1: Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, minWidth: 70 }}>Order Date</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' }} />
            <span style={{ color: C.muted }}>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {[7, 14, 30, 60].map(d => (
                <button key={d} onClick={() => quickRange(d)} style={{
                  background: C.bg, color: C.muted, border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: '5px 11px', fontSize: 12, cursor: 'pointer', fontWeight: 500
                }}>{d}d</button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.border, marginBottom: 14 }} />

          {/* Row 2: Dropdowns + Toggle */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>Merchant</div>
              <MultiSelect
                options={merchantOptions}
                selected={selectedMerchants}
                onChange={setSelectedMerchants}
                placeholder="All merchants"
              />
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>Product</div>
              <MultiSelect
                options={productOptions}
                selected={selectedProducts}
                onChange={setSelectedProducts}
                placeholder="All products"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Options</div>
              <button
                onClick={() => setExcludeLast10(v => !v)}
                style={{
                  background: excludeLast10 ? C.accentSoft : C.bg,
                  color: excludeLast10 ? C.accent : C.muted,
                  border: `1px solid ${excludeLast10 ? C.accent : C.border}`,
                  borderRadius: 7, padding: '7px 14px', fontSize: 13,
                  cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap'
                }}>
                {excludeLast10 ? '✕ ' : ''}Exclude last 10 days
              </button>
            </div>
          </div>

          {/* Row 3: Dispatch date + COD slider */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>Dispatch Date</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={dispatchFrom} onChange={e => setDispatchFrom(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${dispatchFrom ? C.accent : C.border}`, borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' }} />
                <span style={{ color: C.muted }}>→</span>
                <input type="date" value={dispatchTo} onChange={e => setDispatchTo(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${dispatchTo ? C.accent : C.border}`, borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none' }} />
                {(dispatchFrom || dispatchTo) && (
                  <button onClick={() => { setDispatchFrom(''); setDispatchTo('') }}
                    style={{ background: 'transparent', color: C.muted, border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 220 }}>
              <RangeSlider
                label="Avg COD"
                min={codBounds[0]}
                max={codBounds[1]}
                value={codRange}
                onChange={setCodRange}
              />
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeFiltersCount > 0 && (
                <>
                  <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>
                    {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active · {fmt(filteredOrders.length)} orders
                  </span>
                  <button onClick={resetFilters} style={{
                    background: 'transparent', color: C.muted, border: `1px solid ${C.border}`,
                    borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer'
                  }}>Reset filters</button>
                </>
              )}
              {activeFiltersCount === 0 && !loading && (
                <span style={{ color: C.muted, fontSize: 12 }}>{fmt(filteredOrders.length)} orders</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <KpiCard label="Total Orders" value={summary.total} icon="📦" />
          <KpiCard label="Confirmed" value={summary.confirmed} accent={C.green} icon="✅" sub={fmtPct(summary.confirmationRate) + ' CR'} />
          <KpiCard label="Dispatched" value={summary.dispatched} accent={C.blue} icon="🚚" sub={fmtPct(summary.dispatchRate) + ' dispatch rate'} />
          <KpiCard label="Delivered" value={summary.delivered} accent={C.purple} icon="🏠" sub={fmtPct(summary.deliveryRate) + ' delivery rate'} />
          <KpiCard label="CR%" value={Math.round(summary.confirmationRate * 10) / 10} formatted={v => v + '%'} accent={summary.confirmationRate >= 60 ? C.green : C.accent} icon="📊" />
          <KpiCard label="NDR%" value={Math.round(summary.netDeliveryRate * 10) / 10} formatted={v => v + '%'} accent={summary.netDeliveryRate >= 30 ? C.green : C.accent} icon="📈" />
          <KpiCard label="Total COD" value={Math.round(summary.totalCod)} formatted={v => fmt(v) + ' SAR'} icon="💰" />
          <KpiCard label="Conf. COD" value={Math.round(summary.confirmedCod)} formatted={v => fmt(v) + ' SAR'} accent={C.green} icon="💵" />
          <KpiCard label="DLVD COD" value={Math.round(summary.deliveredCod)} formatted={v => fmt(v) + ' SAR'} accent={C.purple} icon="🏆" />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
          <Panel title="Daily Orders Timeline" sub="Orders & rates over selected period">
            <div style={{ padding: '16px 8px 8px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={timeline} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={v => v?.slice(5)} stroke={C.border} />
                  <YAxis yAxisId="left" tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} tickFormatter={v => v + '%'} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="total" stroke={C.blue} dot={false} strokeWidth={2} name="Total" />
                  <Line yAxisId="left" type="monotone" dataKey="confirmed" stroke={C.green} dot={false} strokeWidth={2} name="Confirmed" />
                  <Line yAxisId="right" type="monotone" dataKey="confirmationRate" stroke={C.accent} dot={false} strokeWidth={2} name="CR%" strokeDasharray="5 3" />
                  <Line yAxisId="right" type="monotone" dataKey="netDeliveryRate" stroke={C.purple} dot={false} strokeWidth={2} name="NDR%" strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Today vs Yesterday" sub="Hourly order volume">
            <div style={{ padding: '16px 8px 8px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hourly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="hour" tick={{ fill: C.muted, fontSize: 10 }} stroke={C.border} tickFormatter={v => v?.slice(0, 2)} interval={2} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
                  <Bar dataKey="today" fill={C.blue} name="Today" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="yesterday" fill={C.faint} name="Yesterday" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Tables */}
        <Panel
          title="Performance Breakdown"
          sub="Click column headers to sort"
          action={
            <div style={{ display: 'flex', gap: 4 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  background: activeTab === t.id ? C.accent : C.bg,
                  color: activeTab === t.id ? '#fff' : C.muted,
                  border: `1px solid ${activeTab === t.id ? C.accent : C.border}`,
                  borderRadius: 7, padding: '5px 12px', fontSize: 12,
                  cursor: 'pointer', fontWeight: 600
                }}>{t.label}</button>
              ))}
            </div>
          }
        >
          {activeTab === 'daily' && <SortableTable columns={dailyCols} rows={[...timeline].reverse()} loading={loading} />}
          {activeTab === 'merchant' && <SortableTable columns={merchantCols} rows={merchants} loading={loading} />}
          {activeTab === 'sku' && <SortableTable columns={skuCols} rows={skus} loading={loading} />}
          {activeTab === 'merchantsku' && <SortableTable columns={merchantSkuCols} rows={merchantSkus} loading={loading} />}
        </Panel>

      </div>

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
        * { scrollbar-width: thin; scrollbar-color: ${C.faint} transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.faint}; border-radius: 3px; }
      `}</style>
    </div>
  )
}
