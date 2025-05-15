import React from "react";
import { useLocation } from "react-router-dom";
import SEO from "./seo";
import { ROUTES } from "../../../constants/routes";

const seoMap: {
  [key: string]: { title: string; description: string; keywords?: string };
} = {
  [ROUTES.HOME]: {
    title: "子yee 萬事屋",
    description:
      "子yee 萬事屋是一個提供台股即時查詢、自選股管理、生活小工具與技術解決方案的多功能平台，讓您在投資與生活中更高效。",
    keywords:
      "子yee 萬事屋, 台股查詢, 自選股, 技術小工具, 股票資訊平台, 技術顧問, 自動化工具",
  },
  [ROUTES.ABOUT]: {
    title: "子yee 萬事屋 | 關於我們 - 我們的團隊與使命",
    description:
      "了解子yee 萬事屋的背景、團隊與使命，專注於提供技術解決方案與服務。",
    keywords: "子yee 萬事屋, 關於我們, 技術團隊, 使命, 技術解決方案",
  },
  [ROUTES.ANIMATOR]: {
    title: "子yee 萬事屋 | 微動畫 - 創意技術展示",
    description: "探索子yee 萬事屋的微動畫作品，展現創意技術與視覺效果。",
    keywords: "子yee 萬事屋, 微動畫, 創意技術, 視覺效果",
  },
  [ROUTES.EATWHAT]: {
    title: "子yee 萬事屋 | 吃甚麼 - 隨機美食建議",
    description:
      "子yee 萬事屋的吃甚麼工具，提供隨機美食建議，解決您的用餐選擇難題！",
    keywords: "子yee 萬事屋, 吃甚麼, 美食建議, 隨機選擇",
  },
  [ROUTES.STOCK_INFO]: {
    title: "子yee 萬事屋 | 台股資訊 - 即時股市數據",
    description: "子yee 萬事屋提供台股資訊與即時股市數據，幫助您掌握投資機會！",
    keywords: "子yee 萬事屋, 台股資訊, 股市數據, 投資機會",
  },
  [ROUTES.CRYPTO]: {
    title: "子yee 萬事屋 | 加密貨幣資訊 - 即時加密貨幣市場數據",
    description:
      "子yee 萬事屋提供最新的加密貨幣資訊與即時市場數據，幫助您掌握虛擬貨幣投資機會！",
    keywords:
      "子yee 萬事屋, 加密貨幣, 虛擬貨幣, 市場數據, 投資機會, 加密貨幣資訊",
  },
};

const AppSEO: React.FC = () => {
  const location = useLocation();
  const path = location.pathname;
  const seo = seoMap[path];

  if (!seo) return null;

  return (
    <SEO
      title={seo.title}
      description={seo.description}
      keywords={seo.keywords}
      canonical={`https://qwer820921.github.io${path}`}
    />
  );
};

export default AppSEO;
