import type { MasterProfile } from "../profile/schema";
import { canonicalizeSkill } from "../profile/schema";
import type { Offer } from "../sources/types";
import { profileSignals } from "../ai/expand-queries";
import { detectMismatch, type Mismatch } from "./title-mismatch";

/**
 * ETAP 1 DOPASOWANIA — prefiltr deterministyczny.
 *
 * Po co osobny etap, skoro mamy AI? Bo pytanie modelu o każdą z 300 ofert
 * jest wolne i kosztowne, a 90% z nich odpada na twardych warunkach,
 * które da się sprawdzić za darmo i natychmiast.
 *
 * Ten etap: odsiewa jawne niedopasowania i wstępnie porządkuje resztę.
 * Do modelu trafia tylko czubek listy. Różnica w koszcie i czasie
 * jest rzędu wielkości, a jakość końcowa taka sama.
 *
 * Ten etap NIE ocenia sensu oferty — od tego jest reranking.
 */

export type Prefiltered = {
  offer: Offer;
  rough: number;
  matched: string[];
  missing: string[];
  /** Powód odrzucenia — pokazujemy w UI, żeby użytkownik wiedział, co go ominęło i dlaczego. */
  rejected?: string;
  /** Czy nazwa stanowiska rozjeżdża się z treścią — patrz title-mismatch.ts. */
  mismatch: Mismatch;
};

export function prefilter(profile: MasterProfile, offers: Offer[]): {
  passed: Prefiltered[];
  rejected: Prefiltered[];
} {
  const pref = profile.preferences;
  const sig = profileSignals(profile);
  const mine = new Map(profile.skills.map((s) => [s.canonical, s]));

  const passed: Prefiltered[] = [];
  const rejected: Prefiltered[] = [];

  for (const o of offers) {
    const offerSkills = (o.skills ?? []).map(canonicalizeSkill);
    const matched = offerSkills.filter((s) => mine.has(s));
    const missing = offerSkills.filter((s) => !mine.has(s));

    const mismatch = detectMismatch(profile, o, matched, offerSkills.length);
    const item: Prefiltered = { offer: o, rough: 0, matched, missing, mismatch };

    // ── twarde warunki ────────────────────────────────────────────────────
    // Wynagrodzenie: odrzucamy tylko gdy MAKSIMUM oferty jest poniżej minimum
    // użytkownika. Gdy widełki się przecinają, zostawiamy — jest o czym rozmawiać.
    if (pref.salaryMin && o.salaryMin) {
      const top = normalizeMonthly(o.salaryMax ?? o.salaryMin, o.salaryPeriod);
      if (top && top < pref.salaryMin * 0.85) {
        rejected.push({ ...item, rejected: `Wynagrodzenie poniżej Twojego minimum (${pref.salaryMin} zł)` });
        continue;
      }
    }

    // Tryb pracy: "unknown" nigdy nie odrzucamy — brak informacji to nie odmowa.
    if (pref.remote !== "any" && o.remote !== "unknown" && o.remote !== pref.remote) {
      const ok = pref.remote === "remote" && o.remote === "hybrid";
      if (!ok) {
        rejected.push({ ...item, rejected: `Tryb pracy: ${plRemote(o.remote)}, a szukasz: ${plRemote(pref.remote)}` });
        continue;
      }
    }

    // Lokalizacja — pomijana przy pracy zdalnej.
    if (pref.locations.length && o.location && o.remote !== "remote" && pref.remote !== "remote") {
      const loc = fold(o.location);
      if (!pref.locations.some((l) => loc.includes(fold(l)) || fold(l).includes(loc))) {
        rejected.push({ ...item, rejected: `Lokalizacja: ${o.location}` });
        continue;
      }
    }

    if (pref.excludeCompanies.some((c) => c && fold(o.company ?? "").includes(fold(c)))) {
      rejected.push({ ...item, rejected: "Firma z Twojej listy wykluczeń" });
      continue;
    }

    // ── wstępna punktacja (tylko do uporządkowania kolejki do modelu) ─────
    const skillScore = offerSkills.length ? (matched.length / offerSkills.length) * 55 : 20;

    // Zbieżność nazwy stanowiska z zaakceptowanymi kierunkami.
    const t = fold(o.title);
    const titleScore = profile.acceptedDirections.some((d) => {
      const f = fold(d);
      return t.includes(f) || f.includes(t);
    }) ? 20 : 0;

    // Świeżość — stare ogłoszenia często są już nieaktualne.
    const days = o.publishedAt ? (Date.now() - new Date(o.publishedAt).getTime()) / 86400000 : 14;
    const freshScore = days < 3 ? 12 : days < 7 ? 9 : days < 14 ? 6 : days < 30 ? 3 : 0;

    // Jawne widełki to sygnał jakości ogłoszenia i oszczędność czasu kandydata.
    const salaryScore = o.salaryMin ? 8 : 0;

    // Premia za umiejętności, które kandydat naprawdę stosował, a nie tylko wymienił.
    const depthScore = matched.filter((s) => mine.get(s)?.depth === "core").length * 2;

    // Premia za rozjazd nazwa↔treść: to są oferty, na które użytkownik sam by nie
    // trafił, więc mają pierwszeństwo w kolejce do oceny przez model.
    const mismatchScore = mismatch.flagged ? 15 : 0;

    item.rough = Math.min(100, Math.round(skillScore + titleScore + freshScore + salaryScore + depthScore + mismatchScore));
    passed.push(item);
  }

  passed.sort((a, b) => b.rough - a.rough);
  return { passed, rejected };
}

/** Sprowadzenie wynagrodzenia do miesięcznego, żeby porównywać jabłka z jabłkami. */
function normalizeMonthly(v: number | null, period: Offer["salaryPeriod"]): number | null {
  if (!v) return null;
  if (period === "year") return Math.round(v / 12);
  if (period === "hour") return Math.round(v * 168);
  return v;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const plRemote = (r: string) =>
  ({ remote: "zdalnie", hybrid: "hybrydowo", onsite: "stacjonarnie", unknown: "nieokreślony", any: "dowolny" } as Record<string, string>)[r] ?? r;
