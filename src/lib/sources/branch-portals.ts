import { readJson } from "../store";
import { readJobsPage } from "./page-reader";
import type { Family } from "../taxonomy/pl-titles";
import { type JobSource, type Offer, type SearchParams, type SourceStatus } from "./types";

/**
 * SERWISY BRANŻOWE
 *
 * KLUCZOWA DECYZJA: branża to DANE, nie KOD.
 *
 * Ta aplikacja ma służyć wszystkim, a nie tylko analitykom i finansistom.
 * Gdyby obsługa każdej branży wymagała napisania osobnego konektora,
 * fizjoterapeuci, kucharze, kierowcy i magazynierzy nigdy by się nie doczekali —
 * bo nikt nie napisze pięćdziesięciu konektorów.
 *
 * Dlatego wszystkie serwisy branżowe czyta ten sam silnik (page-reader.ts),
 * a dodanie branży to dopisanie wiersza do tablicy poniżej albo do pliku
 * data/branch-portals.json. Zero zmian w kodzie.
 *
 * Aktywują się SAME — na podstawie rodzin zawodowych wynikających z profilu
 * użytkownika. Fizjoterapeuta nie dostanie ofert IT, a programista nie dostanie
 * ogłoszeń z serwisu medycznego.
 *
 * ⚠️ Adresy poniżej wymagają sprawdzenia przy pierwszym uruchomieniu —
 * `npm run source branch`. Serwisy zmieniają układ adresów.
 */

export type BranchPortal = {
  id: string;
  label: string;
  families: Family[];
  /** {q} zostanie zastąpione frazą wyszukiwania. */
  searchUrl: string;
  enabled: boolean;
};

export const BRANCH_PORTALS: BranchPortal[] = [
  // ── analityka i IT ────────────────────────────────────────────────────────
  { id: "justjoin", label: "JustJoin.it", families: ["it", "analityka"],
    searchUrl: "https://justjoin.it/job-offers/all-locations?keyword={q}", enabled: true },
  { id: "nofluff", label: "NoFluffJobs", families: ["it", "analityka"],
    searchUrl: "https://nofluffjobs.com/pl/praca-it?criteria=keyword%3D{q}", enabled: true },
  { id: "bulldogjob", label: "Bulldogjob", families: ["it"],
    searchUrl: "https://bulldogjob.pl/companies/jobs/s/keyword,{q}", enabled: true },

  // ── finanse ───────────────────────────────────────────────────────────────
  { id: "gowork-fin", label: "GoWork — finanse", families: ["finanse", "analityka"],
    searchUrl: "https://www.gowork.pl/praca/{q};kw", enabled: true },
  { id: "infopraca-fin", label: "Infopraca — finanse", families: ["finanse", "analityka", "administracja"],
    searchUrl: "https://www.infopraca.pl/praca/{q}", enabled: true },

  // ── sektor publiczny ──────────────────────────────────────────────────────
  { id: "sluzba-cywilna", label: "Nabory — służba cywilna", families: ["administracja", "prawo", "finanse"],
    searchUrl: "https://nabory.kprm.gov.pl/szukaj?fraza={q}", enabled: false },

  // Dopisz kolejne branże tutaj — albo w data/branch-portals.json,
  // co pozwala zmieniać je bez ruszania kodu.
];

async function loadPortals(): Promise<BranchPortal[]> {
  // Plik użytkownika nadpisuje domyślne — dzięki temu można poprawić adres
  // albo dodać serwis bez edytowania kodu aplikacji.
  const custom = await readJson<{ portals: BranchPortal[] }>("branch-portals.json", { portals: [] });
  const byId = new Map(BRANCH_PORTALS.map((p) => [p.id, p]));
  for (const p of custom.portals) byId.set(p.id, p);
  return [...byId.values()].filter((p) => p.enabled);
}

export class BranchSource implements JobSource {
  id = "branch";
  label = "Serwisy branżowe";
  legalNote = "Publicznie dostępne wyniki wyszukiwania serwisów branżowych. Zawsze linkujemy do oryginału.";

  /** Ustawiane przez rejestr na podstawie profilu — decyduje, które serwisy odpalić. */
  families: Family[] = [];

  status(): SourceStatus {
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const portals = (await loadPortals()).filter(
      (x) => this.families.length === 0 || x.families.some((f) => this.families.includes(f))
    );
    if (portals.length === 0) return [];

    const out: Offer[] = [];
    // Maksymalnie 3 serwisy × 2 frazy — inaczej czas oczekiwania rośnie za bardzo.
    for (const portal of portals.slice(0, 3)) {
      for (const q of p.queries.slice(0, 2)) {
        const url = portal.searchUrl.replace("{q}", encodeURIComponent(q));
        const res = await readJobsPage(url, `branch-${portal.id}`, portal.label);
        out.push(...res.offers);
        await new Promise((r) => setTimeout(r, 700));
      }
      if (out.length >= (p.maxResults ?? 60)) break;
    }
    return out.slice(0, p.maxResults ?? 60);
  }
}
