import { CbopSource } from "./cbop";
import { AdzunaSource } from "./adzuna";
import { JoobleSource } from "./jooble";
import { EuresSource } from "./eures";
import { InboxSource } from "./inbox";
import { WatchlistSource } from "./watchlist";
import { BranchSource } from "./branch-portals";
import type { Family } from "../taxonomy/pl-titles";
import { dedupe, type JobSource, type Offer, type SearchParams } from "./types";

/**
 * REJESTR ŹRÓDEŁ — jedyne miejsce, które trzeba ruszyć, żeby dołożyć portal.
 *
 * Kolejność nie ma znaczenia: wszystkie źródła odpytujemy równolegle,
 * a wynik i tak przechodzi przez deduplikację i wspólny ranking.
 */
export const branchSource = new BranchSource();

export const SOURCES: JobSource[] = [
  new CbopSource(),
  new AdzunaSource(),
  new JoobleSource(),
  new EuresSource(),
  new WatchlistSource(),
  branchSource,
  new InboxSource(),
];

/**
 * Serwisy branżowe aktywują się same, na podstawie rodzin zawodowych
 * wynikających z profilu. Fizjoterapeuta nie dostanie ofert IT,
 * a programista nie dostanie ogłoszeń z serwisu medycznego.
 */
export function setActiveFamilies(families: Family[]) {
  branchSource.families = families;
}

export function getSource(id: string): JobSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

export function sourceStatuses() {
  return SOURCES.map((s) => ({ id: s.id, legalNote: s.legalNote, ...s.status() }));
}

export type SearchReport = {
  offers: Offer[];
  perSource: { id: string; label: string; count: number; ok: boolean; note?: string }[];
};

/**
 * Odpytanie wszystkich skonfigurowanych źródeł naraz.
 *
 * Kluczowa zasada: awaria jednego źródła NIE przerywa wyszukiwania.
 * Przy pięciu niezależnych integracjach zewnętrznych coś zawsze będzie
 * chwilowo niedostępne, a użytkownik ma dostać wyniki z reszty.
 */
export async function searchAll(params: SearchParams): Promise<SearchReport> {
  const active = SOURCES.filter((s) => s.status().ok);

  const results = await Promise.allSettled(
    active.map(async (s) => ({ source: s, offers: await s.search(params) }))
  );

  const offers: Offer[] = [];
  const perSource: SearchReport["perSource"] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const s = active[i];
    if (r.status === "fulfilled") {
      offers.push(...r.value.offers);
      perSource.push({ id: s.id, label: s.label, count: r.value.offers.length, ok: true });
    } else {
      perSource.push({ id: s.id, label: s.label, count: 0, ok: false, note: String(r.reason?.message ?? r.reason) });
    }
  }

  // Źródła nieskonfigurowane pokazujemy w raporcie, żeby użytkownik wiedział,
  // ile ofert traci i jak to naprawić.
  for (const s of SOURCES.filter((x) => !x.status().ok)) {
    const st = s.status();
    perSource.push({ id: s.id, label: s.label, count: 0, ok: false, note: st.ok ? undefined : `${st.reason}. ${st.howToFix ?? ""}`.trim() });
  }

  return { offers: dedupe(offers), perSource };
}
