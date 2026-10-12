import { readFile } from "node:fs/promises";
import path from "node:path";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name))
    return new Response(null, { status: 404 });
  try {
    const file = await readFile(
      /* turbopackIgnore: true */ path.join(
        /* turbopackIgnore: true */ process.env.UPLOAD_DIR ??
          path.join(process.cwd(), ".local", "uploads"),
        name,
      ),
    );
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": name.endsWith(".png")
          ? "image/png"
          : name.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg",
        "Cache-Control": "public,max-age=31536000,immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
