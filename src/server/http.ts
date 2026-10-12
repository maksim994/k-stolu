import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_ORIGIN ?? request.url).origin;
  if (!origin || origin !== expected)
    throw new HttpError(
      403,
      "Запрос отклонён. Обновите страницу и попробуйте снова.",
    );
}
export async function readJson(request: Request, limit = 2_000_000) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Пустой запрос");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Файл слишком большой");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Проверьте формат JSON");
  }
}
export function apiError(e: unknown) {
  if (e instanceof HttpError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .slice(0, 5)
          .join("; "),
      },
      { status: 400 },
    );
  if ((e as { code?: string })?.code === "23505")
    return NextResponse.json(
      { error: "Такой адрес уже существует. Измените slug." },
      { status: 409 },
    );
  console.error(
    "Server operation failed",
    e instanceof Error ? e.name : "Unknown",
  );
  return NextResponse.json(
    {
      error:
        "Не удалось выполнить действие. Проверьте подключение к базе и попробуйте снова.",
    },
    { status: 503 },
  );
}
