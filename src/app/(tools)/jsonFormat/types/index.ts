// JSON 格式化工具的相關型別定義
// 目前狀態管理直接定義於 store 中即可，如有需要共用的型別再往這裡補充

export interface JsonNode {
  [key: string]: any;
}
