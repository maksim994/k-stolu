import { NextResponse } from "next/server";
import { z } from "zod";
import { login, logout, isAdmin } from "@/server/auth";
import { checkOrigin, readJson, apiError } from "@/server/http";
export async function GET() {
  try {
    return NextResponse.json(
      { authenticated: await isAdmin() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { password } = z
      .object({ password: z.string().min(1).max(256) })
      .parse(await readJson(request, 2000));
    await login(password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    await logout();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
