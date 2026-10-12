import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/server/auth";
import { apiError, checkOrigin, HttpError } from "@/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requireAdmin();
    const raw = Number(request.headers.get("content-length"));
    if (!Number.isFinite(raw) || raw <= 0 || raw > 5_300_000)
      throw new HttpError(413, "Изображение должно быть меньше 5 МБ");
    const data = await request.formData();
    const file = data.get("image");
    if (!(file instanceof File) || file.size > 5_000_000)
      throw new HttpError(400, "Выберите изображение до 5 МБ");
    const buffer = Buffer.from(await file.arrayBuffer());
    let extension = "";
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      extension = "png";
    else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
      extension = "jpg";
    else if (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    )
      extension = "webp";
    else throw new HttpError(400, "Поддерживаются PNG, JPEG и WebP");
    const name = `${randomUUID()}.${extension}`;
    const directory =
      process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".local", "uploads");
    await mkdir(directory, { recursive: true });
    await writeFile(
      /* turbopackIgnore: true */ path.join(
        /* turbopackIgnore: true */ directory,
        name,
      ),
      buffer,
    );
    return NextResponse.json({ path: `/media/${name}` });
  } catch (e) {
    return apiError(e);
  }
}
