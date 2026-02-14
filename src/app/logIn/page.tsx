"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { loginUser } from "../ytMusic/api/ytMusicApi";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError("");

    try {
      const res = await loginUser({
        action: "login",
        username,
        password,
      });

      if (res.success) {
        // 使用 AuthContext 的 login 方法更新全局狀態
        login(res.user_id, res.username);

        // 登入成功後導向 YT Music 頁面
        router.push("/ytMusic");
      } else {
        setError(res.message || "登入失敗，請確認帳號密碼");
      }
    } catch (err) {
      console.error("登入錯誤:", err);
      setError("登入失敗：伺服器錯誤");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="container"
      style={{ maxWidth: "400px", paddingTop: "120px" }}
    >
      <h2 className="mb-4 text-center">登入</h2>
      <form onSubmit={handleLogin}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label">
            帳號
          </label>
          <input
            type="text"
            className="form-control"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label htmlFor="password" className="form-label">
            密碼
          </label>
          <input
            type="password"
            className="form-control"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <button
          type="submit"
          className="btn btn-primary w-100"
          disabled={isLoading}
        >
          {isLoading ? "登入中..." : "登入"}
        </button>
      </form>
    </div>
  );
}
