import { create } from "zustand";

export type SfxPolyphony = "single" | "faithful";

interface SoundSettingsStore {
  sfxEnabled: boolean;
  sfxPolyphony: SfxPolyphony;
  setEnabled: (v: boolean) => void;
  setPolyphony: (v: SfxPolyphony) => void;
}

const STORAGE_KEY = "shenma_sound_settings";

function readLocal(): Pick<SoundSettingsStore, "sfxEnabled" | "sfxPolyphony"> {
  if (typeof window === "undefined")
    return { sfxEnabled: true, sfxPolyphony: "single" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sfxEnabled: true, sfxPolyphony: "single" };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      sfxEnabled: typeof p.sfxEnabled === "boolean" ? p.sfxEnabled : true,
      sfxPolyphony: p.sfxPolyphony === "faithful" ? "faithful" : "single",
    };
  } catch {
    return { sfxEnabled: true, sfxPolyphony: "single" };
  }
}

function persist(sfxEnabled: boolean, sfxPolyphony: SfxPolyphony) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ sfxEnabled, sfxPolyphony })
  );
}

export const useSoundSettingsStore = create<SoundSettingsStore>((set, get) => ({
  ...readLocal(),
  setEnabled: (v) => {
    set({ sfxEnabled: v });
    persist(v, get().sfxPolyphony);
  },
  setPolyphony: (v) => {
    set({ sfxPolyphony: v });
    persist(get().sfxEnabled, v);
  },
}));
