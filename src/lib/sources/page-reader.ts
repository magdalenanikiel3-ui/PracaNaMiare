import { getAI, parseJson, withRetry } from "../ai/provider";
import { extractSkills, parseRemote, parseSalary, type Offer } from "./types";

/**
 * UNIWERSALNY CZYTNIK STRON Z OFERTAMI
 *
 * Jeden silnik, dwa zastosowania:
 *   1. zakładki „Kariera" na stronach firm (obserwowane firmy),
 *   2. serwisy branżowe, których nie ma w agregatorach.
 *
 * DLACZEGO TO MUSI BYĆ JEDEN MECHANIZM, A NIE KOD PER BRANŻA:
 * Ta aplikacja ma służyć wszystkim, nie tylko analitykom i finansistom.
 * Gdyby każda branża wymagała osobnego konektora w kodzie, obsługa
 * fizjoterapeutów, kucharzy czy kierowców nigdy by nie powstała.
 *
 * Dlatego dodanie branży to DANE, nie KOD: wpisujesz adres do pliku
 * konfiguracyjnego i działa. Model radzi sobie z dowolnym układem strony,
 * więc nie trzeba pisać selektorów pod każdy serwis osobno.
 *
 * DLACZEGO TU AI JEST WŁAŚCIWYM NARZĘDZIEM (inaczej niż przy CV):
 * Przy CV mówiłam o podejściu mieszanym, bo mieliśmy czym weryfikować wynik.
 * Tutaj każda strona firmowa wygląda inaczej i zmienia się bez zapowiedzi —
 * pisanie selektorów pod tysiąc firm to praca bez końca. Model po prostu
 * czyta stronę tak, jak zrobiłby to człowiek.
 */

const SYSTEM = `Wyciągasz oferty pracy z treści strony internetowej.

ZASADY:
1. Zwracasz WYŁĄCZNIE oferty pracy widoczne na tej stronie. Jeśli strona nie
   zawiera żadnych ogłoszeń, zwracasz pustą listę. Nie wymyślasz ofert.
2. Jeśli strona to lista ogłoszeń, wyciągasz każde jako osobną pozycję.
3. "url" podajesz dokładnie tak, jak występuje na stronie. Gdy link jest
   względny (zaczyna się od "/"), zostawiasz go w tej formie — system sam
   dopisze domenę.
4. Nie tłumaczysz i nie upiększasz nazw stanowisk. Kopiujesz je.
5. Gdy czegoś nie ma na stronie, zostawiasz null. Nie zgadujesz.`;

const SCHEMA = {
  type: "object",
  properties: {
    offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          location: { type: "string" },
          salary: { type: "string" },
          contract: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  required: ["offers"],
};

export type PageReadResult = {
  offers: Offer[];
  error?: string;
  /** Czy strona w ogóle wyglądała na stronę z ofertami — do diagnostyki. */
  looksLikeJobsPage: boolean;
};

/**
 * Uproszczone sprawdzenie robots.txt.
 * Nie jest wymagane prawnie w każdym przypadku, ale to elementarna kultura
 * i realnie zmniejsza ryzyko zablokowania. Kosztuje jedno zapytanie.
 */
async function allowedByRobots(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const r = await fetch(`${u.origin}/robots.txt`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return true; // brak robots.txt = brak zakazu
    const txt = await r.text();

    // Interesuje nas wyłącznie sekcja dla wszystkich botów.
    const blocks = txt.split(/^user-agent:/im).slice(1);
    const all = blocks.find((b) => b.trimStart().startsWith("*"));
    if (!all) return true;

    const disallows = [...all.matchAll(/^\s*disallow:\s*(\S*)\s*$/gim)].map((m) => m[1]);
    return !disallows.some((d) => d && d !== "/" ? u.pathname.startsWith(d) : d === "/");
  } catch {
    return true;
  }
}

/** Zamiana HTML na tekst — model nie potrzebuje znaczników, a te zżerają limit. */
function htmlToText(html: string): { text: string; links: string[] } {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return { text, links };
}

const JOBS_HINTS = /(oferty pracy|aktualne oferty|dołącz do nas|kariera|rekrutacj|stanowisk|aplikuj|wolne etaty|nabór|job|career|vacanc)/i;

export async function readJobsPage(
  pageUrl: string,
  sourceId: string,
  sourceLabel: string,
  opts: { respectRobots?: boolean } = {}
): Promise<PageReadResult> {
  try {
    if (opts.respectRobots !== false && !(await allowedByRobots(pageUrl))) {
      return { offers: [], looksLikeJobsPage: false, error: "Strona zabrania odczytu w robots.txt — pomijam." };
    }

    const r = await fetch(pageUrl, {
      headers: {
        // Uczciwie przedstawiamy się z kontaktem — dobra praktyka i ułatwia
        // administratorowi kontakt zamiast blokady.
        "User-Agent": "PracaNaMiare/0.6 (osobiste narzedzie do szukania pracy)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!r.ok) return { offers: [], looksLikeJobsPage: false, error: `HTTP ${r.status}` };

    const html = await r.text();
    const { text } = htmlToText(html);

    if (text.length < 200) {
      return {
        offers: [], looksLikeJobsPage: false,
        error: "Strona nie zwróciła treści — prawdopodobnie ładuje oferty JavaScriptem. Spróbuj podać bezpośredni adres listy ogłoszeń.",
      };
    }

    const looksLikeJobsPage = JOBS_HINTS.test(text);

    const raw = await withRetry(() => getAI().generate(
      `Adres strony: ${pageUrl}\n\nTreść strony:\n\n${text.slice(0, 30000)}`,
      { system: SYSTEM, schema: SCHEMA, temperature: 0.1 }
    ), "czytanie strony");
    const parsed = parseJson<{ offers: Array<Record<string, string>> }>(raw);

    const base = new URL(pageUrl);
    const offers: Offer[] = (parsed.offers ?? [])
      .filter((o) => o.title && o.title.trim().length > 2)
      .map((o) => {
        const sal = parseSalary(o.salary);
        const abs = o.url
          ? (o.url.startsWith("http") ? o.url : new URL(o.url, base.origin).toString())
          : pageUrl;
        const desc = (o.description ?? "").slice(0, 4000);
        return {
          id: `${sourceId}:${hash(abs + o.title)}`,
          source: sourceId,
          sourceLabel,
          title: o.title.trim(),
          company: null, // uzupełniane przez wywołującego (znamy firmę z listy obserwowanych)
          location: o.location?.trim() || null,
          remote: parseRemote(`${o.title} ${o.location ?? ""} ${desc}`),
          salaryMin: sal.min, salaryMax: sal.max,
          salaryCurrency: sal.currency, salaryPeriod: sal.period,
          contract: o.contract?.trim() || null,
          description: desc,
          skills: extractSkills(`${o.title} ${desc}`),
          publishedAt: new Date().toISOString(),
          url: abs,
        };
      });

    return { offers, looksLikeJobsPage };
  } catch (e) {
    return { offers: [], looksLikeJobsPage: false, error: (e as Error).message };
  }
}

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };
