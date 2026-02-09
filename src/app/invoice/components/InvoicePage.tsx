"use client";

import React, { useState } from "react";
import { Tab, Tabs } from "react-bootstrap";
import styles from "../invoice.module.css";
import LotteryDisplay from "./LotteryDisplay";
import KeypadInput from "./KeypadInput";
import QrScanner from "./QrScanner";

/**
 * 統一發票對獎主頁面
 */
const InvoicePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("numbers");

  return (
    <div className={styles.pageContainer}>
      <div className={styles.contentWrapper}>
        <h1 className={styles.pageTitle}>統一發票對獎</h1>

        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k || "numbers")}
          className={styles.customTabs}
        >
          <Tab eventKey="numbers" title="📋 發票資訊">
            <LotteryDisplay />
          </Tab>
          <Tab eventKey="keypad" title="⌨️ 快速對獎">
            <KeypadInput />
          </Tab>
          <Tab eventKey="scan" title="📷 掃描對獎" mountOnEnter={true} unmountOnExit={true}>
            <QrScanner />
          </Tab>
        </Tabs>
      </div>
    </div>
  );
};

export default InvoicePage;
