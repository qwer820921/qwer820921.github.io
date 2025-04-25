import { RouteConfig } from "../types/routeConfig"; // 引入 RouteConfig 接口
import { ROUTES } from "../constants/routes"; // 引入常數
import HomePage from "../pages/home/homePage";
import AboutPage from "../pages/aboutPage";
import AnimatorPage from "../pages/animator/animatorPage";
import ProtectedPage from "../pages/protectedPage"; // 例如，受保護頁面
import EatWhatSpinner from "../pages/eatWhatSpinner/eatWhatSpinner";

// 設置路由配置
const routes: RouteConfig[] = [
  { path: ROUTES.HOME, name: "首頁", component: HomePage, showInNavbar: true },
  {
    path: ROUTES.ABOUT,
    name: "關於我們",
    component: AboutPage,
    showInNavbar: true,
  },
  {
    path: ROUTES.ANIMATOR,
    name: "微動畫",
    component: AnimatorPage,
    showInNavbar: true,
  },
  {
    path: ROUTES.EATWHAT,
    name: "吃甚麼",
    component: EatWhatSpinner,
    showInNavbar: true,
  },
  {
    path: ROUTES.PROTECTED,
    name: "受保護頁面",
    component: ProtectedPage,
    protected: true, // 這是一個受權限控制的頁面
    showInNavbar: true,
  },
];

export default routes;
