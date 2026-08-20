import { getAI, parseJson } from "../ai/provider";
import type { MasterProfile } from "../profile/schema";
import type { Prefiltered } from "./prefilter";

/**
 * ETAP 2 DOPASOWANIA — reranking przez model.
 *
 * DWIE ŚWIADOME DECYZJE, KTÓRE ODRÓŻNIAJĄ TO OD v0.4:
 *
 * 1. ŻADNYCH PROCENTÓW.
 *    v0.4 pokazywał "92% dopasowania". To fałszywa precyzja — nikt nie umie
 *    obronić różnicy między 87% a 84%, a użytkownik natychmiast zaczyna się
 *    z liczbą kłócić i traci zaufanie do całej reszty. Zamiast tego trzy pasma
 *    plus jawna lista luk. Pasmo da się uzasadnić, procent nie.
 *
 * 2. KAŻDE TWIERDZENIE MUSI CYTOWAĆ PROFIL.
 *    Model, mówiąc "pasujesz, bo masz doświadczenie w raportowaniu", musi podać
 *    identyfikator elementu profilu, z którego to wynika. Odwołania do
 *    nieistniejących identyfikatorów są odrzucane programowo. To nie jest
 *    prośba w prompcie — to filtr na wyniku. Prompt można zignorować, filtru nie.
 */

export type Band = "strong" | "good" | "stretch";

export type Ranked = {
  offerId: string;
  band: Band;
  /** Jedno zdanie po polsku, wprost do kandydata. */
  verdict: string;
  /** Co przemawia za — każdy punkt z odwołaniem do profilu. */
  strengths: { text: string; profileRefs: string[] }[];
  /** Czego brakuje, z rozróżnieniem: wymagane czy mile widziane. */
  gaps: { text: string; blocking: boolean }[];
  /** Na co zwrócić uwagę: nietypowa forma zatrudnienia, brak widełek, itp. */
  flags: string[];
};

export const BAND_LABEL: Record<Band, string> = {
  strong: "Mocne dopasowanie",
  good: "Dobre dopasowanie",
  stretch: "Ambitne — warto spróbować",
};

const SYSTEM = `Jesteś doświadczonym doradcą zawodowym oceniającym, czy oferta pracy pasuje
do konkretnego kandydata. Znasz polski rynek pracy.

ZASADY BEZWZGLĘDNE:

1. NIE PRZYPISUJESZ kandydatowi doświadczenia, którego nie ma w profilu.
   Każdy punkt w "strengths" musi mieć w profileRefs identyfikatory faktów
   z profilu, które go potwierdzają. Nie umiesz wskazać identyfikatora —
   nie piszesz tego punktu.

2. NIE UŻYWASZ PROCENTÓW ani liczbowych ocen. Przypisujesz pasmo:
   - strong  = kandydat spełnia wymagania kluczowe, braki są drugorzędne,
   - good    = solidne dopasowanie, brakuje 1–2 rzeczy wymaganych,
   - stretch = ciekawe, ale wymaga wyraźnego przeskoku lub uzupełnienia braków.

3. ROZRÓŻNIASZ wymagania konieczne od mile widzianych. W polskich ogłoszeniach
   "mile widziane", "dodatkowym atutem będzie", "nice to have" to NIE są wymogi.
   Braki w tych kategoriach mają blocking = false.

4. PISZESZ WPROST I KONKRETNIE, po polsku, bez korporacyjnej nowomowy.
   Dobrze: "Robiłaś dokładnie takie raporty, tylko w mniejszej skali."
   Źle: "Kandydatka wykazuje potencjał w obszarze kompetencji analitycznych."

5. JESTEŚ UCZCIWY. Jeśli oferta słabo pasuje — mówisz to. Zawyżanie ocen
   sprawia, że kandydat traci czas na aplikacje bez szans.

6. GDY NAZWA STANOWISKA NIE ODDAJE TREŚCI — mówisz o tym wprost w "verdict".
   W polskich ogłoszeniach nazwa bywa przypadkowa: "Specjalista ds. wsparcia
   biznesu" bywa czystą analityką, "Koordynator ds. administracji" bywa w 70%
   pracą w Excelu. Jeśli widzisz taki rozjazd, zaczynasz werdykt od jego
   nazwania, bo kandydat sam by na tę ofertę nie trafił.

7. W "flags" sygnalizujesz rzeczy, które kandydat powinien zauważyć:
   brak widełek, wyłącznie B2B, wymagana dyspozycyjność, praca zmianowa,
   ogłoszenie agencji pośrednictwa zamiast pracodawcy, bardzo szeroki zakres
   obowiązków wskazujący na łączenie kilku ról.`;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          offerId: { type: "string" },
          band: { type: "string", enum: ["strong", "good", "stretch"] },
          verdict: { type: "string" },
          strengths: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" }, profileRefs: { type: "array", items: { type: "string" } } },
              required: ["text", "profileRefs"],
            },
          },
          gaps: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" }, blocking: { type: "boolean" } },
              required: ["text", "blocking"],
            },
          },
          flags: { type: "array", items: { type: "string" } },
        },
        required: ["offerId", "band", "verdict", "strengths", "gaps", "flags"],
      },
    },
  },
  required: ["results"],
};

/** Ile ofert wysyłamy do modelu w jednym zapytaniu. Kompromis: koszt vs jakość uwagi modelu. */
const BATCH = 8;

export async function rerank(
  profile: MasterProfile,
  items: Prefiltered[],
  topN = 24
): Promise<Ranked[]> {
  const shortlist = items.slice(0, topN);
  if (shortlist.length === 0) return [];

  const profileBlock = renderProfile(profile);
  const validIds = collectIds(profile);
  const out: Ranked[] = [];

  for (let i = 0; i < shortlist.length; i += BATCH) {
    const batch = shortlist.slice(i, i + BATCH);
    const offersBlock = batch.map((x) => renderOffer(x)).join("\n\n---\n\n");

    const prompt = `PROFIL KANDYDATA
(każdy fakt ma identyfikator — używaj ich w polu profileRefs)

${profileBlock}

═══════════════════════════════════════

OFERTY DO OCENY (${batch.length}):

${offersBlock}

Oceń każdą ofertę osobno. Zwróć dokładnie ${batch.length} wyników, po jednym na ofertę.`;

    try {
      const raw = await getAI().generate(prompt, { system: SYSTEM, schema: SCHEMA, temperature: 0.3 });
      const parsed = parseJson<{ results: Ranked[] }>(raw);

      for (const r of parsed.results ?? []) {
        // KONTROLA ANTYHALUCYNACYJNA — filtr na wyniku, nie prośba w prompcie.
        const strengths = (r.strengths ?? [])
          .map((s) => ({ ...s, profileRefs: (s.profileRefs ?? []).filter((id) => validIds.has(id)) }))
          .filter((s) => s.profileRefs.length > 0);

        out.push({
          offerId: r.offerId,
          band: (["strong", "good", "stretch"] as Band[]).includes(r.band) ? r.band : "stretch",
          verdict: r.verdict ?? "",
          strengths,
          gaps: r.gaps ?? [],
          flags: r.flags ?? [],
        });
      }
    } catch (e) {
      console.warn("[rerank] partia nieudana:", (e as Error).message);
      // Awaria modelu nie może wyzerować wyników — zostaje ocena z prefiltru.
      for (const x of batch) {
        out.push({
          offerId: x.offer.id,
          band: x.rough >= 70 ? "strong" : x.rough >= 45 ? "good" : "stretch",
          verdict: "Ocena wstępna — nie udało się połączyć z modelem AI.",
          strengths: x.matched.slice(0, 4).map((s) => ({ text: `Masz doświadczenie z: ${s}`, profileRefs: [] })),
          gaps: x.missing.slice(0, 4).map((s) => ({ text: `Wymagane: ${s}`, blocking: true })),
          flags: [],
        });
      }
    }
  }
  return out;
}

function renderProfile(p: MasterProfile): string {
  const lines: string[] = [];
  if (p.headline.value) lines.push(`Profil zawodowy: ${p.headline.value}`);
  lines.push("\nDOŚWIADCZENIE:");
  for (const e of p.experience) {
    lines.push(`${e.id}: ${e.title.value ?? "?"} — ${e.company.value ?? "?"} (${e.from.value ?? "?"} – ${e.to.value ?? "obecnie"})`);
    for (const b of e.bullets) lines.push(`  ${b.id}: ${b.text}`);
  }
  lines.push("\nUMIEJĘTNOŚCI (poziom: core = potwierdzone wielokrotnie, used = stosowane, mentioned = tylko wymienione):");
  for (const s of p.skills) lines.push(`${s.id}: ${s.name} [${s.depth}]`);
  if (p.education.length) {
    lines.push("\nWYKSZTAŁCENIE:");
    for (const e of p.education) lines.push(`${e.id}: ${e.degree.value ?? ""} ${e.field.value ?? ""} — ${e.school.value ?? ""}`);
  }
  if (p.languages.length) {
    lines.push("\nJĘZYKI:");
    for (const l of p.languages) lines.push(`${l.id}: ${l.name} — ${l.level ?? "poziom nieokreślony"}`);
  }
  const pr = p.preferences;
  lines.push(`\nPREFERENCJE: tryb ${pr.remote}, lokalizacje: ${pr.locations.join(", ") || "dowolne"}, minimum ${pr.salaryMin ?? "nieokreślone"} ${pr.salaryCurrency}`);
  return lines.join("\n");
}

function renderOffer(x: Prefiltered): string {
  const o = x.offer;
  return [
    `ID OFERTY: ${o.id}`,
    `Stanowisko: ${o.title}`,
    `Firma: ${o.company ?? "nie podano"}`,
    `Lokalizacja: ${o.location ?? "nie podano"} | Tryb: ${o.remote}`,
    o.salaryMin ? `Wynagrodzenie: ${o.salaryMin}${o.salaryMax ? `–${o.salaryMax}` : ""} ${o.salaryCurrency}/${o.salaryPeriod}` : "Wynagrodzenie: nie podano",
    o.contract ? `Umowa: ${o.contract}` : "",
    `Źródło: ${o.sourceLabel}`,
    x.mismatch.flagged
      ? `UWAGA: system wykrył rozjazd między nazwą a treścią — ${Math.round(x.mismatch.requirementsFit * 100)}% wymagań pasuje do kandydata, mimo że nazwa stanowiska tego nie sugeruje.`
      : "",
    "",
    o.description.slice(0, 2200),
  ].filter(Boolean).join("\n");
}

function collectIds(p: MasterProfile): Set<string> {
  return new Set<string>([
    ...p.experience.flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]),
    ...p.skills.map((s) => s.id),
    ...p.education.map((e) => e.id),
    ...p.languages.map((l) => l.id),
    ...p.certificates.map((c) => c.id),
  ]);
}

/**
 * ANALIZA LUK — odwrócenie perspektywy.
 *
 * Zamiast pokazywać wyłącznie "te oferty do Ciebie pasują", pokazujemy też
 * "czego Ci brakuje, żeby pasowało ich znacznie więcej".
 *
 * To jest insight, którego nie da żaden portal z ofertami, bo żaden nie zna
 * profilu kandydata na tyle dobrze. Dla użytkownika to często cenniejsze niż
 * sama lista ofert — bo dotyczy nie tej jednej rekrutacji, tylko całej kariery.
 */
export function gapAnalysis(ranked: Ranked[]): { skill: string; blocksCount: number; share: number }[] {
  const counts = new Map<string, number>();
  for (const r of ranked) {
    for (const g of r.gaps.filter((x) => x.blocking)) {
      const key = g.text.toLowerCase().replace(/^(wymagane|brak|brakuje)[:\s]*/i, "").trim().slice(0, 48);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const total = Math.max(1, ranked.length);
  return [...counts.entries()]
    .map(([skill, blocksCount]) => ({ skill, blocksCount, share: Math.round((blocksCount / total) * 100) }))
    .filter((x) => x.blocksCount >= 2)
    .sort((a, b) => b.blocksCount - a.blocksCount)
    .slice(0, 8);
}
