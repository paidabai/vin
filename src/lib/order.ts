/**
 * 订单接口响应类型（部分字段）
 * 作用：为从后端获取到的订单数据提供类型约束，便于前端使用。
 */
export interface OrderResponse {
  resultCode: number;
  success: boolean;
  errMsg: string | null;
  data: {
    orderId: number;
    orderNo: string;
    businessOrderNo: string;
    orderDate: string | null;
    payAmount: number | null;
    orderAmount: number | null;
    price: number | null;
    retailPrice: number | null;
    buyerName: string | null;
    buyerTel: string | null;
    buyerIdNo: string | null;
    dealerName: string | null;
    vehicleModel: string | null;
    vehicleVersion: string | null;
    vehicleVin: string | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    imgUrl: string | null;
    preSaleNoticeImage: string | null;
    skuDetail: string | null;
    activityList?: Array<{
      activityTitle: string;
      activityContent: string | null;
      activityType: number;
      discountAmount: number | null;
    }>;
  };
}

/**
 * 安全 JSON 解析函数
 * 作用：安全地将字符串解析为 JSON，失败时返回 null。
 * 参数：text - 待解析的字符串。
 * 返回：解析后的对象或 null。
 */
export function safeJsonParse<T = unknown>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * 获取订单信息（服务端请求）
 * 作用：在服务端发起真实 HTTP 请求，获取订单详情数据。
 * 注意：使用 no-store 禁用缓存，确保每次都是实时数据；不在客户端暴露 token。
 * 返回：订单响应数据对象。
 */
export async function fetchOrderInfo(): Promise<OrderResponse> {
  /**
   * 读取 .env.local 环境变量以配置请求地址与鉴权信息
   * 要求：在项目根目录创建 .env.local 并设置 ORDER_URL 等变量
   */
  const url = process.env.ORDER_URL;
  if (!url) {
    throw new Error("缺少环境变量 ORDER_URL，请在 .env.local 中配置订单接口地址");
  }

  /**
   * 组装请求头：仅在变量存在时附加，以避免泄露无效数据
   */
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 16; 2509FPN0BC Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36;MG;2.1.0",
  };
  if (process.env.ORDER_BRAND_CODE) headers["brandCode"] = process.env.ORDER_BRAND_CODE as string;
  if (process.env.ORDER_API_KEY) headers["apikey"] = process.env.ORDER_API_KEY as string;
  if (process.env.ORDER_TOKEN) headers["token"] = process.env.ORDER_TOKEN as string;

  /**
   * 额外自定义头：通过 ORDER_HEADERS_JSON 传入完整 JSON 字符串
   * 例如包含 Origin、Referer、X-Requested-With 等浏览器端常见头
   */
  const extraHeaders = safeJsonParse<Record<string, string>>(process.env.ORDER_HEADERS_JSON || null) || {}
  Object.assign(headers, extraHeaders)

  const res = await fetch(url, {
    method: "GET",
    headers,
    // 禁用缓存，确保真实请求
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`请求失败，状态码：${res.status}`);
  }

  const json = (await res.json()) as OrderResponse;
  return json;
}