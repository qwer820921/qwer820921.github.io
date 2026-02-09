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
  [ROUTES.INSTA_STORY_EDITOR]: {
    title: "子yee 萬事屋 | 限時動態編輯器",
    description:
      "創建精美的限時動態，添加文字、貼圖、濾鏡等效果，讓您的故事更生動有趣。",
    keywords:
      "子yee 萬事屋, 限時動態, 動態編輯器, 故事創作, 社交媒體工具, 圖片編輯",
  },
  [ROUTES.NO_WASH_GAMES]: {
    title: "子yee 萬事屋 | 免洗遊戲 - 輕鬆玩樂小遊戲集",
    description: "精選多款免洗小遊戲，隨時隨地輕鬆玩樂，打發時間最佳選擇！",
    keywords: "子yee 萬事屋, 免洗遊戲, 小遊戲, 休閒遊戲, 線上遊戲, 打發時間",
  },
  [ROUTES.CLICK_ASCENSION]: {
    title: "Click Ascension | 點擊飛昇 - 萬事屋點擊遊戲",
    description:
      "Tap into the Void. 在 Click Ascension 中體驗從微小存在到掌控虛空的無限進化。萬事屋推出的全新深淵系點擊遊戲。",
    keywords:
      "Click Ascension, 點擊飛昇, 點擊遊戲, 點擊進化, 萬事屋, 飛昇, 點擊冒險, Clicker Game, Incremental",
  },
  [ROUTES.INVOICE]: {
    title: "子yee 萬事屋 | 統一發票對獎 - 快速查詢中獎號碼",
    description:
      "統一發票對獎工具，即時查詢最新中獎號碼，快速輸入末三碼對獎，支援多期歷史號碼查詢。",
    keywords:
      "統一發票, 發票對獎, 中獎號碼, 發票查詢, 統一發票中獎, 對獎工具, 子yee 萬事屋",
  },
};
