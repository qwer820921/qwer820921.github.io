const isVercel = process.env.VERCEL === "1";
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  // isVercel 時不做 static export
  ...(isVercel ? {} : { output: "export" }),
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // isVercel 或本機開發時不需要 assetPrefix（Next.js 16 Turbopack 在 dev mode 下會嚴格套用 assetPrefix 導致 CSS 載入失敗）
  assetPrefix: isVercel || isDev ? undefined : "https://qwer820921.github.io/",
};

export default nextConfig;
