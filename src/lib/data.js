import { supabase } from './supabase'
import { format, subDays } from 'date-fns'

const DISPATCHED_STATUSES = [
  'Pending Shipping company',
  'Delivery inprogress',
  'Delivered',
  'Returned',
  'Replaced',
  'Refunded'
]

export function calcMetrics(orders) {
  const total = orders.length
  let confirmed = 0, cancelled = 0, dispatched = 0, delivered = 0
  let totalCod = 0, confirmedCod = 0, dispatchedCod = 0, deliveredCod = 0

  for (const o of orders) {
    const cod = parseFloat(o.cod) || 0
    totalCod += cod
    if (o.confirmation_status === 'Confirmed') { confirmed++; confirmedCod += cod }
    if (o.confirmation_status === 'Cancelled') cancelled++
    if (DISPATCHED_STATUSES.includes(o.order_status)) { dispatched++; dispatchedCod += cod }
    if (o.order_status === 'Delivered') { delivered++; deliveredCod += cod }
  }

  return {
    total, confirmed, cancelled, dispatched, delivered,
    totalCod: Math.round(totalCod),
    confirmedCod: Math.round(confirmedCod),
    dispatchedCod: Math.round(dispatchedCod),
    deliveredCod: Math.round(deliveredCod),
    confirmationRate: total > 0 ? Math.round((confirmed / total) * 100 * 10) / 10 : 0,
    dispatchRate: confirmed > 0 ? Math.round((dispatched / confirmed) * 100 * 10) / 10 : 0,
    deliveryRate: confirmed > 0 ? Math.round((delivered / confirmed) * 100 * 10) / 10 : 0,
    netDeliveryRate: total > 0 ? Math.round((delivered / total) * 100 * 10) / 10 : 0,
    avgSellingPrice: total > 0 ? Math.round(totalCod / total * 10) / 10 : 0,
  }
}

// Fetch all raw orders for a date range — includes dispatch_datetime and cod
export async function fetchOrders(from, to, merchantId = null) {
  let allData = []
  let page = 0
  const pageSize = 1000

  while (true) {
    let query = supabase
      .from('orders')
      .select('confirmation_status, order_status, cod, created_at, merchant_id, sku, product_name, dispatch_datetime, vendor_cost_vat_inc, pcs')
      .gte('created_at', from)
      .lte('created_at', to)
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (merchantId) query = query.eq('merchant_id', merchantId)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    page++
  }

  return allData
}

// Apply all filters to raw orders
export function applyFilters(orders, filters) {
  const {
    merchants = [],
    products = [],
    minCod = null,
    maxCod = null,
    excludeLast10Days = false,
    dispatchFrom = null,
    dispatchTo = null,
  } = filters

  const cutoff10 = excludeLast10Days
    ? format(subDays(new Date(), 10), 'yyyy-MM-dd')
    : null

  return orders.filter(o => {
    // Merchant filter
    if (merchants.length > 0 && !merchants.includes(String(o.merchant_id))) return false

    // Product filter
    if (products.length > 0 && !products.includes(o.product_name)) return false

    // COD slider
    let cod = o.cod
    if (cod !== null && cod !== undefined && typeof cod === 'object') cod = cod.value || cod.text || 0
    const codVal = parseFloat(String(cod || 0).replace(/[^\d.]/g, '')) || 0
    if (minCod !== null && codVal < minCod) return false
    if (maxCod !== null && codVal > maxCod) return false

    // Exclude last 10 days
    if (cutoff10 && o.created_at?.slice(0, 10) >= cutoff10) return false

    // Dispatch date range
    if (dispatchFrom && o.dispatch_datetime) {
      if (o.dispatch_datetime.slice(0, 10) < dispatchFrom) return false
    }
    if (dispatchTo && o.dispatch_datetime) {
      if (o.dispatch_datetime.slice(0, 10) > dispatchTo) return false
    }

    return true
  })
}

// Compute daily timeline from filtered orders
export function computeDailyTimeline(orders) {
  const byDay = {}
  for (const o of orders) {
    const day = o.created_at?.slice(0, 10)
    if (!day) continue
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(o)
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayOrders]) => ({ day, ...calcMetrics(dayOrders) }))
}

// Compute merchant breakdown from filtered orders
export function computeMerchantPerformance(orders) {
  const byMerchant = {}
  for (const o of orders) {
    const mid = String(o.merchant_id || 'Unknown')
    if (!byMerchant[mid]) byMerchant[mid] = []
    byMerchant[mid].push(o)
  }
  return Object.entries(byMerchant)
    .map(([merchantId, merchantOrders]) => ({ merchantId, ...calcMetrics(merchantOrders) }))
    .sort((a, b) => b.total - a.total)
}

// Compute SKU breakdown from filtered orders
export function computeSkuPerformance(orders) {
  const bySku = {}
  for (const o of orders) {
    const sku = o.sku || 'Unknown'
    const name = o.product_name || 'Unknown'
    const key = `${sku}||${name}`
    if (!bySku[key]) bySku[key] = []
    bySku[key].push(o)
  }
  return Object.entries(bySku)
    .map(([key, skuOrders]) => {
      const [sku, productName] = key.split('||')
      return { sku, productName, ...calcMetrics(skuOrders) }
    })
    .sort((a, b) => b.total - a.total)
}

// Compute merchant × product matches from filtered orders
export function calcRoiMetrics(orders, adsSpent = 0) {
  const delivered = orders.filter(o => o.order_status === 'Delivered')

  const deliveredCount = delivered.length
  const collected = delivered.reduce((s, o) => s + (parseFloat(String(o.cod || 0).replace(/[^\d.]/g, '')) || 0), 0)
  const cogs = delivered.reduce((s, o) => {
    const cost = parseFloat(o.vendor_cost_vat_inc) || 0
    const pcs = parseFloat(o.pcs) || 1
    return s + cost * pcs
  }, 0)
  const operationCost = deliveredCount * 30
  const netProfit = collected - adsSpent - operationCost
  const roi = (cogs + adsSpent) > 0 ? (netProfit / (cogs + adsSpent)) * 100 : 0
  const dlvdAsp = deliveredCount > 0 ? collected / deliveredCount : 0

  return {
    deliveredCount,
    collected: Math.round(collected),
    cogs: Math.round(cogs),
    operationCost: Math.round(operationCost),
    adsSpent: Math.round(adsSpent),
    netProfit: Math.round(netProfit),
    roi: Math.round(roi * 10) / 10,
    dlvdAsp: Math.round(dlvdAsp * 10) / 10,
  }
}

export function computeRoiByProduct(orders, adsMap = {}) {
  const bySku = {}
  for (const o of orders) {
    const key = `${o.sku || 'Unknown'}||${o.product_name || 'Unknown'}`
    if (!bySku[key]) bySku[key] = []
    bySku[key].push(o)
  }
  return Object.entries(bySku).map(([key, skuOrders]) => {
    const [sku, productName] = key.split('||')
    const ads = adsMap[key] || 0
    return { sku, productName, ...calcRoiMetrics(skuOrders, ads) }
  }).sort((a, b) => b.collected - a.collected)
}

export function computeRoiByMerchant(orders, adsMap = {}) {
  const byMerchant = {}
  for (const o of orders) {
    const mid = String(o.merchant_id || 'Unknown')
    if (!byMerchant[mid]) byMerchant[mid] = []
    byMerchant[mid].push(o)
  }
  return Object.entries(byMerchant).map(([merchantId, merchantOrders]) => {
    const ads = adsMap[merchantId] || 0
    return { merchantId, ...calcRoiMetrics(merchantOrders, ads) }
  }).sort((a, b) => b.collected - a.collected)
}

export function computeMerchantSkuPerformance(orders) {
  const byKey = {}
  for (const o of orders) {
    const mid = String(o.merchant_id || 'Unknown')
    const sku = o.sku || 'Unknown'
    const name = o.product_name || 'Unknown'
    const key = `${mid}||${sku}||${name}`
    if (!byKey[key]) byKey[key] = []
    byKey[key].push(o)
  }
  return Object.entries(byKey)
    .map(([key, keyOrders]) => {
      const [merchantId, sku, productName] = key.split('||')
      return { merchantId, sku, productName, ...calcMetrics(keyOrders) }
    })
    .sort((a, b) => b.total - a.total)
}

// Fetch today vs yesterday hourly
export async function fetchTodayVsYesterday(merchantId = null) {
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const yesterdayStr = format(subDays(now, 1), 'yyyy-MM-dd')

  let query = supabase
    .from('orders')
    .select('confirmation_status, order_status, cod, created_at')
    .gte('created_at', yesterdayStr)
    .lte('created_at', todayStr + 'T23:59:59')

  if (merchantId) query = query.eq('merchant_id', merchantId)

  const { data, error } = await query
  if (error) throw error
  const orders = data || []

  const today = {}, yesterday = {}
  for (const o of orders) {
    const dt = new Date(o.created_at)
    const hour = dt.getHours()
    const day = o.created_at?.slice(0, 10)
    if (day === todayStr) {
      if (!today[hour]) today[hour] = []
      today[hour].push(o)
    } else if (day === yesterdayStr) {
      if (!yesterday[hour]) yesterday[hour] = []
      yesterday[hour].push(o)
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  return hours.map(h => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    today: (today[h] || []).length,
    yesterday: (yesterday[h] || []).length,
  }))
}
