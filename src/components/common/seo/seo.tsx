import Head from "next/head";

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  image?: string;
}

const SEO: React.FC<SEOProps> = ({
  title,
  description = "子yee 萬事屋是一個提供台股即時查詢、自選股管理、生活小工具與技術解決方案的多功能平台，讓您在投資與生活中更高效。",
  keywords = "子yee 萬事屋, 台股查詢, 自選股, 技術小工具, 股票資訊平台, 技術顧問, 自動化工具",
  canonical = "https://qwer820921.github.io/",
  image = "https://qwer820921.github.io/logo512.png",
}) => {
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="zh_TW" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Head>
  );
};

export default SEO;
