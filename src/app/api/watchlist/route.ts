import { NextResponse } from "next/server";
import { addCompany, getWatchlist, refreshAll, removeCompany } from "@/lib/sources/watchlist";
import { suggestCompanies } from "@/lib/ai/suggest-companies";
import { readJson } from "@/lib/store";
import { emptyProfile, type MasterProfile } from "@/lib/profile/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const w = await getWatchlist();
  return NextResponse.json({
    companies: w.companies.map((c) => ({
      id: c.id, name: c.name, careerUrl: c.careerUrl,
      lastChecked: c.lastChecked, lastError: c.lastError,
      offerCount: c.offers.length, failCount: c.failCount,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { action: string; name?: string; url?: string; id?: string };

  if (body.action === "add") {
    if (!body.name || !body.url) {
      return NextResponse.json({ error: "Podaj nazwę firmy i adres zakładki Kariera." }, { status: 400 });
    }
    await addCompany(body.name, body.url);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove" && body.id) {
    await removeCompany(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "refresh") {
    const w = await refreshAll(true);
    return NextResponse.json({
      ok: true,
      companies: w.companies.map((c) => ({
        id: c.id, name: c.name, careerUrl: c.careerUrl,
        lastChecked: c.lastChecked, lastError: c.lastError,
        offerCount: c.offers.length, failCount: c.failCount,
      })),
    });
  }

  if (body.action === "suggest") {
    const profile = await readJson<MasterProfile>("profile.json", emptyProfile());
    if (profile.skills.length === 0 && profile.experience.length === 0) {
      return NextResponse.json({ error: "Najpierw wgraj CV — bez profilu nie ma na czym oprzeć podpowiedzi." }, { status: 400 });
    }
    const suggestions = await suggestCompanies(profile);
    return NextResponse.json({ suggestions });
  }

  return NextResponse.json({ error: "Nieznana operacja." }, { status: 400 });
}
