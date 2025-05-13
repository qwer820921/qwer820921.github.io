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
  description = "子yee 萬事屋提供專業技術解決方案與服務，優化您的商業流程，提升效率，立即探索！",
  keywords = "子yee 萬事屋, 技術解決方案, 專業服務, 商業流程優化, 效率提升",
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
