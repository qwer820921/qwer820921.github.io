import { create } from "zustand";
import {
  QRDataType,
  QRCodeStyleOptions,
  DynamicQRInfo,
  VCardData,
  WifiData,
} from "../types";

interface QRState {
  // Data State
  dataType: QRDataType;
  setDataType: (type: QRDataType) => void;

  // Specific Data Input
  urlInput: string;
  setUrlInput: (val: string) => void;
  vCardData: VCardData;
  setVCardData: (data: Partial<VCardData>) => void;
  wifiData: WifiData;
  setWifiData: (data: Partial<WifiData>) => void;
  textInput: string;
  setTextInput: (val: string) => void;

  // Render Output
  finalEncodedText: string;
  setFinalEncodedText: (val: string) => void;

  // Style State
  styleOptions: QRCodeStyleOptions;
  updateStyle: (options: Partial<QRCodeStyleOptions>) => void;

  // Dynamic Mode
  isDynamic: boolean;
  setIsDynamic: (val: boolean) => void;
  dynamicInfo: DynamicQRInfo | null;
  setDynamicInfo: (info: DynamicQRInfo | null) => void;
  isGeneratingDynamic: boolean;
  setIsGeneratingDynamic: (val: boolean) => void;
}

const defaultStyle: QRCodeStyleOptions = {
  text: "",
  size: 500,
  margin: 10,
  dotsColor: "#000000",
  dotsType: "square",
  backgroundColor: "#ffffff",
  correctLevel: "M",
  cornersSquareType: "square",
  cornersSquareColor: "#000000",
};

export const useQRStore = create<QRState>((set) => ({
  dataType: "url",
  setDataType: (type) =>
    set({ dataType: type, isDynamic: false, dynamicInfo: null }), // switch type disables dynamic mode

  urlInput: "https://qwer820921.github.io",
  setUrlInput: (val) => set({ urlInput: val }),

  vCardData: {
    firstName: "",
    lastName: "",
    organization: "",
    phone: "",
    email: "",
    title: "",
    website: "",
  },
  setVCardData: (data) =>
    set((state) => ({ vCardData: { ...state.vCardData, ...data } })),

  wifiData: { ssid: "", encryption: "WPA", hidden: false },
  setWifiData: (data) =>
    set((state) => ({ wifiData: { ...state.wifiData, ...data } })),

  textInput: "",
  setTextInput: (val) => set({ textInput: val }),

  finalEncodedText: "https://qwer820921.github.io",
  setFinalEncodedText: (val) => set({ finalEncodedText: val }),

  styleOptions: defaultStyle,
  updateStyle: (options) =>
    set((state) => ({
      styleOptions: { ...state.styleOptions, ...options },
    })),

  isDynamic: false,
  setIsDynamic: (val) => set({ isDynamic: val }),
  dynamicInfo: null,
  setDynamicInfo: (info) => set({ dynamicInfo: info }),
  isGeneratingDynamic: false,
  setIsGeneratingDynamic: (val) => set({ isGeneratingDynamic: val }),
}));
