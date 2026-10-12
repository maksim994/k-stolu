import { NextResponse } from "next/server";
import { getPool, initialize } from "@/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await initialize();
    await getPool().query(
      "SELECT version FROM schema_migrations WHERE version=1",
    );
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
