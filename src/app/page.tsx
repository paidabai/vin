import Image from "next/image";
import { fetchOrderInfo, safeJsonParse, OrderResponse } from "@/lib/order";

/**
 * 判断是否为普通对象
 * 作用：区分数组、null 与普通对象，便于递归渲染。
 * 参数：val - 任意值。
 * 返回：布尔值，true 表示普通对象。
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * 格式化原始值
 * 作用：将原始的字符串、数字、布尔、空值转为适合展示的文本。
 * 参数：value - 原始值。
 * 返回：格式化后的字符串。
 */
function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * 金额格式化
 * 作用：将数字金额转为带货币符号的展示文本。
 * 参数：amount - 金额数值。
 * 返回：格式化后的金额字符串。
 */
function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "--";
  return `¥${amount}`;
}

/**
 * 请求时间格式化
 * 作用：以北京时间返回当前服务端请求时间。
 * 参数：无。
 * 返回：形如 yyyy/MM/dd HH:mm:ss 的中文时间字符串。
 */
function formatRequestTime(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

/**
 * 构建订单摘要字段
 * 作用：根据真实返回数据，挑选并文本化关键字段用于前端展示。
 * 参数：data - 订单数据对象。
 * 返回：包含 label 与 value 的键值对列表。
 */
function buildOrderSummary(data: NonNullable<OrderResponse["data"]>) {
  const provinceCity = [data.buyerProvinceName, data.buyerCityName]
    .filter(Boolean)
    .join(" ");

  const dealer = data.dealerFullName || data.dealerName || "--";

  const sku = safeJsonParse<{ materialConfig?: { fullName?: string; totalPrice?: number } }>(
    data.skuDetail ?? null
  );

  return [
    { label: "请求时间", value: formatRequestTime() },
    { label: "订单号", value: data.orderNo || "--" },
    { label: "商业订单号", value: data.businessOrderNo || "--" },
    { label: "下单时间", value: data.orderDate || "--" },
    { label: "支付时间", value: data.payDate || "--" },
    { label: "姓名", value: data.buyerName || "--" },
    { label: "手机号", value: data.buyerTel || "--" },
    { label: "证件号", value: data.buyerIdNo || "--" },
    { label: "所在城市", value: provinceCity || "--" },
    { label: "购车门店", value: dealer },
    { label: "车型", value: data.vehicleModel || "--" },
    { label: "版本/车款", value: data.vehicleVersion || "--" },
    {
      label: "颜色",
      value: `${data.exteriorColor ?? "--"} / ${data.interiorColor ?? "--"}`,
    },
    {
      label: "统一零售价",
      value: formatCurrency(data.retailPrice ?? data.price ?? null),
    },
    { label: "VIN", value: data.vehicleVin || "--" },
    {
      label: "配置全称",
      value: sku?.materialConfig?.fullName || "--",
    },
    {
      label: "配置零售价",
      value: formatCurrency(sku?.materialConfig?.totalPrice ?? null),
    },
  ];
}

/**
 * 通用键值渲染组件（递归）
 * 作用：以结构化方式完整展示对象/数组中的所有字段和值。
 * 参数：data - 任意对象或数组；title - 可选标题。
 * 返回：用于前端展示的节点结构。
 */
function RenderKV({ data, title }: { data: any; title?: string }) {
  if (typeof data === "string") {
    const parsed = safeJsonParse<any>(data);
    if (parsed !== null && (Array.isArray(parsed) || isPlainObject(parsed))) {
      return <RenderKV data={parsed} title={title} />;
    }
    return (
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/20">
        {title && (
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">{title}</p>
        )}
        <p className="text-sm text-zinc-800 dark:text-zinc-100">{data || "--"}</p>
      </div>
    );
  }

  if (Array.isArray(data)) {
    return (
      <div>
        {title && (
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">{title}</h3>
        )}
        <div className="space-y-3">
          {data.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-black/10 p-4 dark:border-white/20"
            >
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
                项 {idx + 1}
              </p>
              <RenderKV data={item} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isPlainObject(data)) {
    const entries = Object.entries(data);
    return (
      <div>
        {title && (
          <h3 className="text-lg font-semibold text-black dark:text-zinc-50">{title}</h3>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map(([key, value]) => {
            if (Array.isArray(value) || isPlainObject(value)) {
              return (
                <div key={key} className="sm:col-span-2">
                  <RenderKV data={value} title={key} />
                </div>
              );
            }
            return (
              <div
                key={key}
                className="rounded-lg border border-black/10 p-4 dark:border-white/20"
              >
                <p className="text-zinc-600 dark:text-zinc-300">{key}</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {formatPrimitive(value)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/20">
      {title && (
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">{title}</p>
      )}
      <p className="text-sm text-zinc-800 dark:text-zinc-100">{formatPrimitive(data)}</p>
    </div>
  );
}

/**
 * 首页组件
 * 作用：服务端拉取真实订单数据并在前端展示核心信息。
 * 返回：订单详情的可视化展示页面。
 */
export default async function Home() {
  let order: OrderResponse | null = null;
  let errorMsg: string | null = null;

  try {
    order = await fetchOrderInfo();
  } catch (err: unknown) {
    errorMsg = (err as Error)?.message || "请求失败";
  }

  const data = order?.data ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col gap-8 py-16 px-8 bg-white dark:bg-black">
        {/* 顶部品牌或车辆图片展示 */}
        <div className="flex w-full items-center justify-between">
          {data?.imgUrl ? (
            <Image
              src={data.imgUrl}
              alt="车辆图片"
              width={120}
              height={60}
              className="rounded-md object-cover"
            />
          ) : null}
        </div>

        {/* 错误显示 */}
        {errorMsg && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700">
            请求接口出错：{errorMsg}
          </div>
        )}

        {/* 订单摘要（文本化 + 精简字段） */}
        {data ? (
          <section className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">订单摘要</h1>
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {buildOrderSummary(data).map((item) => (
                <div key={item.label} className="rounded-lg border border-black/10 p-4 dark:border-white/20">
                  <p className="text-zinc-600 dark:text-zinc-300">{item.label}</p>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.value}</p>
                </div>
              ))}
            </div>

            {/* 根据需求移除活动信息展示 */}
          </section>
        ) : (
          <div className="rounded-md border border-black/10 p-6 text-zinc-700 dark:border-white/20 dark:text-zinc-300">暂无数据</div>
        )}

        {/* 精简需求下，移除完整字段递归展示 */}
      </main>
    </div>
  );
}
