import { RouteGroup } from "../types/routeConfig"; // 引入 RouteConfig 接口
import { ROUTES } from "../constants/routes"; // 引入常數

// 設置路由配置
const routes: RouteGroup[] = [
  {
    type: "常用",
    icon: "/images/icon/common_icon.webp",
    routeConfig: [
      { path: ROUTES.HOME, name: "首頁", showInNavbar: false },
      { path: ROUTES.ABOUT, name: "關於我們", showInNavbar: true },
      { path: ROUTES.BLOG, name: "部落格", showInNavbar: true },
      { path: ROUTES.NOVELS, name: "萬事屋藏書閣", showInNavbar: true },
    ],
  },
  {
    type: "遊戲",
    icon: "/images/icon/game_icon.webp",
    routeConfig: [
      { path: ROUTES.NO_WASH_GAMES, name: "免洗遊戲", showInNavbar: true },
      { path: ROUTES.CLICK_ASCENSION, name: "點擊飛昇", showInNavbar: true },
      { path: ROUTES.TOWER_DEFENSE, name: "塔防守衛戰", showInNavbar: true },
      { path: ROUTES.GAME2048, name: "2048 數位拼圖", showInNavbar: true },
      { path: ROUTES.WATER_COLOR_SORT, name: "水彩分類", showInNavbar: true },
      { path: ROUTES.SUDOKU, name: "數獨", showInNavbar: true },
      {
        path: ROUTES.BOBA_SURVIVORS,
        name: "重裝全糖珍奶",
        showInNavbar: true,
      },
    ],
  },
  {
    type: "工具",
    icon: "/images/icon/tools_icon.webp",
    routeConfig: [
      {
        path: ROUTES.INVOICE,
        name: "發票對獎",
        showInNavbar: true,
      },
      { path: ROUTES.ANIMATOR, name: "微動畫", showInNavbar: true },
      { path: ROUTES.BG_REMOVER, name: "AI 圖片去背", showInNavbar: true },
      { path: ROUTES.EATWHAT, name: "吃甚麼", showInNavbar: true },
      {
        path: ROUTES.INSTA_STORY_EDITOR,
        name: "限時動態編輯器",
        showInNavbar: true,
      },
      {
        path: ROUTES.IMAGE_CONVERTER,
        name: "圖檔轉檔",
        showInNavbar: true,
      },
      { path: ROUTES.JSON_FORMAT, name: "JSON格式化工具", showInNavbar: true },
      { path: ROUTES.TEN_MIN_EMAIL, name: "10分鐘信箱", showInNavbar: true },
      {
        path: ROUTES.QR_CODE_GENERATOR,
        name: "QRCode產生器",
        showInNavbar: true,
      },
    ],
  },
  {
    type: "投資",
    icon: "/images/icon/invest_icon.webp",
    routeConfig: [
      { path: ROUTES.STOCK_INFO, name: "台股資訊", showInNavbar: true },
      { path: ROUTES.CRYPTO, name: "加密貨幣", showInNavbar: true },
    ],
  },
  {
    type: "媒體",
    icon: "/images/icon/media_icon.webp",
    routeConfig: [
      {
        path: ROUTES.YT_MUSIC,
        name: "YouTube 播放器",
        showInNavbar: true,
        protected: true,
      },
      { path: ROUTES.YT_PLAYER, name: "YouTube 播放器_2", showInNavbar: true },
      {
        path: ROUTES.SOUNDCLOUD_PLAYER,
        name: "SoundCloud 播放器",
        showInNavbar: true,
      },
    ],
  },
  {
    type: "帳戶",
    routeConfig: [{ path: ROUTES.LOGIN, name: "登入", showInNavbar: false }],
  },
];

export default routes;
