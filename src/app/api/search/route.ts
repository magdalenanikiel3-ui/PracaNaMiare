import { NextResponse } from "next/server";
import { buildQueries, buildSkillQueries, fromMarket, mergeDirections, type Direction } from "@/lib/ai/expand-queries";
import { prefilter } from "@/lib/matching/prefilter";
import { gapAnalysis, rerank, type Ranked } from "@/lib/matching/rerank";
import { searchAll, setActiveFamilies } from "@/lib/sources/registry";
import { readJson, writeJson } from "@/lib/store";
import { emptyProfile, type MasterProfile } from "@/lib/profile/schema";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * PEŁNY PRZEBIEG WYSZUKIWANIA
 *
 *   profil
 *     → kierunki zawodowe (taksonomia + AI)
 *     → frazy wyszukiwania
 *     → równoległe odpytanie wszystkich źródeł
 *     → deduplikacja
 *     → ODKRYWANIE ZWROTNE: czego rynek naprawdę szuka u kogoś takiego
 *     → drugi przebieg z nowo odkrytymi nazwami
 *     → prefiltr deterministyczny (tani)
 *     → reranking AI na czubku listy (drogi)
 *     → analiza luk
 *
 * Drugi przebieg to sedno rozwiązania problemu "nie wiem, jakie stanowisko wpisać".
 * Pierwszy przebieg jest zgadywaniem. Drugi korzysta już ze słownika,
 * którego system nauczył się z prawdziwych ogłoszeń.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as { skipRerank?: boolean };

  const profile = await readJson<MasterProfile>("profile.json", emptyProfile());
  if (profile.experience.length === 0 && profile.skills.length === 0) {
    return NextResponse.json({ error: "Najpierw wgraj CV." }, { status: 400 });
  }

  const store = await readJson<{ directions: Direction[] }>("directions.json", { directions: [] });
  let directions = store.directions.filter((d) => d.accepted);
  if (directions.length === 0) {
    return NextResponse.json({
      error: "Nie zaznaczono żadnego kierunku. Wejdź w „Kierunki” i zaznacz przynajmniej jeden.",
    }, { status: 400 });
  }

  // Aktywacja serwisów branżowych na podstawie rodzin zawodowych z wybranych
  // kierunków — dzięki temu mechanizm działa dla każdego zawodu, nie tylko
  // dla tych, pod które ktoś ręcznie napisał konektor.
  setActiveFamilies([...new Set(directions.map((d) => d.family))]);

  const pref = profile.preferences;
  const common = {
    location: pref.locations[0] ?? null,
    remote: pref.remote,
    salaryMin: pref.salaryMin,
  };

  // ── PRZEBIEG 1 — dwie osie naraz ─────────────────────────────────────────
  //
  // OŚ A: nazwy stanowisk. Łapie oferty nazwane tak, jak się tego spodziewamy.
  //
  // OŚ B: kombinacje wymagań. Łapie oferty, których NAZWA jest myląca,
  //       ale których TREŚĆ pasuje do profilu. To jest ta druga oś, bez której
  //       samo szukanie po nazwach z definicji przegapia dobre oferty —
  //       „Specjalista ds. wsparcia biznesu" nigdy nie wypadnie z zapytania
  //       „Analityk BI", choć bywa dokładnie tą pracą.
  const qTitles = buildQueries(directions, pref.market);
  const qSkills = buildSkillQueries(profile);
  const q1 = [...new Set([...qTitles, ...qSkills])];

  const pass1 = await searchAll({ ...common, queries: q1, maxResults: 160 });

  // ── ODKRYWANIE ZWROTNE ────────────────────────────────────────────────────
  const discovered = fromMarket(profile, pass1.offers);
  const newOnes = discovered.filter((d) => !directions.some((x) => x.id === d.id));

  // ── PRZEBIEG 2 — wyłącznie nowe nazwy ─────────────────────────────────────
  let pass2offers: typeof pass1.offers = [];
  if (newOnes.length > 0) {
    const q2 = buildQueries(newOnes, pref.market).filter((q) => !q1.includes(q));
    if (q2.length) {
      const r = await searchAll({ ...common, queries: q2.slice(0, 6), maxResults: 80 });
      pass2offers = r.offers;
      for (const ps of r.perSource) {
        const ex = pass1.perSource.find((x) => x.id === ps.id);
        if (ex) ex.count += ps.count; else pass1.perSource.push(ps);
      }
    }
    directions = mergeDirections([directions, discovered]);
    await writeJson("directions.json", { directions });
  }

  const allOffers = [...pass1.offers, ...pass2offers];

  // ── PREFILTR (darmowy) ────────────────────────────────────────────────────
  const { passed, rejected } = prefilter(profile, allOffers);

  // ── RERANKING AI (płatny, tylko czubek listy) ─────────────────────────────
  // Ile ofert trafia do oceny AI.
  //
  // Kazde 8 ofert = jedno zapytanie do modelu. Przy darmowym limicie
  // 10 zapytan na minute domyslne 12 ofert (2 zapytania) zostawia zapas
  // na analize CV, kierunki i czytanie stron firm.
  // Przy platnym rozliczeniu smialo podnies RERANK_MAX_OFFERS do 24 lub wiecej.
  const topN = Math.max(4, Math.min(48, Number(process.env.RERANK_MAX_OFFERS ?? 12)));

  let ranked: Ranked[] = [];
  let aiError: string | null = null;
  if (!body.skipRerank && passed.length > 0) {
    const r = await rerank(profile, passed, topN);
    ranked = r.ranked;
    aiError = r.error;
  }

  const rankMap = new Map(ranked.map((r) => [r.offerId, r]));
  const bandOrder = { strong: 0, good: 1, stretch: 2 } as const;

  const results = passed.map((x) => ({
    offer: x.offer,
    rough: x.rough,
    matched: x.matched,
    missing: x.missing,
    mismatch: x.mismatch,
    ranked: rankMap.get(x.offer.id) ?? null,
  })).sort((a, b) => {
    const ab = a.ranked ? bandOrder[a.ranked.band] : 3;
    const bb = b.ranked ? bandOrder[b.ranked.band] : 3;
    return ab !== bb ? ab - bb : b.rough - a.rough;
  });

  const payload = {
    results,
    /** Prawdziwa przyczyna, gdy ocena AI się nie powiodła — pokazywana w interfejsie. */
    aiError,
    /** Oferty, na które użytkownik sam by nie trafił — nazwa nie pasuje, treść tak. */
    hidden: results
      .filter((r) => r.mismatch.flagged)
      .slice(0, 8)
      .map((r) => ({
        offerId: r.offer.id,
        title: r.offer.title,
        company: r.offer.company,
        explanation: r.mismatch.explanation,
      })),
    gaps: gapAnalysis(ranked),
    /** Nazwy odkryte z rynku — to jest ta wartość, której nie da wyszukiwarka portalu. */
    discovered: newOnes.map((d) => ({ pl: d.pl, why: d.why })),
    perSource: pass1.perSource,
    stats: {
      found: allOffers.length,
      afterPrefilter: passed.length,
      rejected: rejected.length,
      reranked: ranked.length,
      queries: q1.length,
      topN,
      queriesByTitle: qTitles.length,
      queriesBySkill: qSkills.length,
      hiddenFound: passed.filter((x) => x.mismatch.flagged).length,
      ms: Date.now() - t0,
    },
    rejectedSample: rejected.slice(0, 20).map((r) => ({ title: r.offer.title, company: r.offer.company, reason: r.rejected })),
  };

  await writeJson("last-search.json", payload);
  return NextResponse.json(payload);
}

export async function GET() {
  return NextResponse.json(await readJson("last-search.json", { results: [], gaps: [], perSource: [], stats: null }));
}
