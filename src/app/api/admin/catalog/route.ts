import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { getCatalog, importCatalog, saveRecipe } from "@/server/db";
import { checkOrigin, readJson, apiError } from "@/server/http";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const catalog = await getCatalog(true);
    return NextResponse.json(
      { version: 1, ...catalog },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(new URL(request.url).searchParams.has("download")
            ? {
                "Content-Disposition":
                  'attachment; filename="k-stolu-recipes.json"',
              }
            : {}),
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    await requireAdmin();
    return NextResponse.json(await saveRecipe(await readJson(request)));
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requireAdmin();
    const result = await importCatalog(await readJson(request));
    return NextResponse.json({ ok: true, count: result.recipes.length });
  } catch (e) {
    return apiError(e);
  }
}
