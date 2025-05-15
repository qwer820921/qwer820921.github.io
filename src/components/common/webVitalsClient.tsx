"use client";

import reportWebVitals from "@/reportWebVitals";
import { useEffect } from "react";

const WebVitalsClient = () => {
  useEffect(() => {
    reportWebVitals((metric) => {
      // 傳送至 Google Analytics 或 console
      console.log(metric);

      // 傳送到後端分析系統
      // fetch('/api/analytics', {
      //   method: 'POST',
      //   body: JSON.stringify(metric),
      // });
    });
  }, []);

  return null; // 不需要渲染內容
};

export default WebVitalsClient;
