export type Food = {
  id: number; // 食物 ID
  name: string; // 食物名稱
  address?: string; // 食物地址
  coordinates?: Coordinates; // 新增座標參數
  distance?: number | string; // 距離（可選）
  rating?: number; // 評分
  userRatingsTotal?: number; // 總評價數
};

export type Coordinates = {
  lat: number;
  lng: number;
};
