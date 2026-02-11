"use client";

import Link from "next/link";
import { ROUTES } from "@/constants/routes";

export default function BackToListButton() {
  return (
    <div className="mb-4">
      <Link 
        href={ROUTES.BLOG}
        className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
      >
        <span>←</span>
        回到文章列表
      </Link>
    </div>
  );
}
