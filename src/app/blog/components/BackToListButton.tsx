"use client";

import { ROUTES } from "@/constants/routes";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface BackToListButtonProps {
  mode?: "static" | "floating";
  targetId?: string; // ID of the static button to observe
  id?: string; // ID for this button (for static one)
}

export default function BackToListButton({ mode = "floating", targetId, id }: BackToListButtonProps) {
  const router = useRouter();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(mode === "static");
  
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  // Intersection Observer to toggle floating visibility
  useEffect(() => {
    if (mode === "static" || !targetId) {
        setIsVisible(mode === "static");
        return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // If static button is NOT intersecting (out of view), show floating button
        // If static button IS intersecting (in view), hide floating button
        setIsVisible(!entry.isIntersecting);
      },
      { threshold: 0 } // Trigger as soon as even 1px is out/in
    );

    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      observer.observe(targetElement);
    }

    return () => observer.disconnect();
  }, [mode, targetId]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode === "static") return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    startPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (mode === "static" || !isDragging || !dragStartRef.current) return;

    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (mode === "static") {
        router.push(ROUTES.BLOG);
        return;
    }

    setIsDragging(false);
    dragStartRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    if (startPosRef.current) {
        const moveX = Math.abs(e.clientX - startPosRef.current.x);
        const moveY = Math.abs(e.clientY - startPosRef.current.y);
        
        if (moveX < 5 && moveY < 5) {
            router.push(ROUTES.BLOG);
        }
    }
    startPosRef.current = null;
  };

  if (mode === "floating" && !isVisible) return null; // Or use opacity 0 for fade

  const containerStyle: React.CSSProperties = mode === "floating" ? {
    position: "fixed",
    zIndex: 1050,
    top: "12.7%",
    left: "12px", 
    transform: `translate(${position.x}px, calc(-10% + ${position.y}px))`,
    touchAction: "none",
    cursor: isDragging ? "grabbing" : "grab",
    opacity: isVisible ? 1 : 0,
    transition: isDragging ? "none" : "transform 0.3s ease, opacity 0.3s ease",
    pointerEvents: isVisible ? "auto" : "none"
  } : {
    display: "inline-flex", // changed from block to fit content
    marginBottom: "1rem",
    cursor: "pointer",
    position: "relative",
    zIndex: 1
  };

  return (
    <div
      id={id}
      style={containerStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(e) => {
        if (mode === "floating") {
          setIsDragging(false); 
          dragStartRef.current = null;
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }
      }}
    >
      <div 
        className="btn d-inline-flex align-items-center gap-2 shadow rounded-pill px-4 py-2 text-decoration-none"
        role="button"
        style={{ 
          // For static: allow events. For floating: disable on parent to let drag handle, but enable here for hover? 
          // Actually with new Logic we capture on parent. 
          // Let's use pointerEvents "none" on child so parent captures drag easily, but we lose hover...
          // Wait, if parent handles drag, child can have pointerEvents="none" but that kills hover.
          // Solution: child pointerEvents="auto". Parent pointerDown captures.
          pointerEvents: "auto", 
          backgroundColor: mode === "floating" ? "rgba(255, 255, 255, 0.9)" : "#fff", // Static gets solid white
          backdropFilter: mode === "floating" ? "blur(10px)" : "none",
          border: "1px solid rgba(0,0,0,0.08)",
          color: "#495057",
          fontWeight: 500,
          transition: "all 0.2s ease",
          cursor: "pointer"
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#fff";
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = "0 .5rem 1rem rgba(0,0,0,.15)";
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = mode === "floating" ? "rgba(255, 255, 255, 0.9)" : "#fff";
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 .125rem .25rem rgba(0,0,0,.075)"; 
        }}
      >
        <span>回到文章列表</span>
      </div>
    </div>
  );
}
