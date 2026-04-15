import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  sortJsonKeys,
  generateTypeScript,
  stripJsonComments,
} from "../utils/jsonUtils";

export type FormatMode = "format" | "minify" | "sort" | "escape" | "typescript";

interface JsonFormatState {
  inputJson: string;
  outputJson: string;
  error: string | null;
  activeMode: FormatMode;
  setInput: (input: string) => void;
  setActiveMode: (mode: FormatMode) => void;
  applyMode: () => void;
  clearAll: () => void;
  setError: (err: string | null) => void;
}

let debounceTimer: ReturnType<typeof setTimeout>;

export const useJsonFormatStore = create<JsonFormatState>()(
  persist(
    (set, get) => {
      const formatLogic = () => {
        const rawInput = get().inputJson.trim();
        let parsed;
        try {
          const str = stripJsonComments(rawInput);
          parsed = JSON.parse(str);
          if (typeof parsed === "string") {
            try {
              const deepParsed = JSON.parse(parsed);
              if (typeof deepParsed === "object" && deepParsed !== null) {
                parsed = deepParsed;
              }
            } catch {}
          }
        } catch {
          let str = rawInput;
          if (str.startsWith('"') && str.endsWith('"')) {
            str = str.slice(1, -1);
          }
          str = str
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t");
          parsed = JSON.parse(stripJsonComments(str));
        }
        set({ outputJson: JSON.stringify(parsed, null, 2), error: null });
      };

      const minifyLogic = () => {
        const parsed = JSON.parse(stripJsonComments(get().inputJson));
        set({ outputJson: JSON.stringify(parsed), error: null });
      };

      const sortLogic = () => {
        const parsed = JSON.parse(stripJsonComments(get().inputJson));
        const sorted = sortJsonKeys(parsed);
        set({ outputJson: JSON.stringify(sorted, null, 2), error: null });
      };

      const escapeLogic = () => {
        let escaped = "";
        try {
          const parsed = JSON.parse(stripJsonComments(get().inputJson));
          const minified = JSON.stringify(parsed);
          escaped = JSON.stringify(minified);
        } catch {
          escaped = JSON.stringify(get().inputJson);
        }
        set({ outputJson: escaped.slice(1, -1), error: null });
      };

      const tsLogic = () => {
        const ts = generateTypeScript(get().inputJson);
        set({ outputJson: ts, error: null });
      };

      return {
        inputJson: "",
        outputJson: "",
        error: null,
        activeMode: "format",

        setInput: (input) => {
          set({ inputJson: input, error: null });
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            get().applyMode();
          }, 400); // 400ms debounce
        },

        setActiveMode: (mode) => {
          set({ activeMode: mode });
          get().applyMode();
        },

        applyMode: () => {
          const { inputJson, activeMode } = get();
          if (!inputJson.trim()) {
            set({ outputJson: "", error: null });
            return;
          }

          try {
            if (activeMode === "format") formatLogic();
            else if (activeMode === "minify") minifyLogic();
            else if (activeMode === "sort") sortLogic();
            else if (activeMode === "escape") escapeLogic();
            else if (activeMode === "typescript") tsLogic();
          } catch (e: any) {
            // 報錯時不清除先前的 output，避免打字到一半畫面閃爍消失
            const modeNames: Record<FormatMode, string> = {
              format: "解析錯誤",
              minify: "壓縮錯誤",
              sort: "排序錯誤",
              escape: "轉義錯誤",
              typescript: "TypeScript 轉換錯誤",
            };
            set({
              error: `${modeNames[activeMode]}: 請確認 JSON 格式是否完整正確 (${e.message})`,
            });
          }
        },

        clearAll: () => set({ inputJson: "", outputJson: "", error: null }),

        setError: (err) => {
          set({ error: err });
        },
      };
    },
    {
      name: "json-format-storage",
      version: 1,
    }
  )
);
