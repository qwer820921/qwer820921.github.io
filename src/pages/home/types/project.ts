export interface Project {
  id?: number; // 專案 ID
  name?: string; // 專案名稱
  status?: "進行中" | "等待中" | "延遲" | "準備中" | "完成"; // 專案狀態
  dueDate?: string; // 預計完成日期，使用字串格式 (例如 "YYYY/MM/DD")
  description?: string; // 專案描述
  projectManager?: string; // 負責人
  budget?: number; // 預算
  progress?: number; // 進度百分比
}
