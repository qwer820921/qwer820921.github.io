import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "tile";
    let name = (formData.get("name") as string) || "";

    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "no name" }, { status: 400 });

    // 確保副檔名為 .webp
    name = name.replace(/\.[^.]+$/, "") + ".webp";

    const subfolder = type === "map" ? "maps" : "tiles";
    const dir = path.join(
      process.cwd(),
      "public",
      "images",
      "shenmaSanguo",
      subfolder
    );
    await mkdir(dir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(path.join(dir, name), Buffer.from(bytes));

    return NextResponse.json({ path: `${subfolder}/${name}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
