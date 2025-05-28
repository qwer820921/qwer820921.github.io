import { RouteConfig } from "../types/routeConfig"; // 引入 RouteConfig 接口
import { ROUTES } from "../constants/routes"; // 引入常數

// 設置路由配置
const routes: RouteConfig[] = [
  {
    path: ROUTES.HOME,
    name: "首頁",
    showInNavbar: true,
  },
  {
    path: ROUTES.ABOUT,
    name: "關於我們",
    showInNavbar: true,
  },
  {
    path: ROUTES.ANIMATOR,
    name: "微動畫",
    showInNavbar: true,
  },
  {
    path: ROUTES.EATWHAT,
    name: "吃甚麼",
    showInNavbar: true,
  },
  {
    path: ROUTES.STOCK_INFO,
    name: "台股資訊",
    showInNavbar: true,
  },
  {
    path: ROUTES.CRYPTO,
    name: "加密貨幣",
    showInNavbar: true,
    protected: false, //受保護的頁面
  },
  {
    path: ROUTES.YT_PLAYER,
    name: "音樂播放器",
    showInNavbar: true,
  },
  {
    path: ROUTES.SOUNDCLOUD_PLAYER,
    name: "SoundCloud 播放器",
    showInNavbar: true,
  },
  {
    path: ROUTES.LOGIN,
    name: "登入",
    showInNavbar: false, // 登入頁面通常不會顯示在導航欄
  },
  {
    path: ROUTES.YT_MUSIC,
    name: "YouTube 音樂",
    showInNavbar: true,
    protected: true, // 受保護的頁面
  },
  {
    path: ROUTES.INSTA_STORY_EDITOR,
    name: "限時動態編輯器",
    showInNavbar: true,
    protected: false, // 公開頁面
  },
];

export default routes;
