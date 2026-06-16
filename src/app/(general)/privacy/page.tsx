import { Metadata } from "next";

export const metadata: Metadata = {
  title: "隱私權政策 | 子yee 萬事屋",
  description:
    "子yee 萬事屋隱私權政策，說明本網站如何收集、使用及保護您的個人資料，以及 Google AdSense 廣告服務的 Cookie 使用方式。",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div
      className="container pb-5"
      style={{ maxWidth: "860px", paddingTop: "60px" }}
    >
      <div className="mb-4">
        <h1 className="fw-bold mb-1">隱私權政策</h1>
        <p className="text-muted small">最後更新日期：2026 年 6 月 16 日</p>
      </div>

      <p className="mb-4">
        感謝您使用「子yee 萬事屋」（以下簡稱「本網站」，網址為{" "}
        <a
          href="https://qwer820921.github.io"
          className="text-decoration-underline"
        >
          https://qwer820921.github.io
        </a>
        ）。本頁面說明本網站在您使用服務時，如何收集、使用及保護相關資訊。使用本網站即表示您同意本隱私權政策的內容。
      </p>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">一、資料收集</h2>
          <p className="mb-2">
            本網站不會主動要求您填寫個人識別資料（如姓名、地址、電話）。我們可能透過以下方式收集非個人識別資訊：
          </p>
          <ul className="mb-0">
            <li>瀏覽器類型、裝置資訊、作業系統</li>
            <li>您造訪的頁面及停留時間（透過 Google Analytics）</li>
            <li>廣告互動行為（透過 Google AdSense）</li>
          </ul>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">二、Cookie 使用說明</h2>
          <p className="mb-2">
            本網站使用 Cookie 以改善使用者體驗，並提供廣告服務。Cookie
            是儲存在您瀏覽器中的小型文字檔案，用於記錄偏好設定及分析流量。
          </p>
          <p className="mb-2">本網站使用 Cookie 的用途包括：</p>
          <ul className="mb-2">
            <li className="mb-2">
              <strong>Google AdSense：</strong>
              本網站使用 Google AdSense 顯示廣告。Google
              可能根據您過去瀏覽本網站或其他網站的紀錄，投放個人化廣告。您可前往{" "}
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-decoration-underline"
              >
                Google 廣告設定
              </a>{" "}
              管理個人化廣告偏好，或選擇退出。
            </li>
            <li>
              <strong>Google Analytics：</strong>
              用於分析網站流量與使用行為，協助改善網站內容。所有資料均為匿名統計。
            </li>
          </ul>
          <p className="mb-0 text-muted small">
            您可在瀏覽器設定中停用 Cookie，但部分功能可能因此受到影響。
          </p>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">三、廣告服務</h2>
          <p className="mb-0">
            本網站與 Google AdSense 合作投放廣告。Google
            作為第三方廣告服務商，會使用 Cookie
            根據使用者在本網站及其他網站的瀏覽記錄投放廣告。如需了解更多，請參閱{" "}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-decoration-underline"
            >
              Google 廣告政策
            </a>
            。
          </p>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">四、第三方連結</h2>
          <p className="mb-0">
            本網站可能包含連結至其他網站的連結。這些外部網站有其各自的隱私權政策，本網站對其內容及資料處理方式不承擔責任。建議您在使用這些網站前，閱讀其隱私權政策。
          </p>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">五、資料安全</h2>
          <p className="mb-0">
            本網站採取合理的技術措施保護資料安全。工具類功能（如 AI
            圖片去背、圖檔轉檔）的圖片處理皆在您的瀏覽器本地完成，不會上傳至任何伺服器。
          </p>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">六、政策更新</h2>
          <p className="mb-0">
            本隱私權政策可能隨時更新，修訂後的版本將公布於本頁面，並更新頁面頂部的「最後更新日期」。建議您定期查閱本頁面以了解最新政策。
          </p>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <h2 className="h5 fw-bold mb-3">七、聯絡我們</h2>
          <p className="mb-0">
            若您對本隱私權政策有任何疑問，歡迎透過以下方式聯絡我們：
            <br />
            Email：{" "}
            <a
              href="mailto:qwer820921@gmail.com"
              className="fw-semibold text-decoration-underline"
            >
              qwer820921@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
