import { supabase } from './supabase'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

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
    total,
    confirmed,
    cancelled,
    dispatched,
    delivered,
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

export async function fetchOrders(from, to) {
  let allData = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('confirmation_status, order_status, cod, created_at, merchant_id, sku, product_name')
      .gte('created_at', from)
      .lte('created_at', to)
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < pageSize) break
    page++
  }

  return allData
}

export async function fetchDailyTimeline(from, to) {
  const orders = await fetchOrders(from, to)
  const byDay = {}

  for (const o of orders) {
    const day = o.created_at?.slice(0, 10)
    if (!day) continue
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(o)
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayOrders]) => ({
      day,
      ...calcMetrics(dayOrders)
    }))
}

export async function fetchTodayVsYesterday() {
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const yesterdayStr = format(subDays(now, 1), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('created_at', yesterdayStr)
    .lte('created_at', todayStr + 'T23:59:59')

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
    todayConfirmed: calcMetrics(today[h] || []).confirmed,
    yesterdayConfirmed: calcMetrics(yesterday[h] || []).confirmed,
  }))
}

export async function fetchMerchantPerformance(from, to) {
  const orders = await fetchOrders(from, to)
  const byMerchant = {}

  for (const o of orders) {
    const mid = o.merchant_id || 'Unknown'
    if (!byMerchant[mid]) byMerchant[mid] = []
    byMerchant[mid].push(o)
  }

  return Object.entries(byMerchant)
    .map(([merchantId, merchantOrders]) => ({
      merchantId,
      ...calcMetrics(merchantOrders)
    }))
    .sort((a, b) => b.total - a.total)
}

export async function fetchSkuPerformance(from, to) {
  const orders = await fetchOrders(from, to)
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

export async function fetchMerchantSkuPerformance(from, to) {
  const orders = await fetchOrders(from, to)
  const byKey = {}

  for (const o of orders) {
    const mid = o.merchant_id || 'Unknown'
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
