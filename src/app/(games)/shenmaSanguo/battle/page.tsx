import { Suspense } from "react";
import BattlePageContent from "./components/BattlePageContent";

export const metadata = {
  title: "神馬三國 - 戰場",
  description: "塔防戰鬥",
};

export default function BattlePage() {
  // Suspense 是 useSearchParams 在 App Router 中的必要包裝
  return (
    <Suspense fallback={null}>
      <BattlePageContent />
    </Suspense>
  );
}
