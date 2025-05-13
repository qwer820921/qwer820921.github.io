// SEO.tsx
import React from "react";
import { Helmet } from "react-helmet";

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string;
  canonical?: string;
}

const SEO: React.FC<SEOProps> = ({
  title,
  description = "子yee 萬事屋｜台股資訊、小工具與生活應用平台",
  keywords = "子yee 萬事屋提供台股即時資訊查詢、自選股功能、生活小工具與技術資源，打造實用的線上服務平台。",
  canonical = "https://qwer820921.github.io/",
}) => {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={canonical} />
      {/* 可選：添加其他元標籤，例如 robots */}
    </Helmet>
  );
};

export default SEO;
