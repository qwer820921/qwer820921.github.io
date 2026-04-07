// 圖片去背工具相關型別定義

export interface BackgroundRemovalProgress {
  status: string;
  progress: number;
}

export interface BackgroundRemovalConfig {
  publicPath?: string;
  debug?: boolean;
  onProgress?: (progress: BackgroundRemovalProgress) => void;
}
