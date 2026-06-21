"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameEngine } from "../lib/engine";
import ResultScreen from "./ResultScreen";
import SkillSelectModal from "./SkillSelectModal";
import { loadSave, addSouls, markStageCleared } from "../lib/meta/saveData";
import {
  getPermanentDmgBonus,
  getPermanentHpBonus,
} from "../lib/meta/permanentUpgrades";
import type { GameEvent, ResultScreenData, SkillOption } from "../types";
import styles from "../styles/monsterTide.module.css";

export interface GameCanvasProps {
  stageId: number;
}

export default function GameCanvas({ stageId }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [resultData, setResultData] = useState<ResultScreenData | null>(null);
  const [skillOptions, setSkillOptions] = useState<SkillOption[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const save = loadSave();
    const dmgBonus = getPermanentDmgBonus(save.permanentUpgrades.base_atk);
    const hpBonus = getPermanentHpBonus(save.permanentUpgrades.base_hp);

    const handleEvent = (event: GameEvent) => {
      if (event.type === "RESULT") {
        // 立即存入深淵晶核
        const total =
          event.data.soulsEarned +
          (event.data.outcome === "stage_clear"
            ? event.data.stageBonusSouls
            : 0);
        addSouls(total);
        if (event.data.outcome === "stage_clear") markStageCleared(stageId);
        setResultData(event.data);
      } else if (event.type === "SKILL_SELECT_NEEDED") {
        setSkillOptions(event.options);
      }
    };

    const engine = new GameEngine(
      canvas,
      stageId,
      handleEvent,
      dmgBonus,
      hpBonus
    );
    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [stageId]);

  const handleSkillSelect = (skill: SkillOption) => {
    setSkillOptions(null);
    engineRef.current?.applySkill(skill);
  };

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={480}
        height={800}
        className={styles.gameCanvas}
      />
      {skillOptions && (
        <SkillSelectModal options={skillOptions} onSelect={handleSkillSelect} />
      )}
      {resultData && (
        <ResultScreen
          data={resultData}
          onContinue={() => router.push("/monsterTide/stageSelect")}
        />
      )}
    </div>
  );
}
