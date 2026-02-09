import { RouteGroup } from "../types/routeConfig"; // 引入 RouteConfig 接口
import { ROUTES } from "../constants/routes"; // 引入常數

// 設置路由配置
const routes: RouteGroup[] = [
  {
    type: "常用",
    routeConfig: [
      { path: ROUTES.HOME, name: "首頁", showInNavbar: false },
      { path: ROUTES.ABOUT, name: "關於我們", showInNavbar: true },
    ],
  },
  {
    type: "工具",
    routeConfig: [
      {
        path: ROUTES.INVOICE,
        name: "發票對獎",
        showInNavbar: true,
      },
      { path: ROUTES.ANIMATOR, name: "微動畫", showInNavbar: true },
      { path: ROUTES.EATWHAT, name: "吃甚麼", showInNavbar: true },
      {
        path: ROUTES.INSTA_STORY_EDITOR,
        name: "限時動態編輯器",
        showInNavbar: true,
      },
    ],
  },
  {
    type: "投資",
    routeConfig: [
      { path: ROUTES.STOCK_INFO, name: "台股資訊", showInNavbar: true },
      { path: ROUTES.CRYPTO, name: "加密貨幣", showInNavbar: true },
    ],
  },
  {
    type: "媒體",
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
    type: "遊戲",
    routeConfig: [
      { path: ROUTES.NO_WASH_GAMES, name: "免洗遊戲", showInNavbar: true },
      { path: ROUTES.CLICK_ASCENSION, name: "點擊飛昇", showInNavbar: true },
    ],
  },
  {
    type: "帳戶",
    routeConfig: [{ path: ROUTES.LOGIN, name: "登入", showInNavbar: false }],
  },
];

export default routes;
