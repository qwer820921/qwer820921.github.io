// 存檔衝突的比較與匯出（純函式，不含畫面）：比較這個分頁與雲端兩份存檔，
// 產生摘要列、武將明細列與匯出用的備份內容。不包含存檔金鑰
import { HeroState, PlayerState, TeamSlot } from "../types";
import { BACKUP_FILE_FORMAT, BACKUP_FILE_VERSION } from "./backupFile";

/** 比較表的一列：兩邊的顯示文字，以及兩邊是否不同 */
export interface CompareRow {
  id: string;
  label: string;
  local: string;
  cloud: string;
  differs: boolean;
}

/** 名稱查詢（查不到時顯示原始 id） */
export interface NameLookup {
  hero: (heroId: string) => string;
  stage: (stageId: string) => string;
}

/** 關卡 id 的顯示文字：chapter1_7 → 第 1 章第 7 關 */
export function stageLabel(stageId: string): string {
  const m = /^chapter(\d+)_(\d+)$/.exec(stageId || "");
  return m ? `第 ${m[1]} 章第 ${m[2]} 關` : stageId || "（無）";
}

const KNOWN_FIELDS = [
  "nickname",
  "level",
  "exp",
  "gold",
  "capacity",
  "max_stage",
  "heroes",
  "team",
];

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function teamText(team: TeamSlot[] | undefined, names: NameLookup): string {
  const list = [...(team || [])].sort((a, b) => a.slot - b.slot);
  return list.length > 0
    ? list.map((t) => names.hero(t.hero_id)).join("、")
    : "（沒有武將）";
}

function heroText(h: HeroState | undefined): string {
  if (!h) return "Lv.1（未升級）";
  return `Lv.${h.level}（攻 ${h.atk}／防 ${h.def}／血 ${h.hp}）`;
}

/** 其他欄位（前端不認得、但存檔裡有的）：兩邊不同時只標示「不同」，內容見匯出 */
function otherFields(p: PlayerState): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (!KNOWN_FIELDS.includes(k)) rest[k] = v;
  }
  return stable(rest);
}

/**
 * 比較兩份存檔。cloud 是 null（雲端損毀或讀不到）時，雲端欄位一律顯示「無法讀取」並視為不同。
 * summary：暱稱、等級、點數、關卡進度、部隊容量、隊伍、武將、其他欄位；heroes：每位武將的等級與數值
 */
export function compareSaves(
  local: PlayerState,
  cloud: PlayerState | null,
  names: NameLookup
): { summary: CompareRow[]; heroes: CompareRow[] } {
  const na = "無法讀取";
  const row = (
    id: string,
    label: string,
    l: string,
    c: string | null,
    differs?: boolean
  ): CompareRow => ({
    id,
    label,
    local: l,
    cloud: c ?? na,
    differs: differs ?? (c === null || l !== c),
  });
  const heroIds = Array.from(
    new Set([
      ...local.heroes.map((h) => h.hero_id),
      ...(cloud?.heroes ?? []).map((h) => h.hero_id),
    ])
  );
  const heroes = heroIds.map((id) => {
    const l = local.heroes.find((h) => h.hero_id === id);
    const c = cloud?.heroes.find((h) => h.hero_id === id);
    return row(
      `hero:${id}`,
      names.hero(id),
      heroText(l),
      cloud ? heroText(c) : null,
      !cloud || stable(l ?? null) !== stable(c ?? null)
    );
  });
  const upgraded = (p: PlayerState) => `${p.heroes.length} 位升級過`;
  const summary = [
    row("nickname", "暱稱", local.nickname, cloud ? cloud.nickname : null),
    row(
      "level",
      "等級",
      `Lv.${local.level}（經驗 ${local.exp}）`,
      cloud ? `Lv.${cloud.level}（經驗 ${cloud.exp}）` : null
    ),
    row(
      "gold",
      "戰場點數",
      String(local.gold),
      cloud ? String(cloud.gold) : null
    ),
    row(
      "max_stage",
      "關卡進度",
      names.stage(local.max_stage),
      cloud ? names.stage(cloud.max_stage) : null
    ),
    row(
      "capacity",
      "部隊容量",
      String(local.capacity),
      cloud ? String(cloud.capacity) : null
    ),
    row(
      "team",
      "隊伍",
      teamText(local.team, names),
      cloud ? teamText(cloud.team, names) : null,
      !cloud || stable(local.team) !== stable(cloud.team)
    ),
    row(
      "heroes",
      "武將",
      upgraded(local),
      cloud ? upgraded(cloud) : null,
      heroes.some((h) => h.differs)
    ),
    row(
      "other",
      "其他欄位",
      "（見匯出）",
      cloud ? "（見匯出）" : null,
      !cloud || otherFields(local) !== otherFields(cloud)
    ),
  ];
  return { summary, heroes };
}

/** 匯出內容：格式標記、兩份存檔與版本（不含存檔金鑰）；可以在設定頁的「預覽備份檔」讀回比較 */
export function buildExport(input: {
  reason: string;
  local: PlayerState;
  localBaseRev: number | null;
  cloud: PlayerState | null;
  cloudRev: number;
}) {
  return {
    format: BACKUP_FILE_FORMAT,
    version: BACKUP_FILE_VERSION,
    note: "神馬三國存檔備份（不含存檔金鑰）。this_tab 是這個分頁的資料，cloud 是當時雲端的資料；rev 是雲端存檔的版本。",
    exported_at: new Date().toISOString(),
    reason: input.reason,
    this_tab: input.local,
    this_tab_base_rev: input.localBaseRev,
    cloud: input.cloud,
    cloud_rev: input.cloudRev,
  };
}

/** 下載 JSON 檔（瀏覽器） */
export function downloadJson(prefix: string, data: unknown): void {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
