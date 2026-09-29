"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { registerAdminTokenAsker } from "../utils/adminToken";

/**
 * 管理密碼的輸入框（遮蔽輸入）。設定寫入需要密碼時由 requireAdminToken 開啟；
 * 取消或關閉時不送出任何請求。輸入的內容只交給 adminToken 的記憶體，不寫進任何儲存空間
 */
export default function AdminTokenPrompt() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    registerAdminTokenAsker(
      () =>
        new Promise<string | null>((resolve) => {
          resolver.current = resolve;
          setValue("");
          setOpen(true);
        })
    );
    return () => {
      registerAdminTokenAsker(null);
      resolver.current?.(null);
      resolver.current = null;
    };
  }, []);

  const finish = (v: string | null) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(false);
    setValue("");
    r?.(v);
  };

  return (
    <Modal show={open} onHide={() => finish(null)} centered>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) finish(value);
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h6">輸入管理密碼</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId="adminToken">
            <Form.Label className="small">
              儲存到後端設定（地圖、波次、武將、敵人）需要管理密碼
            </Form.Label>
            <Form.Control
              type="password"
              autoComplete="off"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              data-testid="admin-token-input"
            />
            <Form.Text muted>
              只存在這個頁面的記憶體：重新整理或密碼錯誤後要重新輸入；取消時不會送出。
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => finish(null)}
            data-testid="admin-token-cancel"
          >
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!value.trim()}
            data-testid="admin-token-submit"
          >
            送出
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
