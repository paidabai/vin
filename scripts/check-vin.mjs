/*
 * 功能说明：
 * 该脚本由 GitHub Actions 每小时自动运行一次，用于请求订单接口并根据返回数据发送邮件通知。
 * 通知规则：
 * 1) 当存在 VIN（车架号）时，立即向目标邮箱发送“VIN已生成”通知；
 * 2) 当不存在 VIN 时，每累计3次运行发送一次订单摘要到邮箱（基于运行次数或北京时间小时取模）。
 * 环境变量（通过 GitHub Secrets 提供）：
 * - ORDER_URL：订单数据接口地址（必填）
 * - ORDER_TOKEN：接口鉴权 token（可选）
 * - ORDER_BRAND_CODE：品牌码 header（可选）
 * - ORDER_API_KEY：接口 apikey（可选）
 * - ORDER_HEADERS_JSON：JSON 字符串的自定义请求头（可选）
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS：SMTP 服务配置（必填以发送邮件）
 * - MAIL_FROM：发件邮箱地址（必填以发送邮件）
 * - MAIL_TO：收件邮箱地址（默认为 1196270151@qq.com）
 */

import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

/*
 * 加载本地环境变量文件：.env.local
 * 说明：本地运行时会读取该文件；在 GitHub Actions 中将使用 Secrets 注入的环境变量。
 */
dotenv.config({ path: '.env.local' })

/**
 * 读取目标邮箱地址
 * @returns {string} 收件人邮箱
 */
function getMailTo() {
  return process.env.MAIL_TO || '1196270151@qq.com'
}

/**
 * 金额文本格式化（人民币）
 * @param {number|string|null|undefined} amount 原始金额
 * @returns {string} 文本化后的金额（如：¥12,345.67），空值返回"--"
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === '') return '--'
  const n = Number(amount)
  if (Number.isNaN(n)) return String(amount)
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * 构建订单摘要文本（精简字段 + 文本化）
 * @param {any} data 接口返回的订单数据主体（例如 data 字段）
 * @returns {string} 适合邮件正文的简要摘要文本
 */
function buildOrderSummaryText(data) {
  const line = (k, v) => `${k}: ${v ?? '--'}`
  const skuRaw = data?.skuDetail
  const skuObj = typeof skuRaw === 'string' ? safeJsonParse(skuRaw) || {} : (skuRaw || {})

  const parts = [
    line('请求时间', formatRequestTime()),    
    line('VIN', data?.vehicleVin),
    line('订单号', pick(data?.orderNo, data?.orderSn)),
    line('商业订单号', pick(data?.businessOrderNo, data?.businessOrderSn)),
    line('下单时间', pick(data?.orderDate, data?.orderTime)),
    line('支付时间', pick(data?.payDate, data?.payTime)),
    line('姓名', pick(data?.buyerName, data?.realName)),
    line('手机号', pick(data?.buyerTel, data?.mobile)),
    line('证件号', pick(data?.buyerIdNo, data?.idNo)),
    line('所在城市', pick(`${data?.buyerProvinceName || ''} ${data?.buyerCityName || ''}`.trim(), data?.cityName)),
    line('购车门店', pick(data?.dealerFullName, data?.dealerName, data?.storeName)),
    line('车型', pick(data?.vehicleModel, data?.carSeriesName)),
    line('版本/车款', pick(data?.vehicleVersion, data?.carTypeName)),
    line('颜色', pick(`${data?.exteriorColor || '--'} / ${data?.interiorColor || '--'}`, data?.colorName)),
    line('统一零售价', formatCurrency(pick(data?.retailPrice, data?.price))),

  ]

  // 根据需求移除活动信息，不再追加到邮件正文
  return parts.join('\n')
}

/**
 * 拉取订单数据（使用 Secrets 中的 ORDER_URL 与可选鉴权头）
 * @returns {Promise<any>} 返回解析后的 JSON 对象
 */
async function fetchOrderJson() {
  const url = process.env.ORDER_URL
  if (!url) {
    throw new Error('缺少环境变量 ORDER_URL，无法请求订单数据')
  }
  const headers = {
    'content-type': 'application/json',
  }
  if (process.env.ORDER_TOKEN) headers['token'] = process.env.ORDER_TOKEN
  if (process.env.ORDER_BRAND_CODE) headers['brandCode'] = process.env.ORDER_BRAND_CODE
  if (process.env.ORDER_API_KEY) headers['apikey'] = process.env.ORDER_API_KEY
  // 合并环境变量中的自定义头（例如 Origin、Referer、X-Requested-With 等）
  try {
    const extra = process.env.ORDER_HEADERS_JSON ? JSON.parse(process.env.ORDER_HEADERS_JSON) : null
    if (extra && typeof extra === 'object') Object.assign(headers, extra)
  } catch (e) {
    console.warn('[提示] ORDER_HEADERS_JSON 解析失败，将忽略该配置。')
  }
  // 可根据实际接口需要增加其它头，例如 api-version 等

  const res = await fetch(url, { method: 'GET', headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`接口请求失败 ${res.status}: ${text}`)
  }
  const json = await res.json().catch(() => null)
  if (!json) throw new Error('返回非JSON或解析失败')
  return json
}

/**
 * 创建 SMTP 邮件发送器
 * @returns {import('nodemailer').Transporter|null} 当配置不完整时返回 null
 */
function createTransporter() {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !port || !user || !pass) return null
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 常用 SSL 端口
    auth: { user, pass },
  })
}

/**
 * 发送邮件通知
 * @param {string} subject 邮件主题
 * @param {string} text 文本正文
 * @param {string=} html 可选的HTML正文
 * @returns {Promise<void>} 无返回值，失败时抛出异常
 */
async function sendEmail(subject, text, html) {
  const transporter = createTransporter()
  const from = process.env.MAIL_FROM
  const to = getMailTo()
  if (!transporter || !from) {
    console.log('[提示] SMTP/发件人未配置，跳过发送邮件。')
    return
  }
  await transporter.sendMail({ from, to, subject, text, html })
}

/**
 * 计算是否需要发送“无 VIN 摘要”邮件（三次运行一个周期）
 * 规则说明：
 * - 若存在 GitHub 运行序号（GITHUB_RUN_NUMBER），则使用 run number 对 3 取模为 0 时发送；
 * - 若不存在（本地运行），则使用北京时间的小时（0-23）对 3 取模为 0 时发送；
 * 这样可以在不持久化状态的前提下，达到“每请求3次后发送一次”的效果。
 * @returns {boolean} 是否应发送摘要邮件
 */
function shouldSendSummaryByCycle() {
  const runStr = process.env.GITHUB_RUN_NUMBER
  const runNum = runStr ? Number(runStr) : NaN
  if (!Number.isNaN(runNum) && runNum > 0) {
    return runNum % 3 === 0
  }
  const hour = getBeijingHour()
  return hour % 3 === 0
}

/**
 * 获取北京时间的整点小时（0-23）
 * @returns {number} 北京时间的小时数
 */
function getBeijingHour() {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
  const hourStr = fmt.format(now)
  return Number(hourStr)
}

/**
 * 主流程：请求订单数据并根据 VIN 规则发送通知
 * 规则：有 VIN 则立即发 VIN 通知；无 VIN 时每3次运行发一次摘要
 * @returns {Promise<void>} 无返回值
 */
async function main() {
  const payload = await fetchOrderJson()
  const data = payload?.data || payload

  const vin = data?.vehicleVin
  const summaryText = buildOrderSummaryText(data)

  if (vin) {
    const subject = `VIN生成通知：${vin}`
    await sendEmail(subject, summaryText)
    console.log('[通知] 已发送 VIN 生成邮件。')
    return
  }

  // 无 VIN：仅在每3次运行时发送一次摘要（基于运行次数或北京时间小时取模）
  if (shouldSendSummaryByCycle()) {
    const subject = '订单进度提醒：暂未生成VIN'
    await sendEmail(subject, summaryText)
    console.log('[提醒] 已发送周期性订单摘要邮件（每第3次）。')
  } else {
    console.log('[提醒] 暂未生成VIN，本次不发送邮件（等待第3次）')
  }
}

// 执行入口
main().catch((err) => {
  console.error('[错误] 脚本执行失败：', err)
  process.exit(1)
})
/**
 * 安全 JSON 解析函数
 * 作用：将字符串安全解析为对象，失败返回 null。
 * 参数：text - 待解析的字符串。
 * 返回：解析后的对象或 null。
 */
function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * 取首个有效值
 * 作用：在多个候选值中返回第一个非空字符串或数值。
 * 参数：candidates - 候选值列表。
 * 返回：首个有效值，若全无则返回 "--"。
 */
function pick(...candidates) {
  for (const v of candidates) {
    if (v !== null && v !== undefined && v !== '') return v
  }
  return '--'
}

/**
 * 格式化请求时间（北京时间）
 * @returns {string} 形如 yyyy/MM/dd HH:mm:ss 的中文时间
 */
function formatRequestTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}