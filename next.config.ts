import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 사이드바 하단의 테마 토글과 겹치지 않도록
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
