import { NextResponse } from 'next/server'
import { fetchOrderInfo } from '@/lib/order'

/**
 * 金额文本格式化（人民币）
 * @param amount 原始金额
 * @returns 文本化后的金额（如：¥12,345.67），空值返回"--"
 */
function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '--'
  const n = Number(amount)
  if (Number.isNaN(n)) return String(amount)
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * 取首个有效值
 * 作用：在多个候选值中返回第一个非空字符串或数值。
 * @param candidates 候选值列表
 * @returns 首个有效值，若全无则返回 "--"
 */
function pick<T = any>(...candidates: T[]): T | string {
  for (const v of candidates) {
    if (v !== null && v !== undefined && v !== ('' as any)) return v
  }
  return '--'
}

/**
 * 格式化请求时间（北京时间）
 * @returns 形如 yyyy/MM/dd HH:mm:ss 的中文时间
 */
function formatRequestTime(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

/**
 * 构建订单摘要（精简字段 + 文本化）
 * @param data 接口返回的订单数据主体（例如 data 字段）
 * @returns 摘要对象，便于前端或邮件使用
 */
function buildOrderSummary(data: any) {
  const skuRaw = data?.skuDetail
  const sku = typeof skuRaw === 'string' ? (() => { try { return JSON.parse(skuRaw) } catch { return {} } })() : (skuRaw || {})
  return {
    requestTime: formatRequestTime(),
    orderNo: pick(data?.orderNo, data?.orderSn),
    businessOrderNo: pick(data?.businessOrderNo, data?.businessOrderSn),
    orderDate: pick(data?.orderDate, data?.orderTime),
    payDate: pick(data?.payDate, data?.payTime),
    buyerName: pick(data?.buyerName, data?.realName),
    buyerTel: pick(data?.buyerTel, data?.mobile),
    buyerIdNo: pick(data?.buyerIdNo, data?.idNo),
    cityName: pick(`${data?.buyerProvinceName || ''} ${data?.buyerCityName || ''}`.trim(), data?.cityName),
    dealerName: pick(data?.dealerFullName, data?.dealerName, data?.storeName),
    vehicleModel: pick(data?.vehicleModel, data?.carSeriesName),
    vehicleVersion: pick(data?.vehicleVersion, data?.carTypeName),
    colorName: pick(`${data?.exteriorColor || '--'} / ${data?.interiorColor || '--'}`, data?.colorName),
    retailPrice: formatCurrency(pick(data?.retailPrice, data?.price)),
    vehicleVin: data?.vehicleVin ?? '--',
    configurationFullName: pick(sku?.configurationFullName, sku?.materialConfig?.fullName),
    configurationRetailPrice: formatCurrency(pick(sku?.configurationRetailPrice, sku?.materialConfig?.totalPrice)),
  }
}

/**
 * GET 接口：返回订单精简摘要 JSON
 * 数据来源为服务端请求的远程接口，便于前端消费与调试
 */
export async function GET() {
  try {
    const payload = await fetchOrderInfo()
    const data = (payload as any)?.data ?? payload
    const summary = buildOrderSummary(data)
    const hasVin = !!data?.vehicleVin
    return NextResponse.json({ hasVin, summary })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '请求失败' }, { status: 500 })
  }
}