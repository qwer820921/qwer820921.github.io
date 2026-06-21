import { Metadata } from "next";
import PageWrapper from "@/components/common/PageWrapper";

export const metadata: Metadata = {
  title: "聯絡我們 | 子yee 萬事屋",
  description:
    "聯絡子yee 萬事屋，無論是技術合作、文章授權、工具建議或任何問題，歡迎透過 Email 與我們聯繫。",
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <PageWrapper>
      <div className="container pb-5" style={{ maxWidth: "760px" }}>
        <div className="mb-5">
          <h1 className="fw-bold mb-2">聯絡我們</h1>
          <p className="text-muted">
            有任何問題或合作邀約，歡迎直接與我們聯繫。
          </p>
        </div>

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h2 className="h5 fw-bold mb-3">聯絡方式</h2>
            <div className="d-flex align-items-center gap-3 mb-2">
              <span className="badge bg-primary px-3 py-2">Email</span>
              <a
                href="mailto:qwer820921@gmail.com"
                className="fw-semibold text-decoration-underline fs-6"
              >
                qwer820921@gmail.com
              </a>
            </div>
            <p className="text-muted small mb-0">通常於 1–3 個工作天內回覆。</p>
          </div>
        </div>

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h2 className="h5 fw-bold mb-3">聯絡事項</h2>
            <p className="mb-3">歡迎就以下事項聯繫我們：</p>
            <ul className="list-group list-group-flush">
              <li className="list-group-item border-0 px-0 py-2">
                技術合作與專案委託
              </li>
              <li className="list-group-item border-0 px-0 py-2">
                部落格文章授權或轉載
              </li>
              <li className="list-group-item border-0 px-0 py-2">
                工具功能建議或 Bug 回報
              </li>
              <li className="list-group-item border-0 px-0 py-2">
                廣告合作與業務洽談
              </li>
              <li className="list-group-item border-0 px-0 py-2">
                其他任何問題
              </li>
            </ul>
          </div>
        </div>

        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h2 className="h5 fw-bold mb-3">關於本站</h2>
            <p className="mb-0">
              子yee 萬事屋是一個以技術分享為核心的個人網站，涵蓋 AI
              應用開發、前端架構、資安等深度文章，並提供發票對獎、圖片處理、QR
              Code 生成等實用工具，以及數獨、2048
              等休閒遊戲。網站由個人維護，持續更新中。
            </p>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
