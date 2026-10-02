/**
 * 地圖資訊（名稱、章節、解鎖條件）的保存判斷：更新既有地圖時，這三欄要放在 update_map_config 的頂層
 * （後端只把頂層的 name／chapter／unlock_stage 寫進 maps_config 的同名欄；path_json 裡的同名欄位遊戲與清單都不讀）。
 * - 從設定載入的原值另外記住（含型別）：輸入框的文字和原值相同就是沒有修改，不送這一欄，後端保留原本的格子
 * - 有修改時：名稱與解鎖條件照輸入的文字送出（清空就送空字串，不自動補值）；
 *   章節必須是 1 以上的整數，其他寫法（空白、小數、「2abc」等）留在畫面上，不問管理密碼、不送出
 * - 沒有原值（新地圖、匯入的 JSON，或 map_id 已經改成別的）時三欄都當作有修改
 */

export interface MapMetaInput {
  name: string;
  chapter: string;
  unlockStage: string;
}

/** 從設定載入的原值（原樣保留型別；map_id 用來確認還是同一張地圖） */
export interface MapMetaOriginal {
  mapId: string;
  name: unknown;
  chapter: unknown;
  unlock_stage: unknown;
}

/** 要送到後端頂層的欄位（沒有修改的欄位不送） */
export interface MapMetaFields {
  name?: string;
  chapter?: number;
  unlock_stage?: string;
}

export type MapMetaResult =
  | {
      ok: true;
      fields: MapMetaFields;
      /** 保存後各欄的值（沒有修改的是原值） */
      effective: { name: unknown; chapter: unknown; unlock_stage: unknown };
    }
  | { ok: false; field: "chapter"; error: string };

/** 原值在輸入框裡顯示的文字（沒有值時是空白，不補預設值） */
export function metaText(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

export const CHAPTER_INVALID = "章節要填 1 以上的整數（例如 1、2）";

/** 章節：1 以上的整數（允許前後空白）；其他寫法回傳 null，不轉成別的數字 */
export function parseChapter(text: string): number | null {
  const s = text.trim();
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** 原值是不是這張地圖的（map_id 改過之後就不是同一張） */
function originalFor(
  original: MapMetaOriginal | null,
  mapId: string
): MapMetaOriginal | null {
  return original && original.mapId === mapId ? original : null;
}

/** 這一欄有沒有修改（沒有原值時一律算有修改） */
export function metaChanged(
  original: MapMetaOriginal | null,
  mapId: string,
  field: "name" | "chapter" | "unlock_stage",
  text: string
): boolean {
  const o = originalFor(original, mapId);
  return !o || metaText(o[field]) !== text;
}

/** 更新既有地圖時要送的地圖資訊；章節有修改但不是 1 以上的整數時回傳錯誤 */
export function mapMetaUpdate(
  original: MapMetaOriginal | null,
  mapId: string,
  input: MapMetaInput
): MapMetaResult {
  const o = originalFor(original, mapId);
  const fields: MapMetaFields = {};
  const effective = {
    name: o ? o.name : input.name,
    chapter: o ? o.chapter : input.chapter,
    unlock_stage: o ? o.unlock_stage : input.unlockStage,
  };
  if (metaChanged(o, mapId, "name", input.name)) {
    fields.name = input.name;
    effective.name = input.name;
  }
  if (metaChanged(o, mapId, "chapter", input.chapter)) {
    const n = parseChapter(input.chapter);
    if (n === null)
      return { ok: false, field: "chapter", error: CHAPTER_INVALID };
    fields.chapter = n;
    effective.chapter = n;
  }
  if (metaChanged(o, mapId, "unlock_stage", input.unlockStage)) {
    fields.unlock_stage = input.unlockStage;
    effective.unlock_stage = input.unlockStage;
  }
  return { ok: true, fields, effective };
}

/**
 * 保存後讀回的地圖資訊和送出的不同的欄位（只比對有送出的欄位，用顯示的文字比較）；
 * 回傳欄位名稱、送出的值與讀回的值
 */
export function metaReadbackDiff(
  sent: MapMetaFields,
  readback: { name?: unknown; chapter?: unknown; unlock_stage?: unknown }
): { field: keyof MapMetaFields; sent: string; got: string }[] {
  const out: { field: keyof MapMetaFields; sent: string; got: string }[] = [];
  (Object.keys(sent) as (keyof MapMetaFields)[]).forEach((field) => {
    const a = metaText(sent[field]);
    const b = metaText(readback[field]);
    if (a !== b) out.push({ field, sent: a, got: b });
  });
  return out;
}

/** 欄位的中文名稱 */
export const META_LABEL: Record<keyof MapMetaFields, string> = {
  name: "名稱",
  chapter: "章節",
  unlock_stage: "解鎖條件",
};
