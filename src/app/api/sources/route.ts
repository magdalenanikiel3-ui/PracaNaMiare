import { NextResponse } from "next/server";
import { sourceStatuses } from "@/lib/sources/registry";
import { getAI } from "@/lib/ai/provider";

export const runtime = "nodejs";

export async function GET() {
  let ai: { ok: boolean; name?: string; error?: string };
  try {
    ai = { ok: true, name: getAI().name };
  } catch (e) {
    ai = { ok: false, error: (e as Error).message };
  }
  return NextResponse.json({ sources: sourceStatuses(), ai });
}
