/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: isProd ? "export" : undefined,
  reactStrictMode: true,
  assetPrefix: isProd ? "https://qwer820921.github.io/" : undefined,
};
export default nextConfig;
