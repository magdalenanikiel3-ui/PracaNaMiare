import { getAI, parseJson } from "./provider";
import type { MasterProfile } from "../profile/schema";
import { familiesForSkills, lookupTitle, translateTitle, FAMILY_LABELS, type Family } from "../taxonomy/pl-titles";
import type { Offer } from "../sources/types";

/**
 * SILNIK EKSPANSJI ZAPYTAŃ — rdzeń produktu.
 *
 * Problem użytkownika: "nie wiadomo, jakie stanowisko wpisać, żeby znaleźć
 * ciekawą ofertę spełniającą moje oczekiwania".
 *
 * To NIE jest problem tłumaczenia PL→EN i nie rozwiązuje go lista stałych ról.
 * To są trzy osobne problemy naraz:
 *
 *   1. Nie znasz słownika rynku. Robisz od 4 lat raporty w Excelu i SQL,
 *      a rynek nazywa to "Reporting Analyst", "MIS Specialist" albo
 *      "Specjalista ds. controllingu" — i nie wpadniesz na żadną z tych nazw.
 *   2. Nie wiesz, dokąd Twoje doświadczenie może Cię przenieść. Ta sama osoba
 *      może aplikować na analitykę, controlling ALBO operacje — zależy, co
 *      uwypukli.
 *   3. Ten sam zawód nazywa się inaczej na każdym portalu i w każdej firmie.
 *
 * Dlatego kandydatów na stanowiska generujemy TRZEMA niezależnymi drogami
 * i łączymy wyniki. Każda łapie coś, czego nie łapią pozostałe:
 *
 *   A) TAKSONOMIA     — deterministyczna, darmowa, natychmiastowa, nie halucynuje.
 *   B) MODEL AI       — kreatywny, wychodzi poza listę, rozumie nietypowe ścieżki.
 *   C) ODKRYWANIE ZWROTNE — uczy się z rynku: patrzy, jak NAPRAWDĘ nazywają się
 *      ogłoszenia, w których wymagania pokrywają się z Twoim profilem.
 *      To najmocniejsza z trzech dróg, bo nie zgaduje słownika — czyta go.
 */

export type Direction = {
  id: string;
  /** Nazwa po polsku — tak, jak myśli o tym użytkownik. */
  pl: string;
  /** Warianty angielskie i synonimy — tak, jak nazywa to rynek. */
  variants: string[];
  family: Family;
  familyLabel: string;
  /** Skąd wziął się ten kandydat. Pokazujemy to użytkownikowi. */
  origin: ("taxonomy" | "ai" | "market")[];
  /** Dlaczego to pasuje — po ludzku, jednym zdaniem. */
  why: string;
  /** Które elementy profilu to potwierdzają (id z Master Profile). NIE wolny tekst. */
  basedOn: string[];
  /** Jak daleko od obecnego doświadczenia. Sterują tym, jak agresywnie szukamy. */
  stretch: "core" | "adjacent" | "pivot";
  /** Wyliczana przez nas, nie deklarowana przez model. */
  score: number;
  accepted?: boolean;
};

/** Deterministyczne wyciągnięcie sygnałów z profilu — bez udziału modelu. */
export function profileSignals(p: MasterProfile) {
  const skills = p.skills.map((s) => s.name);
  const coreSkills = p.skills.filter((s) => s.depth === "core").map((s) => s.name);
  const usedSkills = p.skills.filter((s) => s.depth !== "mentioned").map((s) => s.name);
  const titles = p.experience.map((e) => e.title.value).filter(Boolean) as string[];
  const industries = p.experience.map((e) => e.industry?.value).filter(Boolean) as string[];

  // Staż liczony z dat, nie deklarowany. Prosty i wystarczający heurystyk.
  let months = 0;
  for (const e of p.experience) {
    const from = parseYm(e.from.value);
    const to = parseYm(e.to.value) ?? new Date();
    if (from) months += Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()));
  }
  const years = Math.round((months / 12) * 10) / 10;

  const seniority: "junior" | "mid" | "senior" | "lead" =
    years < 2 ? "junior" : years < 5 ? "mid" : years < 9 ? "senior" : "lead";

  return { skills, coreSkills, usedSkills, titles, industries, years, seniority };
}

function parseYm(v: string | null): Date | null {
  if (!v) return null;
  const m = v.match(/(\d{4})[-./]?(\d{1,2})?/);
  if (!m) return null;
  return new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, 1);
}

/** DROGA A — taksonomia. Zero kosztu, zero halucynacji, ograniczony zasięg. */
function fromTaxonomy(p: MasterProfile): Direction[] {
  const sig = profileSignals(p);
  return familiesForSkills(sig.usedSkills).map((t) => ({
    id: slug(t.pl),
    pl: t.pl,
    variants: t.en,
    family: t.family,
    familyLabel: FAMILY_LABELS[t.family],
    origin: ["taxonomy"] as ("taxonomy" | "ai" | "market")[],
    why: `Twoje umiejętności pokrywają się z typowymi wymaganiami na tym stanowisku.`,
    basedOn: p.skills.filter((s) => t.signals.some((x) => s.canonical.includes(x.replace(/\s/g, "")))).map((s) => s.id),
    stretch: sig.titles.some((x) => x.toLowerCase().includes(t.pl.toLowerCase().split(" ")[0])) ? "core" as const : "adjacent" as const,
    score: 0,
  }));
}

const AI_SYSTEM = `Jesteś doradcą zawodowym znającym polski rynek pracy i to, jak NAPRAWDĘ
nazywane są ogłoszenia na Pracuj.pl, OLX, LinkedIn i portalach branżowych.

Twoje zadanie: na podstawie profilu kandydata zaproponuj nazwy stanowisk, pod którymi
warto szukać ofert. Kandydat sam nie wie, czego szukać — Twoim zadaniem jest podać mu
słownik rynku.

ZASADY BEZWZGLĘDNE:
1. NIE WYMYŚLAJ doświadczenia. Opierasz się wyłącznie na tym, co jest w profilu.
2. Każda propozycja musi mieć wskazanie, KTÓRE elementy profilu ją uzasadniają —
   podajesz ich identyfikatory z pola basedOn. Jeśli nie umiesz wskazać żadnego,
   nie proponuj tego stanowiska.
3. Podawaj realne nazwy z polskich ogłoszeń, a nie opisy ról. Dobrze:
   "Specjalista ds. controllingu". Źle: "osoba zajmująca się analizą kosztów".
4. Uwzględnij trzy poziomy:
   - core     = to, czym kandydat już jest, tylko inaczej nazwane na rynku,
   - adjacent = realne przejście bez przekwalifikowania, przy tych samych umiejętnościach,
   - pivot    = ambitna zmiana kierunku, wymagająca uzupełnienia jednej–dwóch rzeczy.
5. Dla każdego stanowiska podaj warianty: polski, angielski i realne synonimy
   spotykane w ogłoszeniach (np. "MIS Analyst", "Specjalista ds. sprawozdawczości").
6. Nie ograniczaj się do zawodów biurowych, jeśli profil na to nie wskazuje.
7. Pole "why" pisz po polsku, jednym zdaniem, wprost do kandydata.`;

const AI_SCHEMA = {
  type: "object",
  properties: {
    directions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pl: { type: "string" },
          variants: { type: "array", items: { type: "string" } },
          family: { type: "string" },
          why: { type: "string" },
          basedOn: { type: "array", items: { type: "string" } },
          stretch: { type: "string", enum: ["core", "adjacent", "pivot"] },
        },
        required: ["pl", "variants", "family", "why", "basedOn", "stretch"],
      },
    },
  },
  required: ["directions"],
};

/** DROGA B — model. Wychodzi poza taksonomię, ale wymaga kontroli. */
async function fromAI(p: MasterProfile): Promise<Direction[]> {
  const sig = profileSignals(p);

  // Modelowi podajemy profil w formie, w której KAŻDY fakt ma identyfikator.
  // Dzięki temu możemy potem sprawdzić, czy basedOn wskazuje na coś istniejącego.
  const facts = [
    ...p.experience.flatMap((e) => [
      `${e.id}: stanowisko "${e.title.value ?? "?"}" w "${e.company.value ?? "?"}" (${e.from.value ?? "?"} – ${e.to.value ?? "obecnie"})`,
      ...e.bullets.map((b) => `${b.id}: ${b.text}`),
    ]),
    ...p.skills.map((s) => `${s.id}: umiejętność "${s.name}" (${s.category}, poziom: ${s.depth})`),
    ...p.education.map((e) => `${e.id}: ${e.degree.value ?? ""} ${e.field.value ?? ""} — ${e.school.value ?? ""}`),
    ...p.languages.map((l) => `${l.id}: język ${l.name} — ${l.level ?? "poziom nieokreślony"}`),
  ].join("\n");

  const prompt = `PROFIL KANDYDATA (każdy fakt ma identyfikator — używaj ich w basedOn):

${facts}

PODSUMOWANIE: ok. ${sig.years} lat doświadczenia, poziom ${sig.seniority}.
Branże: ${sig.industries.join(", ") || "nieokreślone"}.

Dostępne rodziny zawodowe (pole family, użyj dokładnie jednej z tych wartości):
${Object.entries(FAMILY_LABELS).map(([k, v]) => `${k} = ${v}`).join("\n")}

Zaproponuj 8–14 stanowisk: kilka core, kilka adjacent, 2–3 pivot.`;

  const raw = await getAI().generate(prompt, { system: AI_SYSTEM, schema: AI_SCHEMA, temperature: 0.7 });
  const out = parseJson<{ directions: Array<Omit<Direction, "id" | "familyLabel" | "origin" | "score">> }>(raw);

  // Zbiór istniejących identyfikatorów — do odsiania zmyślonych odwołań.
  const validIds = new Set<string>([
    ...p.experience.flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]),
    ...p.skills.map((s) => s.id),
    ...p.education.map((e) => e.id),
    ...p.languages.map((l) => l.id),
  ]);

  return (out.directions ?? [])
    .map((d) => ({
      ...d,
      id: slug(d.pl),
      family: (FAMILY_LABELS[d.family as Family] ? d.family : "inne") as Family,
      familyLabel: FAMILY_LABELS[(FAMILY_LABELS[d.family as Family] ? d.family : "inne") as Family],
      origin: ["ai"] as ("taxonomy" | "ai" | "market")[],
      // Kontrola antyhalucynacyjna: zostawiamy tylko odwołania, które naprawdę istnieją.
      basedOn: (d.basedOn ?? []).filter((x) => validIds.has(x)),
      score: 0,
    }))
    // Propozycja bez ANI JEDNEGO prawdziwego oparcia w profilu jest odrzucana.
    .filter((d) => d.basedOn.length > 0);
}

/**
 * DROGA C — ODKRYWANIE ZWROTNE.
 *
 * Najciekawsza z trzech. Zamiast zgadywać, jak rynek nazywa daną pracę,
 * bierzemy oferty znalezione w pierwszym, szerokim przebiegu i sprawdzamy,
 * które z nich mają wysokie pokrycie z umiejętnościami kandydata.
 * Tytuły TYCH ofert są prawdziwym słownikiem rynku dla tego profilu.
 *
 * Efekt: system podpowiada nazwy, na które kandydat nigdy by nie wpadł,
 * bo pochodzą z realnych ogłoszeń, a nie z niczyjej wyobraźni.
 */
export function fromMarket(p: MasterProfile, offers: Offer[], minOverlap = 0.34): Direction[] {
  const mine = new Set(p.skills.filter((s) => s.depth !== "mentioned").map((s) => s.canonical));
  if (mine.size === 0) return [];

  const buckets = new Map<string, { title: string; count: number; overlapSum: number; sample: Offer }>();

  for (const o of offers) {
    const req = new Set((o.skills ?? []).map((s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+#.]/g, "")));
    if (req.size === 0) continue;
    let hit = 0;
    for (const r of req) if (mine.has(r)) hit++;
    const overlap = hit / req.size;
    if (overlap < minOverlap) continue;

    const key = normalizeTitle(o.title);
    const b = buckets.get(key);
    if (b) { b.count++; b.overlapSum += overlap; }
    else buckets.set(key, { title: o.title, count: 1, overlapSum: overlap, sample: o });
  }

  return [...buckets.values()]
    .filter((b) => b.count >= 2) // pojedyncze ogłoszenie to szum, nie wzorzec
    .sort((a, b) => b.overlapSum / b.count - a.overlapSum / a.count)
    .slice(0, 10)
    .map((b) => {
      const avg = Math.round((b.overlapSum / b.count) * 100);
      return {
        id: slug(b.title),
        pl: b.title,
        variants: translateTitle(b.title),
        family: (lookupTitle(b.title)?.family ?? "inne") as Family,
        familyLabel: FAMILY_LABELS[(lookupTitle(b.title)?.family ?? "inne") as Family],
        origin: ["market"] as ("taxonomy" | "ai" | "market")[],
        why: `Znaleziono ${b.count} ogłoszeń pod tą nazwą, w których średnio ${avg}% wymagań pokrywa się z Twoimi umiejętnościami.`,
        basedOn: p.skills.filter((s) => (b.sample.skills ?? []).some((x) => s.canonical === x.toLowerCase().replace(/[^a-z0-9+#.]/g, ""))).map((s) => s.id),
        stretch: "core" as const,
        score: 0,
      };
    });
}

/** Scalenie trzech dróg. Kandydat znaleziony wieloma drogami jest mocniejszy. */
export function mergeDirections(groups: Direction[][]): Direction[] {
  const byId = new Map<string, Direction>();

  for (const g of groups) {
    for (const d of g) {
      const prev = byId.get(d.id);
      if (!prev) { byId.set(d.id, { ...d }); continue; }
      prev.origin = [...new Set([...prev.origin, ...d.origin])];
      prev.variants = [...new Set([...prev.variants, ...d.variants])];
      prev.basedOn = [...new Set([...prev.basedOn, ...d.basedOn])];
      // "market" ma najmocniejsze uzasadnienie, bo pochodzi z realnych ogłoszeń.
      if (d.origin.includes("market")) prev.why = d.why;
      const rank = { core: 0, adjacent: 1, pivot: 2 };
      if (rank[d.stretch] < rank[prev.stretch]) prev.stretch = d.stretch;
    }
  }

  for (const d of byId.values()) {
    // Punktacja wyliczana, nie deklarowana przez model:
    //   zgodność wielu niezależnych dróg + siła oparcia w profilu + bliskość doświadczenia.
    const originScore = d.origin.length * 22 + (d.origin.includes("market") ? 18 : 0);
    const evidenceScore = Math.min(30, d.basedOn.length * 6);
    const stretchScore = { core: 25, adjacent: 14, pivot: 4 }[d.stretch];
    d.score = Math.min(100, originScore + evidenceScore + stretchScore);
  }

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/** Pierwszy przebieg: taksonomia + AI. Odkrywanie zwrotne dochodzi po pierwszym wyszukaniu. */
export async function proposeDirections(p: MasterProfile): Promise<Direction[]> {
  const tax = fromTaxonomy(p);
  let ai: Direction[] = [];
  try {
    ai = await fromAI(p);
  } catch (e) {
    // Model może być niedostępny (brak klucza, limit) — taksonomia musi wystarczyć.
    console.warn("[expand] ekspansja AI nieudana, zostaje taksonomia:", (e as Error).message);
  }
  return mergeDirections([tax, ai]);
}

/**
 * ZAPYTANIA PO WYMAGANIACH — druga oś wyszukiwania.
 *
 * DLACZEGO TO ISTNIEJE:
 * Nazwa stanowiska w polskim ogłoszeniu bywa przypadkowa. „Specjalista ds.
 * wsparcia biznesu" to często czysta analityka. „Koordynator ds. administracji"
 * bywa w 70% pracą w Excelu. Nazwa mówi, jak firma nazywa etat w swojej
 * strukturze — a nie co się w nim robi.
 *
 * Wyszukiwanie wyłącznie po nazwach z definicji przegapia takie oferty,
 * a to często najlepsze dopasowania, bo mało kto po nie sięga.
 *
 * Rozwiązanie: obok „Analityk BI" pytamy portale również o „Power BI SQL".
 * Wyszukiwarki portali przeszukują treść ogłoszenia, więc zwrócą ofertę
 * niezależnie od tego, jak dziwnie została nazwana.
 *
 * Dobieramy wyłącznie umiejętności ROZRÓŻNIAJĄCE. „Komunikatywność" czy
 * „praca w zespole" są w każdym ogłoszeniu i jako zapytanie nie niosą
 * żadnej informacji.
 */
export function buildSkillQueries(p: MasterProfile, max = 4): string[] {
  // Umiejętności miękkie odpadają — nie zawężają wyników.
  const useful = p.skills
    .filter((s) => s.category !== "soft")
    .filter((s) => s.depth !== "mentioned")
    .sort((a, b) => {
      const rank = { core: 0, used: 1, mentioned: 2 };
      if (rank[a.depth] !== rank[b.depth]) return rank[a.depth] - rank[b.depth];
      // Przy równym poziomie preferujemy techniczne i narzędzia — są konkretniejsze.
      const cat = (c: string) => (c === "technical" || c === "tool" ? 0 : 1);
      return cat(a.category) - cat(b.category);
    });

  if (useful.length === 0) return [];

  const out: string[] = [];

  // Pary najmocniejszych umiejętności — para zawęża lepiej niż pojedyncze słowo,
  // a nie tak agresywnie jak trójka.
  for (let i = 0; i < Math.min(useful.length, max + 1); i += 2) {
    const a = useful[i];
    const b = useful[i + 1];
    out.push(b ? `${a.name} ${b.name}` : a.name);
    if (out.length >= max) break;
  }

  // Jedna fraza łącząca najmocniejszą umiejętność z branżą — łapie oferty,
  // w których nazwa jest lokalna, a kontekst branżowy się zgadza.
  const industry = p.experience.map((e) => e.industry?.value).filter(Boolean)[0];
  if (industry && useful[0] && out.length < max + 1) {
    out.push(`${useful[0].name} ${industry}`);
  }

  return [...new Set(out)];
}

/**
 * Zamiana kierunków na konkretne ciągi wyszukiwania.
 * Każdy portal ma inne zwyczaje, więc konektory dostają listę fraz,
 * a nie jedno zapytanie.
 */
export function buildQueries(dirs: Direction[], market: "pl" | "international" | "all"): string[] {
  const out = new Set<string>();
  for (const d of dirs.filter((x) => x.accepted !== false)) {
    if (market !== "international") out.add(d.pl);
    if (market !== "pl") for (const v of d.variants) out.add(v);
    if (market === "pl" && out.size === 0) for (const v of d.variants) out.add(v);
  }
  return [...out];
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const normalizeTitle = (s: string) =>
  s.toLowerCase()
   .replace(/\b(junior|mid|middle|senior|starszy|młodszy|regular|lead|principal|st\.)\b/g, "")
   .replace(/\s*\(.*?\)\s*/g, " ")
   .replace(/\s*[-–—/|].*$/, "")
   .replace(/\s+/g, " ").trim();
