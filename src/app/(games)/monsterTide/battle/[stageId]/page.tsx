import BattlePageClient from "../../components/BattlePageClient";

export function generateStaticParams() {
  return [{ stageId: "1" }, { stageId: "2" }, { stageId: "3" }];
}

export default async function BattlePage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;
  return (
    <div
      style={{
        background: "#0d0d0d",
        height: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <BattlePageClient stageId={Number(stageId)} />
    </div>
  );
}
