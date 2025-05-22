import { ROUTES } from "./routes";

export const seoMap: {
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
  [ROUTES.YT_PLAYER]: {
    title: "YouTube 音樂播放器",
    description:
      "線上播放與管理 YouTube 音樂清單，支援歌詞、播放隊列與自動切歌。",
    keywords: "YouTube, 音樂播放器, 歌詞, 播放清單, 網頁音樂",
  },
  [ROUTES.SOUNDCLOUD_PLAYER]: {
    title: "SoundCloud 播放器",
    description:
      "SoundCloud 音樂搜尋、播放清單管理與即時播放，支援多首歌曲自動切換。",
    keywords: "SoundCloud, 音樂播放器, 播放清單, 搜尋, 網頁音樂",
  },
  [ROUTES.LOGIN]: {
    title: "子yee 萬事屋 | 會員登入",
    description: "登入子yee 萬事屋會員帳號，享受更多個人化功能與服務。",
    keywords: "子yee 萬事屋, 會員登入, 帳號登入, 個人化服務",
  },
  [ROUTES.YT_MUSIC]: {
    title: "子yee 萬事屋 | YouTube 音樂",
    description:
      "登入後即可享受個人化的 YouTube 音樂體驗，建立並管理您的專屬播放清單。",
    keywords: "子yee 萬事屋, YouTube 音樂, 音樂播放, 個人化播放清單, 會員專屬",
  },
};
