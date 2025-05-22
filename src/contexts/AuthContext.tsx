"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type AuthContextType = {
  isAuthenticated: boolean;
  isInitialized: boolean;
  userId: string | null;
  username: string | null;
  login: (userId: string, username: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    userId: null as string | null,
    username: null as string | null,
  });

  // 監聽 localStorage 變化並同步狀態
  useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== "undefined") {
        const userId = localStorage.getItem("user_id");
        const username = localStorage.getItem("username");

        if (userId && username) {
          setAuthState({
            isAuthenticated: true,
            userId,
            username,
          });
        } else {
          setAuthState({
            isAuthenticated: false,
            userId: null,
            username: null,
          });
        }
      }
    };

    // 初始檢查
    handleStorageChange();
    // 標記初始化完成
    setIsInitialized(true);

    // 監聽 storage 事件以處理跨標籤頁更新
    window.addEventListener("storage", handleStorageChange);

    // 清理函數
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const login = (userId: string, username: string) => {
    try {
      localStorage.setItem("user_id", userId);
      localStorage.setItem("username", username);
      setAuthState({
        isAuthenticated: true,
        userId,
        username,
      });
      // 觸發 storage 事件以同步其他標籤頁
      window.dispatchEvent(new Event("storage"));
    } catch (error) {
      console.error("登入時出錯:", error);
      throw error;
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem("user_id");
      localStorage.removeItem("username");
      setAuthState({
        isAuthenticated: false,
        userId: null,
        username: null,
      });
      // 觸發 storage 事件以同步其他標籤頁
      window.dispatchEvent(new Event("storage"));
    } catch (error) {
      console.error("登出時出錯:", error);
      throw error;
    }
  };

  // 將所有值合併到 context value 中
  const value = {
    ...authState,
    isInitialized,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
