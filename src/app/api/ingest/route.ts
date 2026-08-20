import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/store";
import { extractSkills, parseRemote, parseSalary, type Offer } from "@/lib/sources/types";
import type { InboxStore } from "@/lib/sources/inbox";

export const runtime = "nodejs";

/**
 * ODBIÓR OFERT Z WTYCZKI DO PRZEGLĄDARKI.
 *
 * Wtyczka przesyła tu ofertę, którą użytkownik ma właśnie otwartą na
 * Pracuj.pl, OLX lub LinkedIn. Serwer działa lokalnie, na komputerze
 * użytkownika — dane nigdzie nie wychodzą.
 */

function authorized(req: Request): boolean {
  const expected = process.env.INGEST_TOKEN;
  if (!expected || expected.includes("zmien-mnie")) return false;
  return req.headers.get("x-ingest-token") === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "Brak lub nieprawidłowy token. Ustaw INGEST_TOKEN w .env.local i wpisz ten sam w opcjach wtyczki." },
      { status: 401 }
    );
  }

  const body = (await req.json()) as {
    url: string; title: string; company?: string; location?: string;
    salary?: string; contract?: string; description: string; portal: string;
  };

  if (!body.url || !body.title) {
    return NextResponse.json({ error: "Brak wymaganych pól: url, title." }, { status: 400 });
  }

  const sal = parseSalary(body.salary);
  const offer: Offer = {
    id: `inbox:${hash(body.url)}`,
    source: "inbox",
    sourceLabel: body.portal || "Wtyczka",
    title: body.title.trim(),
    company: body.company?.trim() || null,
    location: body.location?.trim() || null,
    remote: parseRemote(`${body.title} ${body.location ?? ""} ${body.description}`),
    salaryMin: sal.min, salaryMax: sal.max,
    salaryCurrency: sal.currency, salaryPeriod: sal.period,
    contract: body.contract ?? null,
    description: (body.description ?? "").slice(0, 8000),
    skills: extractSkills(`${body.title} ${body.description ?? ""}`),
    publishedAt: new Date().toISOString(),
    url: body.url,
  };

  const store = await readJson<InboxStore>("inbox.json", { offers: [] });
  const idx = store.offers.findIndex((o) => o.id === offer.id);
  if (idx >= 0) store.offers[idx] = offer; else store.offers.unshift(offer);
  store.offers = store.offers.slice(0, 500);
  await writeJson("inbox.json", store);

  return NextResponse.json({ ok: true, id: offer.id, total: store.offers.length });
}

export async function GET() {
  const store = await readJson<InboxStore>("inbox.json", { offers: [] });
  return NextResponse.json({ total: store.offers.length, offers: store.offers.slice(0, 50) });
}

export async function DELETE() {
  await writeJson("inbox.json", { offers: [] });
  return NextResponse.json({ ok: true });
}

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };
