"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import dynamic from "next/dynamic";

// 使用 dynamic 導入 YtMusicPage 組件，禁用 SSR
const YtMusicPlayer = dynamic(() => import("./components/ytMusicPage"), {
  ssr: false,
});

export default function YtMusicPage() {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // 檢查用戶是否已登入
  useEffect(() => {
    if (isInitialized) {
      if (!isAuthenticated) {
        router.push("/logIn");
        return;
      }
      setIsLoading(false);
    }
  }, [isAuthenticated, isInitialized, router]);

  // 如果 AuthContext 尚未初始化或正在加載，顯示加載中
  if (!isInitialized || isLoading) {
    return <div>加載中...</div>;
  }

  return <YtMusicPlayer />;
}
