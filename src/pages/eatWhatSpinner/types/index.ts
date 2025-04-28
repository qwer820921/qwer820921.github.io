export type Food = {
  id: number;
  name: string;
  address?: string;
  coordinates?: { lat: number; lng: number }; // 新增座標參數
  distance?: number | string;
};
