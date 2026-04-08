// QR Code 相關型別定義

export type QRDataType = "url" | "wifi" | "vcard" | "text" | "email" | "sms";

export interface QRCodeStyleOptions {
  text: string;
  size: number;
  margin: number;
  
  dotsColor: string;
  dotsType: "rounded" | "dots" | "classy" | "classy-rounded" | "square" | "extra-rounded";

  backgroundColor: string;
  backgroundImage?: string; // Not natively handled very well by qr-code-styling for foreground overlay, but it supports setting a background image.

  correctLevel: "L" | "M" | "Q" | "H";
  
  logoImage?: string; // base64 or URL
  logoMargin?: number;
  
  cornersSquareType: "dot" | "square" | "extra-rounded";
  cornersSquareColor: string;
}

export interface DynamicQRInfo {
  shortId: string;
  shortUrl: string;
  targetUrl: string;
}

// vCard Form Schema
export interface VCardData {
  firstName: string;
  lastName: string;
  organization: string;
  phone: string;
  email: string;
  title: string;
  website: string;
}

// Wi-Fi Form Schema
export interface WifiData {
  ssid: string;
  password?: string;
  encryption: "WPA" | "WEP" | "nopass";
  hidden: boolean;
}
