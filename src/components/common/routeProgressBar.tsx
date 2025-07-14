// components/RouteProgressBar.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function RouteProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pathname) return;

    setProgress(0);
    setVisible(true);

    const grow = setTimeout(() => setProgress(80), 100);
    const finish = setTimeout(() => setProgress(100), 600);
    const hide = setTimeout(() => setVisible(false), 900);

    return () => {
      clearTimeout(grow);
      clearTimeout(finish);
      clearTimeout(hide);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="w-100" style={{ height: "4px", zIndex: 9999 }}>
      <div
        className="progress"
        style={{ height: "100%", backgroundColor: "transparent" }}
      >
        <div
          className="progress-bar progress-bar-striped progress-bar-animated bg-success"
          role="progressbar"
          style={{ width: `${progress}%`, transition: "width 0.4s ease" }}
        />
      </div>
    </div>
  );
}
