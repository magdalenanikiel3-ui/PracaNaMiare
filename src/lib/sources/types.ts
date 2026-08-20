/**
 * WSPÓLNY INTERFEJS ŹRÓDŁA OFERT
 *
 * Cel: dołożenie nowego portalu = jeden nowy plik implementujący `JobSource`
 * plus jedna linijka w registry.ts. Zero zmian w silniku dopasowania.
 *
 * To jest świadoma odpowiedź na główne ryzyko projektu: dostęp do portali
 * jest niepewny prawnie i technicznie, więc źródła MUSZĄ być wymienne.
 * Gdy jedno padnie albo zmieni regulamin, reszta działa dalej.
 */

export type Offer = {
  /** Stabilny identyfikator: `${source}:${idWŹródle}`. */
  id: string;
  source: string;
  sourceLabel: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: "onsite" | "hybrid" | "remote" | "unknown";
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "month" | "year" | "hour" | null;
  contract: string | null;
  /** Opis — tyle, ile źródło legalnie udostępnia. */
  description: string;
  /** Wymagania wyodrębnione ze źródła lub z opisu. */
  skills: string[];
  publishedAt: string | null;
  /**
   * Link do ORYGINAŁU. Zawsze wymagany.
   * Zasada produktowa: nie zastępujemy portalu, kierujemy do niego.
   */
  url: string;
};

export type SearchParams = {
  /** Frazy z silnika ekspansji — źródło samo decyduje, jak je złożyć. */
  queries: string[];
  location?: string | null;
  remote?: "onsite" | "hybrid" | "remote" | "any";
  salaryMin?: number | null;
  maxResults?: number;
};

export type SourceStatus =
  | { ok: true; label: string }
  | { ok: false; label: string; reason: string; howToFix?: string };

export interface JobSource {
  id: string;
  label: string;
  /** Krótka informacja o podstawie prawnej — pokazywana w UI. Świadoma decyzja. */
  legalNote: string;
  /** Czy skonfigurowane (klucze, przełączniki). Wywoływane przed wyszukiwaniem. */
  status(): SourceStatus;
  search(params: SearchParams): Promise<Offer[]>;
}

/** Wspólny parser widełek z tekstu — polskie ogłoszenia zapisują je na kilkanaście sposobów. */
export function parseSalary(text: string | null | undefined): {
  min: number | null; max: number | null; currency: string | null; period: "month" | "year" | "hour" | null;
} {
  const empty = { min: null, max: null, currency: null, period: null };
  if (!text) return empty;
  const t = text.toLowerCase().replace(/ /g, " ");

  const period: "month" | "year" | "hour" | null =
    /godz|\/h\b|hour/.test(t) ? "hour" :
    /rok|rocznie|year|annum|p\.a\./.test(t) ? "year" :
    /mies|month|mth/.test(t) ? "month" : "month";

  const currency = /eur|€/.test(t) ? "EUR" : /usd|\$/.test(t) ? "USD" : /gbp|£/.test(t) ? "GBP" : "PLN";

  const nums = [...t.matchAll(/(\d[\d\s.,]{2,})/g)]
    .map((m) => Number(m[1].replace(/[\s.]/g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 100);

  if (nums.length === 0) return { ...empty, currency, period };
  return {
    min: Math.min(...nums),
    max: nums.length > 1 ? Math.max(...nums) : null,
    currency,
    period,
  };
}

/** Rozpoznanie trybu pracy z tekstu. */
export function parseRemote(text: string | null | undefined): Offer["remote"] {
  if (!text) return "unknown";
  const t = text.toLowerCase();
  if (/hybryd|hybrid/.test(t)) return "hybrid";
  if (/zdaln|remote|home office|praca w domu/.test(t)) return "remote";
  if (/stacjonarn|on-?site|w biurze/.test(t)) return "onsite";
  return "unknown";
}

/**
 * Wyciąganie umiejętności z opisu, gdy źródło nie podaje ich osobno.
 * Świadomie proste i deterministyczne — dopasowanie semantyczne robi dopiero
 * etap rerankingu AI. Tutaj chodzi wyłącznie o tani prefiltr.
 */
const SKILL_LEXICON = [
  "sql","excel","power bi","tableau","qlik","python","r","sas","vba","dax","power query","access",
  "sap","oracle","dynamics","salesforce","hubspot","jira","confluence","sharepoint",
  "java","javascript","typescript","react","angular","vue","node.js","c#",".net","php","go","kotlin","swift",
  "docker","kubernetes","aws","azure","gcp","terraform","git","ci/cd","linux","windows server",
  "autocad","solidworks","revit","inventor","catia",
  "iso","haccp","lean","six sigma","kaizen","5s","tpm",
  "prince2","pmp","scrum","agile","kanban","itil",
  "angielski","niemiecki","francuski","hiszpański","english","german",
  "prawo jazdy","wózek widłowy","uprawnienia sep","księgowość","kadry","płace","optima","symfonia","płatnik",
  "rodo","compliance","controlling","budżetowanie","forecasting","etl","dbt","airflow","snowflake","spark",
];

export function extractSkills(text: string): string[] {
  const t = " " + text.toLowerCase().replace(/ /g, " ") + " ";
  const found = new Set<string>();
  for (const s of SKILL_LEXICON) {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(t)) found.add(s);
  }
  return [...found];
}

/** Usuwanie duplikatów między portalami — ta sama oferta bywa na kilku naraz. */
export function dedupe(offers: Offer[]): Offer[] {
  const seen = new Map<string, Offer>();
  for (const o of offers) {
    const key = [
      (o.company ?? "").toLowerCase().replace(/\s|sp\.|z o\.o\.|s\.a\.|,/g, ""),
      o.title.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, "").slice(0, 40),
      (o.location ?? "").toLowerCase().slice(0, 12),
    ].join("|");
    const prev = seen.get(key);
    // Przy duplikacie zostawiamy wersję z bogatszym opisem.
    if (!prev || o.description.length > prev.description.length) seen.set(key, o);
  }
  return [...seen.values()];
}
