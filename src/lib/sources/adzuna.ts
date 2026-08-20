import { type JobSource, type Offer, type SearchParams, type SourceStatus, extractSkills, parseRemote } from "./types";

/**
 * ADZUNA — agregator z oficjalnym, dokumentowanym API i darmowym tierem.
 *
 * PODSTAWA PRAWNA: publiczne API na warunkach dostawcy. Rejestracja darmowa:
 * https://developer.adzuna.com/  → ADZUNA_APP_ID + ADZUNA_APP_KEY
 *
 * CHARAKTERYSTYKA: agreguje wiele polskich portali naraz, więc jednym
 * zapytaniem dostajemy pokrycie szersze niż z pojedynczego serwisu.
 * Mocne w ofertach korporacyjnych i biurowych — czyli dokładnie tam, gdzie
 * CBOP jest słaby. Limit darmowego tieru w zupełności wystarcza na użytek
 * własny i testy z pierwszymi użytkownikami.
 */

export class AdzunaSource implements JobSource {
  id = "adzuna";
  label = "Adzuna (agregator)";
  legalNote = "Oficjalne API na warunkach Adzuna. Prezentujemy skrót i link do oryginału.";

  status(): SourceStatus {
    if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY)
      return {
        ok: false, label: this.label, reason: "Brak kluczy API",
        howToFix: "Zarejestruj się na developer.adzuna.com i wpisz ADZUNA_APP_ID oraz ADZUNA_APP_KEY do .env.local",
      };
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const out: Offer[] = [];
    const perQuery = Math.max(10, Math.floor((p.maxResults ?? 60) / Math.max(1, Math.min(5, p.queries.length))));

    for (const q of p.queries.slice(0, 5)) {
      const u = new URL("https://api.adzuna.com/v1/api/jobs/pl/search/1");
      u.searchParams.set("app_id", process.env.ADZUNA_APP_ID!);
      u.searchParams.set("app_key", process.env.ADZUNA_APP_KEY!);
      u.searchParams.set("results_per_page", String(Math.min(50, perQuery)));
      u.searchParams.set("title_only", q);
      u.searchParams.set("content-type", "application/json");
      if (p.location) u.searchParams.set("where", p.location);
      if (p.salaryMin) u.searchParams.set("salary_min", String(p.salaryMin));

      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) { console.warn(`[adzuna] HTTP ${r.status} dla "${q}"`); continue; }
        const j = await r.json();
        for (const row of j.results ?? []) {
          const desc: string = row.description ?? "";
          out.push({
            id: `adzuna:${row.id}`,
            source: "adzuna",
            sourceLabel: "Adzuna",
            title: row.title ?? "(bez nazwy)",
            company: row.company?.display_name ?? null,
            location: row.location?.display_name ?? null,
            remote: parseRemote(`${row.title ?? ""} ${desc}`),
            salaryMin: row.salary_min ?? null,
            salaryMax: row.salary_max ?? null,
            salaryCurrency: row.salary_min ? "PLN" : null,
            // Adzuna normalizuje wynagrodzenia do stawki rocznej.
            salaryPeriod: row.salary_min ? "year" : null,
            contract: row.contract_time ?? row.contract_type ?? null,
            description: desc.slice(0, 4000),
            skills: extractSkills(`${row.title ?? ""} ${desc}`),
            publishedAt: row.created ?? null,
            url: row.redirect_url,
          });
        }
      } catch (e) {
        console.warn(`[adzuna] błąd dla "${q}":`, (e as Error).message);
      }
    }
    return out;
  }
}
