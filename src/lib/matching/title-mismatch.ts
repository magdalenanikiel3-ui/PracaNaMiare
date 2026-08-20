import type { MasterProfile, Skill } from "../profile/schema";
import type { Offer } from "../sources/types";

/**
 * WYKRYWANIE ROZJAZDU NAZWA ↔ TREŚĆ
 *
 * Najcenniejszy wynik w całym wyszukiwaniu to oferta, której nazwa nie
 * przypomina niczego, czego użytkownik szukał, ale której WYMAGANIA
 * pokrywają się mocno z jego profilem.
 *
 * Powód jest prosty: skoro nazwa nie pasuje do żadnego oczywistego hasła,
 * to znaczy, że użytkownik nigdy by na tę ofertę nie trafił samodzielnie.
 * Prawdopodobnie nie trafiła na nią też połowa innych kandydatów —
 * czyli konkurencja jest mniejsza.
 *
 * Przykłady z polskiego rynku:
 *   „Specjalista ds. wsparcia biznesu"     → w praktyce analityka i raportowanie
 *   „Koordynator ds. administracji"        → w 70% praca w Excelu
 *   „Młodszy specjalista ds. rozliczeń"    → wymagania jak u analityka danych
 *   „Konsultant ds. wdrożeń"               → SQL, integracje, praca z danymi
 *
 * Ta funkcja NIE korzysta z modelu AI — liczy się deterministycznie,
 * na danych, które i tak mamy. Zero kosztu, natychmiastowy wynik.
 */

export type Mismatch = {
  /** Czy oznaczyć ofertę jako „nie znalazłabyś jej po nazwie". */
  flagged: boolean;
  /** 0–1: jak bardzo tytuł przypomina to, czego użytkownik szukał. */
  titleFamiliarity: number;
  /** 0–1: jak mocno wymagania pokrywają się z profilem, z wagą za poziom. */
  requirementsFit: number;
  /** Gotowe zdanie do pokazania w interfejsie. */
  explanation: string | null;
};

const STOP = new Set([
  "junior", "mid", "middle", "senior", "starszy", "mlodszy", "regular", "lead",
  "principal", "specjalista", "specialist", "ds", "do", "spraw", "w", "i", "z",
  "na", "the", "of", "and", "praca", "oferta", "k", "m", "f",
]);

const tokens = (s: string): string[] =>
  s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

/** Podobieństwo dwóch nazw stanowisk — udział wspólnych słów znaczących. */
function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) {
    // Dopuszczamy dopasowanie po rdzeniu: "analityk" ~ "analityczny", "raport" ~ "raportowanie".
    if (tb.has(t) || [...tb].some((x) => x.startsWith(t.slice(0, 5)) || t.startsWith(x.slice(0, 5)))) hit++;
  }
  return hit / Math.min(ta.size, tb.size);
}

export function detectMismatch(
  profile: MasterProfile,
  offer: Offer,
  matched: string[],
  offerSkillCount: number
): Mismatch {
  const none: Mismatch = { flagged: false, titleFamiliarity: 1, requirementsFit: 0, explanation: null };

  // Bez wystarczającej liczby wymagań nie ma o czym wnioskować —
  // trzy przypadkowe słowa kluczowe to za mało, żeby cokolwiek twierdzić.
  if (offerSkillCount < 3) return none;

  // ── jak znajomy jest tytuł ────────────────────────────────────────────────
  // Porównujemy z tym, czego użytkownik szuka ORAZ z jego własnymi
  // dotychczasowymi stanowiskami — jedno i drugie to nazwy, które zna.
  const known = [
    ...profile.acceptedDirections,
    ...profile.experience.map((e) => e.title.value).filter(Boolean) as string[],
    ...(profile.headline.value ? [profile.headline.value] : []),
  ];
  const titleFamiliarity = known.length
    ? Math.max(...known.map((k) => similarity(offer.title, k)))
    : 0;

  // ── jak mocno pasują wymagania ────────────────────────────────────────────
  // Ważymy poziomem: umiejętność potwierdzona wielokrotnie liczy się mocniej
  // niż taka, która w CV pojawia się raz.
  const byCanon = new Map<string, Skill>(profile.skills.map((s) => [s.canonical, s]));
  const weight = (c: string) => {
    const d = byCanon.get(c)?.depth;
    return d === "core" ? 1.4 : d === "used" ? 1.0 : 0.5;
  };
  const weighted = matched.reduce((sum, c) => sum + weight(c), 0);
  const requirementsFit = Math.min(1, weighted / offerSkillCount);

  // ── decyzja ───────────────────────────────────────────────────────────────
  // Progi dobrane tak, żeby oznaczać rzadko. Etykieta, która pojawia się
  // przy co drugiej ofercie, przestaje cokolwiek znaczyć.
  const flagged = requirementsFit >= 0.5 && titleFamiliarity < 0.3;

  if (!flagged) return { flagged: false, titleFamiliarity, requirementsFit, explanation: null };

  const pct = Math.round(requirementsFit * 100);
  const top = matched
    .map((c) => byCanon.get(c))
    .filter((s): s is Skill => !!s)
    .sort((a, b) => (a.depth === "core" ? -1 : 1) - (b.depth === "core" ? -1 : 1))
    .slice(0, 3)
    .map((s) => s.name);

  return {
    flagged: true,
    titleFamiliarity,
    requirementsFit,
    explanation:
      `Nazwa stanowiska nie przypomina niczego, czego szukasz, ale ${pct}% wymagań ` +
      `pokrywa się z Twoim doświadczeniem${top.length ? ` (m.in. ${top.join(", ")})` : ""}. ` +
      `Samodzielnie raczej byś na tę ofertę nie trafiła — i prawdopodobnie mniej osób ją znalazło.`,
  };
}
