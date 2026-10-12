import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { saveCollection } from "@/server/db";
import { apiError, checkOrigin, readJson } from "@/server/http";

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    await requireAdmin();
    return NextResponse.json(await saveCollection(await readJson(request)));
  } catch (error) {
    return apiError(error);
  }
}
