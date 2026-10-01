"use client";

import {
  ChangeEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Button, Col, Row } from "react-bootstrap";
import { FileEarmarkText } from "react-bootstrap-icons";
import {
  BackupParseResult,
  backupFileErrorText,
  backupReasonText,
  MAX_BACKUP_FILE_BYTES,
  parseBackupFile,
} from "../../utils/backupFile";
import { compareSaves } from "../../utils/saveConflict";
import SaveCompareTable from "../SaveCompareTable";
import { useDialogFocus } from "../useDialogFocus";
import { useSaveNames } from "./SaveConflictModal";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  onClose: () => void;
}

interface Picked {
  fileName: string;
  result: BackupParseResult;
}

/**
 * 備份檔預覽（唯讀）：選擇之前匯出的存檔備份（JSON），顯示匯出時間與檔案裡的兩份資料的比較。
 * 匯出檔不含存檔金鑰、無法確認屬於哪個帳號，所以只顯示，不匯入、不保存、不送出任何請求，
 * 也不改變這個分頁的存檔或 session。檔案內容一律當成文字顯示。
 * 鍵盤沿用 useDialogFocus：開啟時焦點在右上的關閉鈕，Tab／Shift+Tab 只在視窗內循環，Esc 關閉
 * （讀取中也可以關閉：只是預覽，關閉後讀到的內容不再顯示）。讀完一個檔案後焦點移到結果（或無法預覽的原因）
 */
export default function BackupPreviewModal({ onClose }: Props) {
  const names = useSaveNames();
  const titleId = useId();
  const introId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialogFocus(panelRef, closeRef, onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const readToken = useRef(0);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [reading, setReading] = useState(false);
  const [showSame, setShowSame] = useState(false);
  const [showHeroes, setShowHeroes] = useState(false);

  const backup = picked?.result.ok ? picked.result.backup : null;

  // 讀完（或檢查完）一個檔案：焦點移到結果，鍵盤與螢幕閱讀器的使用者才知道內容出現了
  useEffect(() => {
    if (picked) outcomeRef.current?.focus();
  }, [picked]);
  const compared = useMemo(
    () => (backup ? compareSaves(backup.local, backup.cloud, names) : null),
    [backup, names]
  );

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空選擇，同一個檔案也能再選一次；取消選檔時保留目前的預覽
    e.target.value = "";
    if (!file) return;
    const token = ++readToken.current;
    const show = (result: BackupParseResult) => {
      if (token !== readToken.current) return; // 已經改選別的檔案
      setPicked({ fileName: file.name, result });
      setShowSame(false);
      setShowHeroes(false);
    };
    // 大小先檢查，太大的檔案不讀進來；檔名與類型不可信，內容一律檢查結構
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      show({ ok: false, error: "FILE_TOO_LARGE" });
      return;
    }
    setReading(true);
    try {
      show(parseBackupFile(await file.text()));
    } catch {
      show({ ok: false, error: "READ_FAILED" });
    } finally {
      if (token === readToken.current) setReading(false);
    }
  };

  const exportedAt = backup ? new Date(backup.exportedAt).toLocaleString() : "";

  return (
    <div
      className={`${styles.modalBackdrop} ${styles.conflictBackdrop}`}
      data-testid="backup-preview-modal"
    >
      <div
        ref={panelRef}
        className={`${styles.modalPanel} ${styles.conflictPanel}`}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          <FileEarmarkText className={styles.conflictIcon} aria-hidden="true" />
          <span id={titleId} className={styles.modalTitle}>
            預覽備份檔
          </span>
          <button
            ref={closeRef}
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="關閉備份檔預覽"
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <p id={introId} className={styles.conflictIntro}>
            讀取之前匯出的存檔備份（JSON），比較檔案裡的兩份資料。
            <strong>只在這個畫面顯示</strong>
            ：不會匯入、保存或覆蓋任何存檔。匯出檔不含存檔金鑰，無法確認屬於哪個帳號。
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="d-none"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onFile}
            data-testid="backup-preview-input"
          />
          <Row className="g-2 mb-3">
            <Col xs={12} sm="auto">
              <Button
                variant="outline-primary"
                className="w-100"
                disabled={reading}
                onClick={() => inputRef.current?.click()}
                data-testid="backup-preview-pick"
              >
                {reading ? "讀取中..." : picked ? "選擇其他檔案" : "選擇備份檔"}
              </Button>
            </Col>
            {picked && (
              <Col xs={12} sm className={styles.backupFileName}>
                <span data-testid="backup-preview-file">{picked.fileName}</span>
              </Col>
            )}
          </Row>

          {picked && !picked.result.ok && (
            <Alert
              ref={outcomeRef}
              variant="danger"
              className="py-2 small"
              data-testid="backup-preview-error"
              data-error={picked.result.error}
              tabIndex={-1}
            >
              無法預覽：
              {backupFileErrorText(picked.result.error, picked.result.field)}
            </Alert>
          )}

          {backup && compared && (
            <div
              ref={outcomeRef}
              data-testid="backup-preview-result"
              tabIndex={-1}
              role="region"
              aria-label={`備份檔 ${picked?.fileName ?? ""} 的內容`}
            >
              <Row className={`g-1 mb-3 ${styles.backupMeta}`}>
                <Col xs={3} className={styles.backupMetaLabel}>
                  匯出時間
                </Col>
                <Col xs={9} data-testid="backup-preview-time">
                  {exportedAt}
                </Col>
                <Col xs={3} className={styles.backupMetaLabel}>
                  原因
                </Col>
                <Col xs={9}>{backupReasonText(backup.reason)}</Col>
                <Col xs={3} className={styles.backupMetaLabel}>
                  格式
                </Col>
                <Col xs={9}>
                  {backup.version === 0
                    ? "舊版匯出（沒有格式標記）"
                    : `版本 ${backup.version}`}
                </Col>
                <Col xs={3} className={styles.backupMetaLabel}>
                  雲端版本
                </Col>
                <Col xs={9} data-testid="backup-preview-revs">
                  這個分頁根據版本 {backup.localBaseRev ?? "不明"}；雲端是版本{" "}
                  {backup.cloud ? (backup.cloudRev ?? "不明") : "（無法讀取）"}
                </Col>
              </Row>
              <p className={styles.conflictHint}>
                兩份資料都是匯出當時的內容。
              </p>
              <SaveCompareTable
                summary={compared.summary}
                heroes={compared.heroes}
                localLabel="這個分頁"
                cloudLabel={
                  backup.cloud
                    ? `雲端（版本 ${backup.cloudRev ?? "不明"}）`
                    : "雲端（無法讀取）"
                }
                showSame={showSame}
                onShowSame={setShowSame}
                showHeroes={showHeroes}
                onShowHeroes={setShowHeroes}
                idPrefix="backup-preview"
                testIdPrefix="backup-preview"
              />
              <p className={styles.conflictHint}>
                檔案裡的版本號只是匯出當時的紀錄，不能用來保存或覆蓋目前的存檔。
              </p>
            </div>
          )}

          <Button
            variant="secondary"
            className="w-100 mt-2"
            onClick={onClose}
            data-testid="backup-preview-close"
          >
            關閉
          </Button>
        </div>
      </div>
    </div>
  );
}
