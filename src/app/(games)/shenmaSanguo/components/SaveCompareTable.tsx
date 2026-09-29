"use client";

import { Col, Form, Row, Table } from "react-bootstrap";
import { CompareRow } from "../utils/saveConflict";
import styles from "../styles/shenmaSanguo.module.css";

interface Props {
  /** compareSaves 的結果 */
  summary: CompareRow[];
  heroes: CompareRow[];
  localLabel: string;
  cloudLabel: string;
  showSame: boolean;
  onShowSame: (v: boolean) => void;
  showHeroes: boolean;
  onShowHeroes: (v: boolean) => void;
  /** 開關的元素 id 前綴（同一頁有兩個比較表時不重複） */
  idPrefix: string;
  /** data-testid 前綴 */
  testIdPrefix: string;
}

/**
 * 兩份存檔的比較表（存檔衝突的比較視窗、備份檔預覽共用）：預設只列不同的項目，
 * 可以顯示相同的項目、展開每位武將的等級與數值。內容一律當成文字顯示
 */
export default function SaveCompareTable({
  summary,
  heroes,
  localLabel,
  cloudLabel,
  showSame,
  onShowSame,
  showHeroes,
  onShowHeroes,
  idPrefix,
  testIdPrefix,
}: Props) {
  const summaryRows = showSame ? summary : summary.filter((r) => r.differs);
  const heroRows = showHeroes
    ? heroes.filter((r) => showSame || r.differs)
    : [];
  return (
    <>
      <Table
        size="sm"
        bordered
        responsive
        className={styles.conflictTable}
        data-testid={`${testIdPrefix}-table`}
      >
        <thead>
          <tr>
            <th>項目</th>
            <th>{localLabel}</th>
            <th>{cloudLabel}</th>
          </tr>
        </thead>
        <tbody>
          {summaryRows.length === 0 && heroRows.length === 0 && (
            <tr>
              <td colSpan={3} className={styles.conflictHint}>
                顯示的項目都相同
              </td>
            </tr>
          )}
          {[...summaryRows, ...heroRows].map((r) => (
            <tr
              key={r.id}
              className={r.differs ? styles.conflictDiff : undefined}
              data-row={r.id}
              data-differs={r.differs ? "1" : "0"}
            >
              <td>{r.id.startsWith("hero:") ? `└ ${r.label}` : r.label}</td>
              <td>{r.local}</td>
              <td>{r.cloud}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Row className="g-2 mb-3">
        <Col xs="auto">
          <Form.Check
            type="switch"
            id={`${idPrefix}-show-same`}
            label="顯示相同的項目"
            checked={showSame}
            onChange={(e) => onShowSame(e.target.checked)}
          />
        </Col>
        <Col xs="auto">
          <Form.Check
            type="switch"
            id={`${idPrefix}-show-heroes`}
            label="展開武將明細"
            checked={showHeroes}
            onChange={(e) => onShowHeroes(e.target.checked)}
            data-testid={`${testIdPrefix}-heroes`}
          />
        </Col>
      </Row>
    </>
  );
}
