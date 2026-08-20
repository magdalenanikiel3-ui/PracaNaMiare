import { type JobSource, type Offer, type SearchParams, type SourceStatus, extractSkills, parseRemote, parseSalary } from "./types";

/**
 * JOOBLE — agregator z oficjalnym API. Darmowy klucz na wniosek:
 * https://pl.jooble.org/api/about
 *
 * CHARAKTERYSTYKA: bardzo szerokie pokrycie polskiego rynku, w tym oferty
 * z mniejszych i lokalnych serwisów, których nie ma nigdzie indziej.
 * Jakość opisów bywa nierówna, więc reranking AI ma tu dużo do zrobienia.
 */

export class JoobleSource implements JobSource {
  id = "jooble";
  label = "Jooble (agregator)";
  legalNote = "Oficjalne API na warunkach Jooble. Link zawsze prowadzi do oryginału.";

  status(): SourceStatus {
    if (!process.env.JOOBLE_API_KEY)
      return {
        ok: false, label: this.label, reason: "Brak klucza API",
        howToFix: "Poproś o darmowy klucz na pl.jooble.org/api/about i wpisz JOOBLE_API_KEY do .env.local",
      };
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const out: Offer[] = [];
    for (const q of p.queries.slice(0, 5)) {
      try {
        const r = await fetch(`https://pl.jooble.org/api/${process.env.JOOBLE_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywords: q, location: p.location ?? "", page: 1 }),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) { console.warn(`[jooble] HTTP ${r.status} dla "${q}"`); continue; }
        const j = await r.json();
        for (const row of j.jobs ?? []) {
          const sal = parseSalary(row.salary);
          const desc: string = stripHtml(row.snippet ?? "");
          out.push({
            id: `jooble:${row.id ?? hash(row.link)}`,
            source: "jooble",
            sourceLabel: "Jooble",
            title: row.title ?? "(bez nazwy)",
            company: row.company || null,
            location: row.location || null,
            remote: parseRemote(`${row.title ?? ""} ${desc}`),
            salaryMin: sal.min, salaryMax: sal.max,
            salaryCurrency: sal.currency, salaryPeriod: sal.period,
            contract: row.type || null,
            description: desc.slice(0, 4000),
            skills: extractSkills(`${row.title ?? ""} ${desc}`),
            publishedAt: row.updated ?? null,
            url: row.link,
          });
        }
      } catch (e) {
        console.warn(`[jooble] błąd dla "${q}":`, (e as Error).message);
      }
    }
    return out;
  }
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };
