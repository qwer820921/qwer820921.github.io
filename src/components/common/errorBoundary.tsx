import React, { Component, ErrorInfo, ReactNode } from "react";

// 定義 ErrorBoundary 的 Props 和 State 類型
interface ErrorBoundaryProps {
  children: ReactNode; // 包含子組件
}

interface ErrorBoundaryState {
  hasError: boolean; // 是否捕獲錯誤
  error: Error | null; // 錯誤對象
  errorInfo: ErrorInfo | null; // 錯誤信息
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // 捕獲錯誤並更新狀態
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  // 捕獲錯誤信息
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("Error occurred:", error, errorInfo);
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      // 顯示錯誤訊息
      return (
        <div>
          <h1>Something went wrong.</h1>
          <p>{error?.message}</p>
        </div>
      );
    }

    // 如果沒有錯誤，渲染子組件
    return this.props.children;
  }
}

export default ErrorBoundary;
