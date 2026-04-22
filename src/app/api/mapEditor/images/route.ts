import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

const BASE = path.join(process.cwd(), "public", "images", "shenmaSanguo");
const IMAGE_EXT = /\.(webp|png|jpg|jpeg|gif)$/i;

async function listDir(sub: string): Promise<string[]> {
  try {
    const files = await readdir(path.join(BASE, sub));
    return files
      .filter((f) => IMAGE_EXT.test(f))
      .sort()
      .map((f) => `${sub}/${f}`);
  } catch {
    return [];
  }
}

export async function GET() {
  const [tiles, maps] = await Promise.all([listDir("tiles"), listDir("maps")]);
  return NextResponse.json({ tiles, maps });
}
