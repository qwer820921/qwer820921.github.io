import { Project } from "../types/project";

// 專案進度資料
const projectProgressData: Project[] = [
  {
    id: 1,
    name: "網站設計",
    status: "進行中",
    dueDate: "2025/03/30",
    description: "我們正在開發一個全新設計的企業網站，旨在提升品牌形象。",
    projectManager: "張經理",
    budget: 50000,
    progress: 60, // 進度 60%
  },
  {
    id: 2,
    name: "行銷策劃",
    status: "等待中",
    dueDate: "2025/05/15",
    description: "行銷策略的計劃階段，將聚焦於社交媒體廣告與內容營銷。",
    projectManager: "李經理",
    budget: 30000,
    progress: 0, // 尚未開始
  },
  {
    id: 3,
    name: "品牌設計",
    status: "延遲",
    dueDate: "2025/06/10",
    description: "品牌重新設計，包含新的標誌和企業識別系統。",
    projectManager: "連設計師",
    budget: 70000,
    progress: 30, // 進度 30%
  },
  {
    id: 4,
    name: "軟體開發",
    status: "準備中",
    dueDate: "2025/04/25",
    description: "開發一個定制的企業資源規劃 (ERP) 系統，提升內部運營效率。",
    projectManager: "連工程師",
    budget: 120000,
    progress: 10, // 進度 10%
  },
];

export default projectProgressData;
