export interface RouteConfig {
  path: string; // 路由路徑
  name: string; // 中文名稱
  component: React.FC; // 對應的 React 組件
  exact?: boolean; // 是否需要精確匹配
  protected?: boolean; // 是否受權限控制
  icon?: React.ReactNode; // 可選的圖示
  showInNavbar?: boolean; // 是否顯示在導航列
}
