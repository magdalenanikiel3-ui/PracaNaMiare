import { readJson, writeJson } from "../store";
import { readJobsPage } from "./page-reader";
import { type JobSource, type Offer, type SearchParams, type SourceStatus } from "./types";

/**
 * OBSERWOWANE FIRMY
 *
 * ODPOWIEDŹ NA PYTANIE „CZY KAŻDY UŻYTKOWNIK WPISUJE SWOJE FIRMY": TAK.
 *
 * I to jest sedno pomysłu, a nie jego ograniczenie. Nie da się przeszukać
 * wszystkich firm w Polsce — Adzuna i Jooble robią to od lat całymi zespołami
 * i wciąż nie mają kompletu. Jednoosobowo tego nie da się dogonić.
 *
 * Ale nie trzeba. Każdy ma w głowie krótką listę miejsc, w których naprawdę
 * chciałby pracować, i nikt dziś tej listy nie obsługuje. Trzydzieści firm
 * to weekend pracy, a wartość na ofertę jest wielokrotnie wyższa niż
 * z przypadkowego ogłoszenia z agregatora.
 *
 * Przewagi zakładki „Kariera" nad portalem:
 *   - ogłoszenie trafia tam ZANIM pojawi się na portalu, czasem o tygodnie,
 *   - część ogłoszeń nigdy nie trafia na portale (oszczędność na publikacji),
 *   - mniej kandydatów, bo trzeba wiedzieć, gdzie patrzeć,
 *   - zerowe ryzyko prawne: ta zakładka istnieje po to, żeby ją czytać.
 *
 * Żeby nikt nie stanął przed pustym polem — system podpowiada firmy
 * na podstawie profilu (patrz suggest-companies.ts).
 */

export type WatchedCompany = {
  id: string;
  name: string;
  careerUrl: string;
  /** Ostatnie udane sprawdzenie. */
  lastChecked: string | null;
  lastError: string | null;
  /** Oferty z ostatniego odczytu — pamiętamy, żeby nie czytać strony przy każdym wyszukiwaniu. */
  offers: Offer[];
  /** Ile razy z rzędu się nie udało — po kilku próbach oznaczamy do poprawy. */
  failCount: number;
};

export type Watchlist = { companies: WatchedCompany[] };

/** Jak długo ufamy zapisanym wynikom, zanim odczytamy stronę ponownie. */
const TTL_MS = 12 * 60 * 60 * 1000;

export async function getWatchlist(): Promise<Watchlist> {
  return readJson<Watchlist>("watchlist.json", { companies: [] });
}

export async function saveWatchlist(w: Watchlist): Promise<void> {
  await writeJson("watchlist.json", w);
}

export async function addCompany(name: string, careerUrl: string): Promise<WatchedCompany> {
  const w = await getWatchlist();
  const id = slug(name);
  const existing = w.companies.find((c) => c.id === id);
  if (existing) {
    existing.careerUrl = careerUrl;
    existing.failCount = 0;
    existing.lastError = null;
  } else {
    w.companies.push({ id, name, careerUrl, lastChecked: null, lastError: null, offers: [], failCount: 0 });
  }
  await saveWatchlist(w);
  return w.companies.find((c) => c.id === id)!;
}

export async function removeCompany(id: string): Promise<void> {
  const w = await getWatchlist();
  w.companies = w.companies.filter((c) => c.id !== id);
  await saveWatchlist(w);
}

/**
 * Odczyt jednej firmy. Wywoływane osobno, żeby interfejs mógł pokazywać postęp
 * i żeby awaria jednej firmy nie psuła pozostałych.
 */
export async function refreshCompany(c: WatchedCompany, force = false): Promise<WatchedCompany> {
  const fresh = c.lastChecked && Date.now() - new Date(c.lastChecked).getTime() < TTL_MS;
  if (fresh && !force && c.offers.length > 0) return c;

  const res = await readJobsPage(c.careerUrl, "watchlist", `${c.name} — zakładka Kariera`);

  if (res.error && res.offers.length === 0) {
    c.failCount++;
    c.lastError = res.error;
    // Nie kasujemy poprzednich ofert — jedna nieudana próba nie znaczy,
    // że firma przestała rekrutować.
    return c;
  }

  // Nazwa firmy pochodzi z listy obserwowanych, a nie ze zgadywania przez model.
  c.offers = res.offers.map((o) => ({ ...o, company: c.name }));
  c.lastChecked = new Date().toISOString();
  c.lastError = res.offers.length === 0 && !res.looksLikeJobsPage
    ? "Na tej stronie nie widać ogłoszeń — sprawdź, czy adres prowadzi do listy ofert."
    : null;
  c.failCount = 0;
  return c;
}

export async function refreshAll(force = false): Promise<Watchlist> {
  const w = await getWatchlist();
  // Sekwencyjnie i z przerwą — nie zalewamy cudzych serwerów.
  for (const c of w.companies) {
    await refreshCompany(c, force);
    await new Promise((r) => setTimeout(r, 900));
  }
  await saveWatchlist(w);
  return w;
}

export class WatchlistSource implements JobSource {
  id = "watchlist";
  label = "Obserwowane firmy";
  legalNote = "Zakładki „Kariera” na stronach firm, które sam(a) wskazałeś/aś. Te strony istnieją po to, żeby czytali je kandydaci.";

  status(): SourceStatus {
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const w = await getWatchlist();
    if (w.companies.length === 0) return [];
    // Odświeżamy zgodnie z TTL — użytkownik nie czeka na odczyt 30 stron
    // przy każdym wyszukiwaniu.
    for (const c of w.companies) {
      await refreshCompany(c);
      await new Promise((r) => setTimeout(r, 300));
    }
    await saveWatchlist(w);

    // Bez filtrowania po frazach: skoro użytkownik świadomie wskazał te firmy,
    // chce widzieć wszystko, co u nich jest. Odsiewaniem zajmie się prefiltr.
    return w.companies.flatMap((c) => c.offers).slice(0, p.maxResults ?? 200);
  }
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
