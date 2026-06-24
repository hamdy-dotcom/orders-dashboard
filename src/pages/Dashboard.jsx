import { useState, useEffect, useCallback } from 'react'
import ReactApexChart from 'react-apexcharts'
import { supabase } from '../lib/supabase'
import {
  fetchDailyTimeline,
  fetchTodayVsYesterday,
  fetchMerchantPerformance,
  fetchSkuPerformance,
  calcMetrics,
  fetchOrders
} from '../lib/data'
import { format, subDays } from 'date-fns'

const COLORS = {
  bg: '#0f1117',
  card: '#1a1d27',
  border: '#2a2d3e',
  text: '#e5e7eb',
  muted: '#6b7280',
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  orange: '#f97316',
  purple: '#8b5cf6',
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '20px 24px',
      flex: 1,
      minWidth: 140
    }}>
      <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ color: color || COLORS.text, fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px' }}>
        {value}
      </div>
      {sub && <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        color: COLORS.muted,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 12,
        paddingLeft: 2
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function DataTable({ columns, rows, loading }) {
  if (loading) return <div style={{ color: COLORS.muted, padding: 24, textAlign: 'center' }}>Loading...</div>
  if (!rows.length) return <div style={{ color: COLORS.muted, padding: 24, textAlign: 'center' }}>No data</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '10px 14px',
                textAlign: col.align || 'left',
                color: COLORS.muted,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: `1px solid ${COLORS.border}`,
                whiteSpace: 'nowrap'
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '10px 14px',
                  textAlign: col.align || 'left',
                  color: col.color ? col.color(row[col.key]) : COLORS.text,
                  whiteSpace: 'nowrap'
                }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RateBadge({ value }) {
  const color = value >= 70 ? COLORS.green : value >= 50 ? COLORS.orange : COLORS.red
  return (
    <span style={{
      background: color + '22',
      color,
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600
    }}>
      {value}%
    </span>
  )
}

function fmt(n) { return n?.toLocaleString() || '0' }
function fmtSAR(n) { return `${fmt(Math.round(n))} SAR` }
function fmtRate(n) { return `${n}%` }

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeline, setTimeline] = useState([])
  const [hourly, setHourly] = useState([])
  const [merchants, setMerchants] = useState([])
  const [skus, setSkus] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = dateFrom + 'T00:00:00'
      const to = dateTo + 'T23:59:59'

      const [tl, hly, merch, sku, orders] = await Promise.all([
        fetchDailyTimeline(from, to),
        fetchTodayVsYesterday(),
        fetchMerchantPerformance(from, to),
        fetchSkuPerformance(from, to),
        fetchOrders(from, to)
      ])

      setTimeline(tl)
      setHourly(hly)
      setMerchants(merch)
      setSkus(sku)
      setSummary(calcMetrics(orders))
      setLastUpdated(new Date())
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const timelineOpts = {
    chart: { type: 'line', background: 'transparent', toolbar: { show: false }, animations: { enabled: false } },
    stroke: { curve: 'smooth', width: [3, 2, 2, 2, 2] },
    xaxis: {
      categories: timeline.map(d => d.day.slice(5)),
      labels: { style: { colors: COLORS.muted, fontSize: '11px' } },
      axisBorder: { color: COLORS.border },
      axisTicks: { color: COLORS.border }
    },
    yaxis: [
      { labels: { style: { colors: COLORS.muted }, formatter: v => fmt(v) } },
      { opposite: true, min: 0, max: 100, labels: { style: { colors: COLORS.muted }, formatter: v => v + '%' } }
    ],
    colors: [COLORS.blue, COLORS.green, COLORS.orange, COLORS.red, COLORS.purple],
    legend: { labels: { colors: COLORS.text }, fontSize: '12px' },
    grid: { borderColor: COLORS.border },
    tooltip: { theme: 'dark' }
  }

  const timelineSeries = [
    { name: 'Total Orders', type: 'line', data: timeline.map(d => d.total) },
    { name: 'Confirmed', type: 'line', data: timeline.map(d => d.confirmed) },
    { name: 'Dispatched', type: 'line', data: timeline.map(d => d.dispatched) },
    { name: 'Confirmation Rate %', type: 'line', data: timeline.map(d => d.confirmationRate) },
    { name: 'Delivery Rate %', type: 'line', data: timeline.map(d => d.deliveryRate) },
  ]

  const hourlyOpts = {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: '60%', borderRadius: 3 } },
    xaxis: {
      categories: hourly.map(h => h.hour),
      labels: { style: { colors: COLORS.muted, fontSize: '10px' }, rotate: -45 }
    },
    yaxis: { labels: { style: { colors: COLORS.muted } } },
    colors: [COLORS.blue, COLORS.orange],
    legend: { labels: { colors: COLORS.text } },
    grid: { borderColor: COLORS.border },
    tooltip: { theme: 'dark' }
  }

  const hourlySeries = [
    { name: 'Today', data: hourly.map(h => h.today) },
    { name: 'Yesterday', data: hourly.map(h => h.yesterday) }
  ]

  const dailyCols = [
    { key: 'day', label: 'Date' },
    { key: 'total', label: 'Orders', align: 'right', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', align: 'right', render: v => fmt(v) },
    { key: 'confirmationRate', label: 'CR%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'dispatchRate', label: 'Dispatch%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'netDeliveryRate', label: 'Net Del%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg Price', align: 'right', render: v => `${fmt(Math.round(v))} SAR` },
    { key: 'confirmedCod', label: 'Confirmed COD', align: 'right', render: v => fmtSAR(v) },
    { key: 'dispatchedCod', label: 'Dispatched COD', align: 'right', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'Delivered COD', align: 'right', render: v => fmtSAR(v) },
  ]

  const merchantCols = [
    { key: 'merchantId', label: 'Merchant ID' },
    { key: 'total', label: 'Orders', align: 'right', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', align: 'right', render: v => fmt(v) },
    { key: 'confirmationRate', label: 'CR%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'dispatchRate', label: 'Dispatch%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'netDeliveryRate', label: 'Net Del%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg Price', align: 'right', render: v => `${fmt(Math.round(v))} SAR` },
    { key: 'confirmedCod', label: 'Confirmed COD', align: 'right', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'Delivered COD', align: 'right', render: v => fmtSAR(v) },
  ]

  const skuCols = [
    { key: 'sku', label: 'SKU' },
    { key: 'productName', label: 'Product', render: v => <span title={v}>{v?.slice(0, 40)}{v?.length > 40 ? '…' : ''}</span> },
    { key: 'total', label: 'Orders', align: 'right', render: v => fmt(v) },
    { key: 'confirmed', label: 'Confirmed', align: 'right', render: v => fmt(v) },
    { key: 'confirmationRate', label: 'CR%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'deliveryRate', label: 'Delivery%', align: 'right', render: v => <RateBadge value={v} /> },
    { key: 'avgSellingPrice', label: 'Avg Price', align: 'right', render: v => `${fmt(Math.round(v))} SAR` },
    { key: 'confirmedCod', label: 'Confirmed COD', align: 'right', render: v => fmtSAR(v) },
    { key: 'deliveredCod', label: 'Delivered COD', align: 'right', render: v => fmtSAR(v) },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: 14
    }}>
      {/* Header */}
      <div style={{
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
          NML & Sllr · Performance Dashboard
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ color: COLORS.muted, fontSize: 12 }}>
              Updated {format(lastUpdated, 'HH:mm')}
            </span>
          )}
          <button onClick={load} disabled={loading} style={{
            background: COLORS.blue,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500
          }}>
            {loading ? '...' : 'Refresh'}
          </button>
          <button onClick={handleLogout} style={{
            background: 'transparent',
            color: COLORS.muted,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer'
          }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1600, margin: '0 auto' }}>

        {/* Date Filter */}
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <span style={{ color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Date Range
          </span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '6px 10px', color: COLORS.text, fontSize: 13 }} />
          <span style={{ color: COLORS.muted }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '6px 10px', color: COLORS.text, fontSize: 13 }} />
          {[7, 14, 30, 60].map(days => (
            <button key={days} onClick={() => {
              setDateFrom(format(subDays(new Date(), days), 'yyyy-MM-dd'))
              setDateTo(format(new Date(), 'yyyy-MM-dd'))
            }} style={{
              background: COLORS.bg, color: COLORS.muted, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer'
            }}>
              Last {days}d
            </button>
          ))}
        </div>

        {/* KPI Cards */}
        {summary && (
          <Section title="Summary">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <KpiCard label="Total Orders" value={fmt(summary.total)} />
              <KpiCard label="Confirmed" value={fmt(summary.confirmed)} color={COLORS.green} />
              <KpiCard label="Dispatched" value={fmt(summary.dispatched)} color={COLORS.blue} />
              <KpiCard label="Delivered" value={fmt(summary.delivered)} color={COLORS.purple} />
              <KpiCard label="Confirmation Rate" value={fmtRate(summary.confirmationRate)} color={summary.confirmationRate >= 70 ? COLORS.green : COLORS.orange} />
              <KpiCard label="Delivery Rate" value={fmtRate(summary.deliveryRate)} color={summary.deliveryRate >= 70 ? COLORS.green : COLORS.orange} />
              <KpiCard label="Dispatch Rate" value={fmtRate(summary.dispatchRate)} color={summary.dispatchRate >= 70 ? COLORS.green : COLORS.orange} />
              <KpiCard label="Total COD" value={fmtSAR(summary.totalCod)} />
              <KpiCard label="Confirmed COD" value={fmtSAR(summary.confirmedCod)} color={COLORS.green} />
              <KpiCard label="Delivered COD" value={fmtSAR(summary.deliveredCod)} color={COLORS.purple} />
            </div>
          </Section>
        )}

        {/* Panel 1: Daily Timeline */}
        <Section title="Daily Orders Performance">
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 16px' }}>
            {loading ? (
              <div style={{ color: COLORS.muted, textAlign: 'center', padding: 40 }}>Loading chart...</div>
            ) : (
              <ReactApexChart options={timelineOpts} series={timelineSeries} height={300} />
            )}
          </div>
        </Section>

        {/* Panel 2: Today vs Yesterday */}
        <Section title="Today vs Yesterday — Hourly Orders">
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 16px' }}>
            {loading ? (
              <div style={{ color: COLORS.muted, textAlign: 'center', padding: 40 }}>Loading chart...</div>
            ) : (
              <ReactApexChart options={hourlyOpts} series={hourlySeries} type="bar" height={280} />
            )}
          </div>
        </Section>

        {/* Panel 3: Daily Performance Table */}
        <Section title="Daily Performance Table">
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <DataTable
              columns={dailyCols}
              rows={[...timeline].reverse()}
              loading={loading}
            />
          </div>
        </Section>

        {/* Panel 4: Merchant Performance */}
        <Section title="Merchant Performance">
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <DataTable columns={merchantCols} rows={merchants} loading={loading} />
          </div>
        </Section>

        {/* Panel 5: SKU Performance */}
        <Section title="Product SKU Performance">
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <DataTable columns={skuCols} rows={skus} loading={loading} />
          </div>
        </Section>

      </div>
    </div>
  )
}
