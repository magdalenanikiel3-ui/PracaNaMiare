import { NextResponse } from "next/server";
import { sourceStatuses } from "@/lib/sources/registry";
import { getAI, maxRequestsPerMinute } from "@/lib/ai/provider";

export const runtime = "nodejs";

export async function GET() {
  let ai: { ok: boolean; name?: string; error?: string; rpm?: number; model?: string };
  try {
    ai = {
      ok: true,
      name: getAI().name,
      rpm: maxRequestsPerMinute(),
      model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    };
  } catch (e) {
    ai = { ok: false, error: (e as Error).message };
  }
  return NextResponse.json({ sources: sourceStatuses(), ai });
}
