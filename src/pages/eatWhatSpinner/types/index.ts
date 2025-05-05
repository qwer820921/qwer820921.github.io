export type Food = {
  id: number; // 食物 ID
  name: string; // 食物名稱
  address?: string; // 食物地址
  coordinates?: Coordinates; // 新增座標參數
  distance?: number | string; // 距離（可選）
  group: string; // 所屬分組
};

export type Coordinates = {
  lat: number;
  lng: number;
};
