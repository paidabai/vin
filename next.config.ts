import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 图片域名配置
   * 作用：允许使用 Next Image 加载远程图片资源。
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oss-sales.risingauto.com",
      },
      {
        protocol: "https",
        hostname: "vmall.roewe.com.cn",
      },
    ],
  },
};

export default nextConfig;
