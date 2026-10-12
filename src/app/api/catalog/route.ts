import { NextResponse } from "next/server";
import { getCatalog } from "@/server/db";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getCatalog(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
