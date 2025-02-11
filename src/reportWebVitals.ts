import { onCLS, onFCP, onLCP, onTTFB } from "web-vitals";

// 這個函數處理 Web Vitals 性能指標
const reportWebVitals = (
  onPerfEntry?: (metric: { name: string; value: number }) => void
) => {
  if (onPerfEntry) {
    onCLS(onPerfEntry); // 用於 CLS 性能指標
    onFCP(onPerfEntry); // 用於 FCP 性能指標
    onLCP(onPerfEntry); // 用於 LCP 性能指標
    onTTFB(onPerfEntry); // 用於 TTFB 性能指標
  }
};

export default reportWebVitals;
