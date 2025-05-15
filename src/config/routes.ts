import { RouteConfig } from "../types/routeConfig"; // 引入 RouteConfig 接口
import { ROUTES } from "../constants/routes"; // 引入常數

// 設置路由配置
const routes: RouteConfig[] = [
  { path: ROUTES.HOME, name: "首頁", showInNavbar: true },
  { path: ROUTES.ABOUT, name: "關於我們", showInNavbar: true },
  { path: ROUTES.ANIMATOR, name: "微動畫", showInNavbar: true },
  { path: ROUTES.EATWHAT, name: "吃甚麼", showInNavbar: true },
  { path: ROUTES.STOCK_INFO, name: "台股資訊", showInNavbar: true },
  { path: ROUTES.CRYPTO, name: "加密貨幣", showInNavbar: true },
  {
    path: ROUTES.PROTECTED,
    name: "受保護頁面",
    showInNavbar: true,
    protected: true, // 這是一個受權限控制的頁面
  },
];

export default routes;
