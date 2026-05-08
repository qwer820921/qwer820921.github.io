const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  // isVercel 時不做 static export
  ...(isVercel ? {} : { output: "export" }),
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // isVercel 時不需要 assetPrefix
  assetPrefix: isVercel ? undefined : "https://qwer820921.github.io/",
};

export default nextConfig;
