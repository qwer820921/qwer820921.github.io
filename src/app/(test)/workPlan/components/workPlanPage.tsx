"use client";
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Spinner,
  Table,
  Alert,
  Button,
  Modal,
  Form,
} from "react-bootstrap";
import { gasCall } from "../../lineTest/services/gasClient";
import styles from "../styles/workPlan.module.css";
import PageWrapper from "@/components/common/PageWrapper";

interface OutlineModule {
  key: string;
  order: number;
  content: {
    title: string;
    rawText?: string;
    table?: any[];
    items?: string[];
    [key: string]: any;
  };
}

const WorkPlanPage: React.FC = () => {
  const [data, setData] = useState<OutlineModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 編輯相關狀態
  const [showEdit, setShowEdit] = useState(false);
  const [editingModule, setEditingModule] = useState<OutlineModule | null>(
    null
  );
  const [editJson, setEditJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);

  // 100% 按照用戶給定順序排列 (共 66 個細節節點)
  const INITIAL_DATA: OutlineModule[] = [
    {
      key: "main_category",
      order: 1,
      content: {
        title: "品牌官網＋LINE 自助預約平台",
        rawText: "核心規劃目標：建立一套能支撐商業營運的高穩定預約系統。",
      },
    },
    {
      key: "intro_text",
      order: 2,
      content: {
        title: "系統分析工項（SA / Frontend / Backend / QA）",
        rawText:
          "以下為以「中型商業 SaaS 預約平台」規模估算。工時以「人時（Hours）」為基準。不含：平面設計稿大量修改、客戶無限次需求變更、正式營運維護。",
      },
    },
    {
      key: "sa_perspective",
      order: 3,
      content: {
        title: "一、專案分析（主任 SA 角度）",
        rawText: "從技術底層到營運面的全盤考量。",
      },
    },
    {
      key: "project_nature_detail",
      order: 4,
      content: {
        title: "專案本質",
        rawText:
          "此專案並非單純官網，而是：品牌官網 + CMS + 會員系統 + LINE 身分整合 + 即時預約引擎 + 班表系統 + 通知系統 + 後台 ERP",
      },
    },
    {
      key: "saas_scale",
      order: 5,
      content: {
        title: "中型 SaaS 預約平台",
        rawText: "設計時需考量多門店、多人員、多療程的複雜組合邏輯。",
      },
    },
    {
      key: "core_difficulty_matrix",
      order: 6,
      content: {
        title: "系統核心難點",
        table: [
          { 核心模組: "即時預約演算法", 難度: "★★★★★" },
          { 核心模組: "班表規則", 難度: "★★★★★" },
          { 核心模組: "預約衝突避免", 難度: "★★★★★" },
          { 核心模組: "LINE 身分整合", 難度: "★★★★" },
          { 核心模組: "通知 Queue", 難度: "★★★★" },
          { 核心模組: "SEO SSR", 難度: "★★★" },
          { 核心模組: "後台 CMS", 難度: "★★" },
        ],
      },
    },
    {
      key: "tech_stack_suggest",
      order: 7,
      content: {
        title: "建議技術架構",
        table: [
          { 類型: "Frontend", 建議: "Next.js" },
          { 類型: "Backend", 建議: ".NET Core 8 Web API" },
          { 類型: "DB", 建議: "PostgreSQL" },
          { 類型: "Cache", 建議: "Redis" },
          { 類型: "Queue", 建議: "Hangfire" },
          { 類型: "Storage", 建議: "S3 Compatible" },
          { 類型: "Server", 建議: "Docker + Nginx" },
        ],
      },
    },
    {
      key: "wbs_excel_intro",
      order: 8,
      content: {
        title: "二、工項規劃（MD Excel 格式）",
        rawText: "以下為各階段詳細 WBS 清單。",
      },
    },
    {
      key: "wbs_sa_list",
      order: 9,
      content: {
        title: "1. 系統分析 / 規劃（SA）",
        table: [
          {
            項次: "SA-001",
            項目名稱: "需求訪談",
            說明: "客戶需求確認",
            "預估工時(H)": 16,
          },
          {
            項次: "SA-002",
            項目名稱: "流程規劃",
            說明: "預約流程 / LINE Flow",
            "預估工時(H)": 24,
          },
          {
            項次: "SA-003",
            項目名稱: "ER Model 設計",
            說明: "DB 關聯規劃",
            "預估工時(H)": 24,
          },
          {
            項次: "SA-004",
            項目名稱: "API 規格設計",
            說明: "RESTful API",
            "預估工時(H)": 32,
          },
          {
            項次: "SA-005",
            項目名稱: "權限模型規劃",
            說明: "Admin / 會員 / 美容師",
            "預估工時(H)": 16,
          },
          {
            項次: "SA-006",
            項目名稱: "預約規則分析",
            說明: "衝突 / Buffer / 跨店",
            "預估工時(H)": 32,
          },
          {
            項次: "SA-007",
            項目名稱: "SEO 規劃",
            說明: "sitemap / metadata",
            "預估工時(H)": 8,
          },
          {
            項次: "SA-008",
            項目名稱: "LINE 串接規劃",
            說明: "Login / Messaging API",
            "預估工時(H)": 12,
          },
          {
            項次: "SA-009",
            項目名稱: "系統架構設計",
            說明: "Server / Queue / Cache",
            "預估工時(H)": 16,
          },
          {
            項次: "SA-010",
            項目名稱: "資安規劃",
            說明: "JWT / CSRF / RateLimit",
            "預估工時(H)": 12,
          },
        ],
      },
    },
    {
      key: "wbs_fe_portal_list",
      order: 10,
      content: {
        title: "2. Frontend - 前台官網",
        table: [
          {
            項次: "FE-001",
            項目名稱: "Layout 共用框架",
            說明: "Header / Footer / RWD",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-002",
            項目名稱: "首頁",
            說明: "Hero / CTA / 見證",
            "預估工時(H)": 24,
          },
          {
            項次: "FE-003",
            項目名稱: "關於頁",
            說明: "品牌介紹",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-004",
            項目名稱: "TSD 技術頁",
            說明: "技術說明",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-005",
            項目名稱: "療程列表頁",
            說明: "Filter / SEO",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-006",
            項目名稱: "療程詳細頁",
            說明: "FAQ / CTA",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-007",
            項目名稱: "美容師列表頁",
            說明: "輪播 / 篩選",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-008",
            項目名稱: "美容師詳細頁",
            說明: "個人頁",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-009",
            項目名稱: "客戶見證頁",
            說明: "Before After",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-010",
            項目名稱: "品牌動態列表",
            說明: "News / SEO",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-011",
            項目名稱: "品牌動態詳細頁",
            說明: "文章頁",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-012",
            項目名稱: "FAQ 頁",
            說明: "Accordion",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-013",
            項目名稱: "據點頁",
            說明: "Google Map",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-014",
            項目名稱: "招商頁",
            說明: "Landing + Form",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-015",
            項目名稱: "LINE 引導頁",
            說明: "加好友頁",
            "預估工時(H)": 6,
          },
          {
            項次: "FE-016",
            項目名稱: "404 / 500 頁",
            說明: "系統頁",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-017",
            項目名稱: "隱私權政策頁",
            說明: "法規頁",
            "預估工時(H)": 4,
          },
          {
            項次: "FE-018",
            項目名稱: "預約須知頁",
            說明: "預約規範",
            "預估工時(H)": 4,
          },
        ],
      },
    },
    {
      key: "wbs_fe_member_list",
      order: 11,
      content: {
        title: "3. Frontend - 會員系統",
        table: [
          {
            項次: "FE-M-001",
            項目名稱: "註冊頁",
            說明: "Email Register",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-M-002",
            項目名稱: "登入頁",
            說明: "Login UI",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-M-003",
            項目名稱: "密碼重設頁",
            說明: "Reset Flow",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-M-004",
            項目名稱: "Email 驗證頁",
            說明: "Verify Result",
            "預估工時(H)": 6,
          },
          {
            項次: "FE-M-005",
            項目名稱: "LINE 綁定頁",
            說明: "LINE Login Flow",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-M-006",
            項目名稱: "會員中心首頁",
            說明: "Dashboard",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-M-007",
            項目名稱: "預約紀錄頁",
            說明: "Upcoming / History",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-M-008",
            項目名稱: "預約取消頁",
            說明: "Cancel Flow",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-M-009",
            項目名稱: "預約改期頁",
            說明: "Rebooking Flow",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-M-010",
            項目名稱: "個資編輯頁",
            說明: "Profile Edit",
            "預估工時(H)": 8,
          },
        ],
      },
    },
    {
      key: "wbs_fe_booking_list",
      order: 12,
      content: {
        title: "4. Frontend - 預約系統",
        table: [
          {
            項次: "FE-B-001",
            項目名稱: "Step UI",
            說明: "預約流程",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-B-002",
            項目名稱: "療程選擇",
            說明: "Service Select",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-B-003",
            項目名稱: "據點選擇",
            說明: "Branch Select",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-B-004",
            項目名稱: "美容師選擇",
            說明: "Therapist Select",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-B-005",
            項目名稱: "日期選擇",
            說明: "Calendar",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-B-006",
            項目名稱: "時段選擇",
            說明: "Available Slots",
            "預估工時(H)": 20,
          },
          {
            項次: "FE-B-007",
            項目名稱: "預約確認頁",
            說明: "Confirm",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-B-008",
            項目名稱: "預約成功頁",
            說明: "Success UI",
            "預估工時(H)": 6,
          },
          {
            項次: "FE-B-009",
            項目名稱: "預約失敗頁",
            說明: "Error UI",
            "預估工時(H)": 6,
          },
        ],
      },
    },
    {
      key: "wbs_fe_admin_list",
      order: 13,
      content: {
        title: "5. Frontend - 後台管理系統",
        table: [
          {
            項次: "FE-A-001",
            項目名稱: "Admin Layout",
            說明: "Sidebar / Auth",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-A-002",
            項目名稱: "Dashboard",
            說明: "KPI / 統計",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-A-003",
            項目名稱: "CMS 管理",
            說明: "CRUD",
            "預估工時(H)": 32,
          },
          {
            項次: "FE-A-004",
            項目名稱: "班表管理",
            說明: "Calendar UI",
            "預估工時(H)": 32,
          },
          {
            項次: "FE-A-005",
            項目名稱: "預約管理",
            說明: "Table / Filter",
            "預估工時(H)": 32,
          },
          {
            項次: "FE-A-006",
            項目名稱: "美容師管理",
            說明: "CRUD",
            "預估工時(H)": 20,
          },
          {
            項次: "FE-A-007",
            項目名稱: "會員管理",
            說明: "CRM UI",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-A-008",
            項目名稱: "招商管理",
            說明: "Inbox",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-A-009",
            項目名稱: "LINE 模板管理",
            說明: "Template UI",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-A-010",
            項目名稱: "SEO 設定頁",
            說明: "Meta / OG",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-A-011",
            項目名稱: "系統設定頁",
            說明: "Config",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-A-012",
            項目名稱: "操作 Log 頁",
            說明: "Audit Logs",
            "預估工時(H)": 12,
          },
        ],
      },
    },
    {
      key: "wbs_be_logic_list",
      order: 14,
      content: {
        title: "6. Backend - API / Business Logic",
        table: [
          {
            項次: "BE-001",
            項目名稱: "專案架構建立",
            說明: "Clean Architecture",
            "預估工時(H)": 16,
          },
          {
            項次: "BE-002",
            項目名稱: "JWT Auth",
            說明: "Token / Refresh",
            "預估工時(H)": 16,
          },
          {
            項次: "BE-003",
            項目名稱: "Email 驗證",
            說明: "Verify Mail",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-004",
            項目名稱: "Password Reset",
            說明: "Reset Flow",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-005",
            項目名稱: "LINE Login API",
            說明: "OAuth",
            "預估工時(H)": 20,
          },
          {
            項次: "BE-006",
            項目名稱: "LINE 綁定",
            說明: "userId Bind",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-007",
            項目名稱: "會員 API",
            說明: "CRUD",
            "預估工時(H)": 20,
          },
          {
            項次: "BE-008",
            項目名稱: "CMS API",
            說明: "CRUD API",
            "預估工時(H)": 40,
          },
          {
            項次: "BE-009",
            項目名稱: "療程 API",
            說明: "CRUD",
            "預估工時(H)": 16,
          },
          {
            項次: "BE-010",
            項目名稱: "美容師 API",
            說明: "CRUD",
            "預估工時(H)": 20,
          },
          {
            項次: "BE-011",
            項目名稱: "據點 API",
            說明: "CRUD",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-012",
            項目名稱: "FAQ API",
            說明: "CRUD",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-013",
            項目名稱: "班表 API",
            說明: "Schedule Logic",
            "預估工時(H)": 32,
          },
          {
            項次: "BE-014",
            項目名稱: "例外班表 API",
            說明: "Exception Rules",
            "預估工時(H)": 24,
          },
          {
            項次: "BE-015",
            項目名稱: "預約核心引擎",
            說明: "Slot Engine",
            "預估工時(H)": 64,
          },
          {
            項次: "BE-016",
            項目名稱: "預約衝突控制",
            說明: "Lock / Transaction",
            "預估工時(H)": 32,
          },
          {
            項次: "BE-017",
            項目名稱: "預約 CRUD API",
            說明: "Create / Update",
            "預估工時(H)": 24,
          },
          {
            項次: "BE-018",
            項目名稱: "預約取消規則",
            說明: "24H Rule",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-019",
            項目名稱: "預約改期邏輯",
            說明: "Reschedule",
            "預估工時(H)": 20,
          },
          {
            項次: "BE-020",
            項目名稱: "Notification Queue",
            說明: "Queue System",
            "預估工時(H)": 24,
          },
          {
            項次: "BE-021",
            項目名稱: "LINE 推播",
            說明: "Messaging API",
            "預估工時(H)": 24,
          },
          {
            項次: "BE-022",
            項目名稱: "Email 發送",
            說明: "SMTP",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-023",
            項目名稱: "SEO API",
            說明: "sitemap",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-024",
            項目名稱: "Upload API",
            說明: "圖片上傳",
            "預估工時(H)": 16,
          },
          {
            項次: "BE-025",
            項目名稱: "RBAC 權限",
            說明: "Role Permission",
            "預估工時(H)": 24,
          },
          {
            項次: "BE-026",
            項目名稱: "Audit Log",
            說明: "操作紀錄",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-027",
            項目名稱: "CSV 匯出",
            說明: "報表",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-028",
            項目名稱: "Rate Limit",
            說明: "防刷 API",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-029",
            項目名稱: "Exception Handling",
            說明: "Global Handler",
            "預估工時(H)": 8,
          },
        ],
      },
    },
    {
      key: "wbs_db_list",
      order: 15,
      content: {
        title: "7. Database 工項",
        table: [
          {
            項次: "DB-001",
            項目名稱: "Schema 設計",
            說明: "Table Design",
            "預估工時(H)": 24,
          },
          {
            項次: "DB-002",
            項目名稱: "Migration",
            說明: "EF Migration",
            "預估工時(H)": 12,
          },
          {
            項次: "DB-003",
            項目名稱: "Index 優化",
            說明: "Query Optimize",
            "預估工時(H)": 16,
          },
          {
            項次: "DB-004",
            項目名稱: "Constraint",
            說明: "FK / Unique",
            "預估工時(H)": 8,
          },
          {
            項次: "DB-005",
            項目名稱: "Seed Data",
            說明: "初始資料",
            "預估工時(H)": 8,
          },
          {
            項次: "DB-006",
            項目名稱: "Backup 策略",
            說明: "DB Backup",
            "預估工時(H)": 6,
          },
        ],
      },
    },
    {
      key: "wbs_devops_list",
      order: 16,
      content: {
        title: "8. DevOps 工項",
        table: [
          {
            項次: "DEV-001",
            項目名稱: "Docker 化",
            說明: "Dockerfile",
            "預估工時(H)": 12,
          },
          {
            項次: "DEV-002",
            項目名稱: "Nginx 設定",
            說明: "Reverse Proxy",
            "預估工時(H)": 8,
          },
          {
            項次: "DEV-003",
            項目名稱: "SSL 設定",
            說明: "HTTPS",
            "預估工時(H)": 4,
          },
          {
            項次: "DEV-004",
            項目名稱: "CI/CD",
            說明: "GitHub Actions",
            "預估工時(H)": 16,
          },
          {
            項次: "DEV-005",
            項目名稱: "Monitoring",
            說明: "Health Check",
            "預估工時(H)": 8,
          },
          {
            項次: "DEV-006",
            項目名稱: "Log 系統",
            說明: "Error Log",
            "預估工時(H)": 8,
          },
          {
            項次: "DEV-007",
            項目名稱: "正式環境部署",
            說明: "Production",
            "預估工時(H)": 12,
          },
        ],
      },
    },
    {
      key: "wbs_qa_list",
      order: 17,
      content: {
        title: "9. QA 測試工項",
        table: [
          {
            項次: "QA-001",
            項目名稱: "官網功能測試",
            說明: "前台頁面",
            "預估工時(H)": 24,
          },
          {
            項次: "QA-002",
            項目名稱: "RWD 測試",
            說明: "手機平板",
            "預估工時(H)": 16,
          },
          {
            項次: "QA-003",
            項目名稱: "SEO 測試",
            說明: "Meta / OG",
            "預估工時(H)": 8,
          },
          {
            項次: "QA-004",
            項目名稱: "會員流程測試",
            說明: "Login / Register",
            "預估工時(H)": 16,
          },
          {
            項次: "QA-005",
            項目名稱: "預約流程測試",
            說明: "Booking Flow",
            "預估工時(H)": 40,
          },
          {
            項次: "QA-006",
            項目名稱: "衝突測試",
            說明: "Concurrent Booking",
            "預估工時(H)": 24,
          },
          {
            項次: "QA-007",
            項目名稱: "班表測試",
            說明: "Schedule Rules",
            "預估工時(H)": 24,
          },
          {
            項次: "QA-008",
            項目名稱: "LINE 測試",
            說明: "Push / OAuth",
            "預估工時(H)": 20,
          },
          {
            項次: "QA-009",
            項目名稱: "Email 測試",
            說明: "SMTP",
            "預估工時(H)": 8,
          },
          {
            項次: "QA-010",
            項目名稱: "權限測試",
            說明: "RBAC",
            "預估工時(H)": 16,
          },
          {
            項次: "QA-011",
            項目名稱: "資安測試",
            說明: "XSS / SQLi",
            "預估工時(H)": 16,
          },
          {
            項次: "QA-012",
            項目名稱: "壓力測試",
            說明: "Concurrent Users",
            "預估工時(H)": 16,
          },
          {
            項次: "QA-013",
            項目名稱: "API 測試",
            說明: "Postman",
            "預估工時(H)": 24,
          },
          {
            項次: "QA-014",
            項目名稱: "Bug Fix 驗證",
            說明: "Regression",
            "預估工時(H)": 32,
          },
        ],
      },
    },
    {
      key: "total_hours_breakdown",
      order: 18,
      content: {
        title: "三、總工時分析",
        table: [
          { 類型: "SA", 預估工時: "192 H" },
          { 類型: "Frontend", 預估工時: "494 H" },
          { 類型: "Backend", 預估工時: "580 H" },
          { 類型: "Database", 預估工時: "74 H" },
          { 類型: "DevOps", 預估工時: "68 H" },
          { 類型: "QA", 預估工時: "284 H" },
        ],
      },
    },
    {
      key: "total_sum",
      order: 19,
      content: {
        title: "四、總計",
        rawText: "總工時：約 1692 小時",
      },
    },
    {
      key: "manpower_estimation",
      order: 20,
      content: {
        title: "五、人力推估",
        table: [
          { 人力: "2 人 Full Stack", 工期: "5~8 個月" },
          { 人力: "3~4 人團隊", 工期: "3~5 個月" },
          { 人力: "軟體公司完整團隊", 工期: "2~4 個月" },
        ],
      },
    },
    {
      key: "market_price_2026",
      order: 21,
      content: {
        title: "六、合理接案價格（2026 台灣）",
        table: [
          { 類型: "Freelancer", 價格區間: "80~150 萬" },
          { 類型: "小型工作室", 價格區間: "150~300 萬" },
          { 類型: "軟體公司", 價格區間: "300~600 萬" },
        ],
      },
    },
    {
      key: "explosion_risks",
      order: 22,
      content: {
        title: "七、真正最容易爆工的地方",
        table: [
          { 模組: "預約引擎", 原因: "邏輯複雜" },
          { 模組: "班表系統", 原因: "例外規則很多" },
          { 模組: "LINE 整合", 原因: "OAuth 問題多" },
          { 模組: "QA", 原因: "Edge Case 超多" },
          { 模組: "後台 UX", 原因: "實際營運需求常變" },
        ],
      },
    },
    {
      key: "sa_advice_final",
      order: 23,
      content: {
        title: "八、主任 SA 建議",
        rawText: "這不是一個小案子，而是一個完整的 SaaS 營運平台。",
      },
    },
    {
      key: "phase_1_mvp",
      order: 24,
      content: {
        title: "Phase 1（MVP）",
        items: ["官網", "CMS", "基本會員", "基本預約", "LINE 通知"],
      },
    },
    {
      key: "phase_2_advance",
      order: 25,
      content: {
        title: "Phase 2",
        items: ["Queue", "Redis", "進階班表", "RBAC", "分析報表"],
      },
    },
    {
      key: "phase_3_full",
      order: 26,
      content: {
        title: "Phase 3",
        items: ["金流", "CRM", "點數", "問診表", "電子簽名"],
      },
    },
    {
      key: "notif_core_module",
      order: 27,
      content: {
        title: "營運核心功能之一",
        items: [
          "預約成功通知",
          "前一天提醒",
          "改期通知",
          "取消通知",
          "Email 備援",
        ],
      },
    },
    {
      key: "notif_system_reality",
      order: 28,
      content: {
        title: "你其實需要完整「排程通知系統」",
        rawText: "而不只是：呼叫 LINE API。這代表：你需要真正的背景排程機制。",
      },
    },
    {
      key: "missing_modules_list",
      order: 29,
      content: {
        title: "一、缺少的核心模組",
        rawText: "你目前少的是：自動化的任務排程器 (Scheduler)。",
      },
    },
    {
      key: "scheduler_notif_center",
      order: 30,
      content: {
        title: "Scheduler / Notification Center",
        rawText: "中心化的任務管理與通知派發中心。",
      },
    },
    {
      key: "real_need_features",
      order: 31,
      content: {
        title: "二、真正需要的功能",
        items: ["全自動 LINE 通知", "預約衝突熱點分析", "會員貢獻度儀表板"],
      },
    },
    {
      key: "booking_reminder_super",
      order: 32,
      content: {
        title: "1. 預約提醒排程（超重要）",
        rawText:
          "預約時間：2026-05-10 14:00，系統需要 2026-05-09 14:00 自動發 LINE 提醒。這不是單純 API。",
      },
    },
    {
      key: "scenario_intro",
      order: 33,
      content: {
        title: "情境",
        rawText: "多種營運異常情境下的系統穩定性測試。",
      },
    },
    {
      key: "background_job_scheduler_detail",
      order: 34,
      content: {
        title: "Background Job Scheduler",
        rawText: "建議使用：Hangfire 或 Quartz.NET。",
      },
    },
    {
      key: "real_architecture_need",
      order: 35,
      content: {
        title: "三、真正需要的架構",
        rawText:
          "User Booking ↓ Create Notification Queue ↓ Scheduler Background Job ↓ LINE API / Email ↓ Success / Retry / Dead Queue",
      },
    },
    {
      key: "sa_advice_text",
      order: 36,
      content: {
        title: "建議",
        rawText:
          "不要省。因為有沒有忘記通知、有沒有漏單、有沒有預約提醒，直接決定了營運品質。",
      },
    },
    {
      key: "missing_wbs_intro",
      order: 37,
      content: {
        title: "四、你缺少的完整工項",
        rawText: "下面這些其實都要補，才能稱為成熟的 SaaS 預約平台。",
      },
    },
    {
      key: "wbs_scheduler_be_list",
      order: 38,
      content: {
        title: "1. 排程系統 Backend 工項",
        table: [
          {
            項次: "BE-SCH-001",
            項目名稱: "排程系統架構",
            說明: "Scheduler 架構",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-SCH-002",
            項目名稱: "Job Queue",
            說明: "Queue 管理",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-SCH-003",
            項目名稱: "預約提醒排程",
            說明: "前一天提醒",
            "預估工時(H)": 16,
          },
          {
            項次: "BE-SCH-004",
            項目名稱: "當日提醒排程",
            說明: "當日通知",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-SCH-005",
            項目名稱: "改期通知排程",
            說明: "Reschedule",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-SCH-006",
            項目名稱: "取消通知排程",
            說明: "Cancel Notify",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-SCH-007",
            項目名稱: "Email 備援排程",
            說明: "SMTP Retry",
            "預估工時(H)": 8,
          },
          {
            項次: "BE-SCH-008",
            項目名稱: "Retry 機制",
            說明: "發送失敗重試",
            "預估工時(H)": 16,
          },
          {
            項次: "BE-SCH-009",
            項目名稱: "Dead Letter Queue",
            說明: "失敗 Queue",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-SCH-010",
            項目名稱: "Scheduler Log",
            說明: "Job Logs",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-SCH-011",
            項目名稱: "Queue 狀態監控",
            說明: "Monitoring",
            "預估工時(H)": 12,
          },
          {
            項次: "BE-SCH-012",
            項目名稱: "定時清理 Job",
            說明: "Cleanup",
            "預估工時(H)": 6,
          },
        ],
      },
    },
    {
      key: "wbs_notif_fe_list",
      order: 39,
      content: {
        title: "五、通知系統 Frontend 工項",
        table: [
          {
            項次: "FE-N-001",
            項目名稱: "通知模板列表",
            說明: "LINE / Email",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-N-002",
            項目名稱: "通知模板編輯",
            說明: "Rich Editor",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-N-003",
            項目名稱: "通知預覽",
            說明: "Preview",
            "預估工時(H)": 8,
          },
          {
            項次: "FE-N-004",
            項目名稱: "發送測試",
            說明: "Test Send",
            "預估工時(H)": 6,
          },
          {
            項次: "FE-N-005",
            項目名稱: "發送紀錄頁",
            說明: "Notification Logs",
            "預估工時(H)": 12,
          },
          {
            項次: "FE-N-006",
            項目名稱: "Queue 監控頁",
            說明: "Queue Status",
            "預估工時(H)": 16,
          },
          {
            項次: "FE-N-007",
            項目名稱: "發送失敗頁",
            說明: "Retry UI",
            "預估工時(H)": 8,
          },
        ],
      },
    },
    {
      key: "notif_admin_fe",
      order: 40,
      content: {
        title: "Admin 通知管理",
        rawText: "提供營運人員管理通知模板與監控發送狀態的界面。",
      },
    },
    {
      key: "missing_db_tables",
      order: 41,
      content: {
        title: "六、DB 少的資料表",
        rawText: "針對排程與通知模組需補足的 Schema。",
      },
    },
    {
      key: "db_notif_queue",
      order: 42,
      content: {
        title: "1. notification_queue",
        rawText: "待發送的通知隊列。",
      },
    },
    {
      key: "db_notif_usage",
      order: 43,
      content: {
        title: "用途",
        rawText: "確保通知發送的可靠性與非同步處理。",
      },
    },
    {
      key: "db_notif_fields",
      order: 44,
      content: {
        title: "欄位",
        table: [
          { 欄位: "id", 型別: "bigint" },
          { 欄位: "type", 型別: "varchar" },
          { 欄位: "target", 型別: "varchar" },
          { 欄位: "payload", 型別: "jsonb" },
          { 欄位: "status", 型別: "tinyint" },
          { 欄位: "retry_count", 型別: "int" },
          { 欄位: "scheduled_at", 型備: "datetime" },
          { 欄位: "sent_at", 型別: "datetime" },
        ],
      },
    },
    {
      key: "db_notif_logs",
      order: 45,
      content: {
        title: "2. notification_logs",
        rawText: "已發送或發送失敗的歷史紀錄。",
      },
    },
    {
      key: "db_notif_logs_usage",
      order: 46,
      content: {
        title: "用途",
        rawText: "供管理員查詢與對帳，確保每一筆通知都有跡可循。",
      },
    },
    {
      key: "db_scheduler_jobs",
      order: 47,
      content: {
        title: "3. scheduler_jobs",
        rawText: "系統所有的背景任務註冊表。",
      },
    },
    {
      key: "db_scheduler_usage",
      order: 48,
      content: {
        title: "用途",
        rawText: "記錄所有定時任務的狀態、最後執行時間與下次執行時間。",
      },
    },
    {
      key: "operational_problems",
      order: 49,
      content: {
        title: "七、真正營運後會發生的問題",
        rawText: "這就是為什麼架構不能省的原因。",
      },
    },
    {
      key: "queue_importance",
      order: 50,
      content: {
        title: "Queue 很重要",
        rawText: "解決 API Timeout、第三方服務不穩定與瞬間爆量問題。",
      },
    },
    {
      key: "scenario_1_detail",
      order: 51,
      content: {
        title: "情境 1",
        rawText:
          "LINE API 暫時掛掉。如果沒 Queue：通知直接消失。如果同步：發送失敗會導致預約 API 一起掛掉。",
      },
    },
    {
      key: "scenario_2_detail",
      order: 52,
      content: {
        title: "情境 2",
        rawText:
          "大量預約。例如：早上 9 點 500 個提醒一起發。如果同步：API timeout。如果沒控流：會被 LINE API 封鎖 (Rate Limit)。",
      },
    },
    {
      key: "queue_capabilities",
      order: 53,
      content: {
        title: "Queue 可以：",
        items: ["分批送", "Retry", "控流", "獨立於主程序執行"],
      },
    },
    {
      key: "mature_system_features",
      order: 54,
      content: {
        title: "八、真正成熟系統一定有",
        rawText: "從簡單的發送轉變為一個穩定的「通知服務」。",
      },
    },
    {
      key: "notif_service_text",
      order: 55,
      content: {
        title: "Notification Service",
        rawText: "這通常甚至是一組獨立的微服務，負責處理所有對外通訊。",
      },
    },
    {
      key: "qa_supplement_intro",
      order: 56,
      content: {
        title: "九、QA 也要補",
        rawText: "針對排程系統的各種極端案例測試。",
      },
    },
    {
      key: "wbs_scheduler_qa_list",
      order: 57,
      content: {
        title: "排程系統 QA",
        table: [
          {
            項次: "QA-SCH-001",
            項目名稱: "預約提醒測試",
            說明: "前一天通知",
            "預估工時(H)": 8,
          },
          {
            項次: "QA-SCH-002",
            項目名稱: "當日提醒測試",
            說明: "當日通知",
            "預估工時(H)": 8,
          },
          {
            項次: "QA-SCH-003",
            項目名稱: "Retry 測試",
            說明: "發送失敗",
            "預估工時(H)": 8,
          },
          {
            項次: "QA-SCH-004",
            項目名稱: "Queue 測試",
            說明: "Queue Flow",
            "預估工時(H)": 12,
          },
          {
            項次: "QA-SCH-005",
            項目名稱: "大量通知測試",
            說明: "Bulk Send",
            "預估工時(H)": 16,
          },
          {
            項次: "QA-SCH-006",
            項目名稱: "LINE API 異常測試",
            說明: "API Failure",
            "預估工時(H)": 8,
          },
          {
            項次: "QA-SCH-007",
            項目名稱: "Email 備援測試",
            說明: "SMTP Failover",
            "預估工時(H)": 8,
          },
        ],
      },
    },
    {
      key: "sa_final_suggestion",
      order: 58,
      content: {
        title: "十、主任 SA 真正建議",
        rawText: "真正商業 SaaS：通知系統 ≠ 發 API。",
      },
    },
    {
      key: "customer_concern",
      order: 59,
      content: {
        title: "醫美客戶最在意：",
        items: ["有沒有忘記通知", "有沒有漏單", "有沒有準時預約提醒"],
      },
    },
    {
      key: "my_design_philosophy",
      order: 60,
      content: {
        title: "十一、如果是我會這樣設計",
        rawText: "採用 Event-Driven Architecture，徹底解耦預約與通知邏輯。",
      },
    },
    {
      key: "final_architecture_flow",
      order: 61,
      content: {
        title: "架構",
        rawText:
          "User Booking ↓ Create Notification Queue ↓ Scheduler Background Job ↓ LINE API / Email ↓ Success / Retry / Dead Queue",
      },
    },
    {
      key: "final_total_hours_reality",
      order: 62,
      content: {
        title: "十二、真正完整工時",
        rawText: "如果加上完整的背景排程與通知監控機制：",
      },
    },
    {
      key: "be_hours_increase",
      order: 63,
      content: {
        title: "Backend 會再增加",
        rawText: "100~180 小時",
      },
    },
    {
      key: "qa_hours_increase",
      order: 64,
      content: {
        title: "QA 增加",
        rawText: "40~80 小時",
      },
    },
    {
      key: "conclusion_why",
      order: 65,
      content: {
        title: "十三、這就是為什麼",
        rawText: "你要打造的是一個真正能承擔營運負荷的 SaaS 預約平台。",
      },
    },
    {
      key: "event_queue_scheduler_system",
      order: 66,
      content: {
        title: "Event + Queue + Scheduler System",
        rawText: "這才是現代穩定系統的三大支柱。",
      },
    },
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await gasCall<{ status: number; data: OutlineModule[] }>(
        "get_booking_outline"
      );
      if (result.status === 200) {
        setData(result.data);
      } else {
        setError("無法取得資料");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生未知錯誤");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInitAll = async () => {
    if (!confirm("確定要按 66 個精確標題生成所有內容嗎？這將會覆蓋現有資料。"))
      return;

    try {
      setInitializing(true);
      for (const mod of INITIAL_DATA) {
        await gasCall("upsert_booking_module", {
          key: mod.key,
          payload: {
            order: mod.order,
            content: mod.content,
          },
        });
      }
      alert("66 個標題資料還原完成！");
      fetchData();
    } catch (err) {
      alert("還原失敗：" + (err instanceof Error ? err.message : ""));
    } finally {
      setInitializing(false);
    }
  };

  const handleEdit = (module: OutlineModule) => {
    setEditingModule(module);
    setEditJson(JSON.stringify(module.content, null, 2));
    setShowEdit(true);
  };

  const handleSave = async () => {
    if (!editingModule) return;
    try {
      const parsedContent = JSON.parse(editJson);
      setSaving(true);
      const result = await gasCall<{ status: number }>(
        "update_booking_module",
        {
          key: editingModule.key,
          payload: { content: parsedContent },
        }
      );

      if (result.status === 200) {
        setShowEdit(false);
        fetchData();
      } else {
        alert("儲存失敗");
      }
    } catch (err) {
      alert("JSON 格式錯誤：" + (err instanceof Error ? err.message : ""));
    } finally {
      setSaving(false);
    }
  };

  // 渲染不同類型的內容
  const ModuleRenderer: React.FC<{ mod: OutlineModule }> = ({ mod }) => {
    const { content } = mod;
    if (!content) return <span className="text-muted">無資料</span>;

    return (
      <div className={styles.renderBox}>
        <h5 className="mb-3 text-primary border-bottom pb-2 fw-bold">
          {content.title}
        </h5>

        {content.rawText && (
          <p
            className="mb-3 whitespace-pre-wrap lead text-dark"
            style={{ fontSize: "0.95rem" }}
          >
            {content.rawText}
          </p>
        )}

        {content.items && (
          <ul className="list-unstyled mb-3">
            {content.items.map((item, i) => (
              <li key={i} className="mb-1 d-flex align-items-start">
                <span className="text-success me-2">✔</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {content.table && (
          <div className="table-responsive">
            <Table
              size="sm"
              striped
              bordered
              hover
              className="bg-white"
              style={{ fontSize: "0.8rem" }}
            >
              <thead className="table-light">
                <tr>
                  {Object.keys(content.table[0]).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.table.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val: any, j) => (
                      <td key={j}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  return (
    <PageWrapper>
      <Container className={styles.container}>
        <Row>
          <Col xs={12}>
            <div className="mb-5 d-flex justify-content-between align-items-end flex-wrap gap-3 border-bottom pb-4">
              <div>
                <h1 className="fw-bold mb-1 text-gradient">
                  預約平台工時計畫 (66 節點還原)
                </h1>
                <p className="text-muted mb-0 lead">
                  對齊「品牌官網＋LINE 自助預約平台」章節
                </p>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="success"
                  className="shadow-sm"
                  onClick={handleInitAll}
                  disabled={initializing || loading}
                >
                  {initializing ? "搬運中..." : "🚀 還原 66 個原子標題"}
                </Button>
                <Button
                  variant="outline-primary"
                  className="shadow-sm"
                  onClick={fetchData}
                  disabled={loading}
                >
                  🔄 重新整理
                </Button>
              </div>
            </div>

            {loading && data.length === 0 ? (
              <div className="text-center p-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2 text-primary">正在同步資料...</p>
              </div>
            ) : (
              <div className={styles.masonryGrid}>
                {data.map((mod) => (
                  <div key={mod.key} className={styles.moduleCard}>
                    <div className="d-flex justify-content-between align-items-center mb-0 px-3 pt-3">
                      <span className="badge bg-light text-dark border">
                        STEP {mod.order}
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-decoration-none text-muted p-0"
                        onClick={() => handleEdit(mod)}
                      >
                        ⚙ 編輯
                      </Button>
                    </div>
                    <div className="px-3 pb-3">
                      <ModuleRenderer mod={mod} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Col>
        </Row>

        <Modal
          show={showEdit}
          onHide={() => setShowEdit(false)}
          size="lg"
          centered
        >
          <Modal.Header closeButton className="bg-dark text-white">
            <Modal.Title>編輯：{editingModule?.key}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-light">
            <Form.Group>
              <Form.Control
                as="textarea"
                rows={20}
                className="font-monospace"
                style={{ fontSize: "0.8rem" }}
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "確認儲存"}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </PageWrapper>
  );
};

export default WorkPlanPage;
