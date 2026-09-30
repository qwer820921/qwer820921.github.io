"use client";

import styles from "../styles/shenmaSanguo.module.css";

/**
 * Godot 送來的結算不合規則（星數、點數…；驗證規則見 utils/battleReward 的 toBattleRecord）：
 * 結算視窗不顯示獎勵，只說明這場沒有領取、不會保存；按下確認後這一場照樣作廢，不能重新領取
 * - dark：主頁的結算卡片（深色）；light：獨立戰鬥頁的結算視窗（白底）
 */
export default function InvalidResultNotice({
  variant,
}: {
  variant: "dark" | "light";
}) {
  return (
    <div
      className={`${styles.resultInvalid} ${variant === "light" ? styles.resultInvalidLight : ""}`}
      data-testid="result-invalid"
      role="alert"
    >
      這場結算資料異常（星數或點數不合規則），未領取獎勵：這場的結果不會保存，也不能重新領取。可以直接開始下一場。
    </div>
  );
}
