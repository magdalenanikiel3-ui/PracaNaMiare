import { type JobSource, type Offer, type SearchParams, type SourceStatus, extractSkills, parseRemote } from "./types";

/**
 * CBOP — Centralna Baza Ofert Pracy (oferty.praca.gov.pl)
 *
 * Prowadzona przez Ministerstwo Rodziny, Pracy i Polityki Społecznej,
 * zasilana przez powiatowe i wojewódzkie urzędy pracy.
 *
 * PODSTAWA PRAWNA: dane publiczne w rozumieniu ustawy o dostępie do informacji
 * publicznej. To jedyne w tym zestawie źródło o zerowym ryzyku prawnym —
 * i dlatego jest domyślnie włączone jako pierwsze.
 *
 * CHARAKTERYSTYKA: bardzo szerokie pokrycie geograficzne (cała Polska, także
 * małe miejscowości), mocna reprezentacja stanowisk produkcyjnych, handlowych,
 * usługowych i administracji publicznej. Słabsza reprezentacja IT i korporacji.
 * Dobrze uzupełnia się z Adzuna/Jooble, które mają odwrotny profil.
 *
 * ⚠️ DO ZWERYFIKOWANIA PRZY PIERWSZYM URUCHOMIENIU:
 * Portal to aplikacja SPA korzystająca z własnego API. Kształt odpowiedzi
 * bywa zmieniany bez zapowiedzi. Uruchom `npm run source cbop`, obejrzyj
 * surową odpowiedź i w razie potrzeby popraw `mapOffer` niżej.
 * Nie zgaduj — sprawdź, jak faktycznie wygląda odpowiedź.
 */

const API = "https://oferty.praca.gov.pl/portal/index.cbop/api/oferty/wyszukiwanie";

export class CbopSource implements JobSource {
  id = "cbop";
  label = "CBOP — urzędy pracy";
  legalNote = "Dane publiczne Ministerstwa Rodziny, Pracy i Polityki Społecznej. Brak ograniczeń licencyjnych.";

  status(): SourceStatus {
    if ((process.env.SOURCE_CBOP ?? "on").toLowerCase() === "off")
      return { ok: false, label: this.label, reason: "Wyłączone w .env.local", howToFix: "Ustaw SOURCE_CBOP=on" };
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const out: Offer[] = [];
    const limit = p.maxResults ?? 60;

    // Portal nie obsługuje OR w jednym zapytaniu — pytamy osobno o każdą frazę.
    for (const q of p.queries.slice(0, 6)) {
      try {
        const body = {
          zakresDaty: null,
          stanowisko: q,
          nazwaPracodawcy: null,
          kodyZawodow: [],
          miejscowosc: p.location ?? null,
          rodzajOferty: null,
          sortowanie: "DATA_DODANIA_DESC",
          numerStrony: 0,
          rozmiarStrony: Math.min(50, limit),
        };

        const r = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) { console.warn(`[cbop] HTTP ${r.status} dla "${q}"`); continue; }

        const j = await r.json();
        const rows: unknown[] = j?.dane ?? j?.content ?? j?.oferty ?? (Array.isArray(j) ? j : []);
        for (const row of rows) out.push(mapOffer(row as Record<string, unknown>));
      } catch (e) {
        console.warn(`[cbop] błąd dla "${q}":`, (e as Error).message);
      }
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }
}

function mapOffer(o: Record<string, unknown>): Offer {
  const g = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  };

  const id = g("id", "idOferty", "numerOferty") ?? Math.random().toString(36).slice(2);
  const title = g("stanowisko", "nazwaStanowiska", "tytul") ?? "(bez nazwy stanowiska)";
  const desc = g("zakresObowiazkow", "opis", "wymagania") ?? "";
  const reqs = g("wymagania", "wymaganiaKonieczne") ?? "";
  const place = g("miejscePracy", "miejscowosc", "lokalizacja");

  const min = numOrNull(o["wynagrodzenieOd"] ?? o["placaOd"]);
  const max = numOrNull(o["wynagrodzenieDo"] ?? o["placaDo"]);

  return {
    id: `cbop:${id}`,
    source: "cbop",
    sourceLabel: "CBOP — urzędy pracy",
    title,
    company: g("nazwaPracodawcy", "pracodawca", "firma"),
    location: place,
    remote: parseRemote(`${desc} ${g("rodzajZatrudnienia", "systemCzasuPracy") ?? ""}`),
    salaryMin: min,
    salaryMax: max,
    salaryCurrency: min || max ? "PLN" : null,
    salaryPeriod: min || max ? "month" : null,
    contract: g("rodzajUmowy", "rodzajZatrudnienia"),
    description: [desc, reqs].filter(Boolean).join("\n\n").slice(0, 4000),
    skills: extractSkills(`${title} ${desc} ${reqs}`),
    publishedAt: g("dataDodania", "dataPublikacji", "dataWaznosci"),
    url: `https://oferty.praca.gov.pl/portal/index.cbop#/szczegolyOferty?id=${id}`,
  };
}

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
