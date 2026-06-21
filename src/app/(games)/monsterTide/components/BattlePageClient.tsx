"use client";

import dynamic from "next/dynamic";

const GameCanvas = dynamic(() => import("./GameCanvas"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        paddingTop: "2rem",
        color: "#aaa",
        textAlign: "center",
        fontFamily: "monospace",
      }}
    >
      載入遊戲中...
    </div>
  ),
});

export default function BattlePageClient({ stageId }: { stageId: number }) {
  return <GameCanvas stageId={stageId} />;
}
