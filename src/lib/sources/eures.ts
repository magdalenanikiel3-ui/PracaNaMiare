import { type JobSource, type Offer, type SearchParams, type SourceStatus, extractSkills, parseRemote } from "./types";

/**
 * EURES — Europejski Portal Mobilności Zawodowej (Komisja Europejska).
 *
 * PODSTAWA PRAWNA: oficjalny portal instytucji UE, dane udostępniane publicznie.
 * Zero ryzyka, brak klucza.
 *
 * CHARAKTERYSTYKA: oferty z całej UE, w tym polskie zgłaszane przez publiczne
 * służby zatrudnienia. Sensowne dla użytkowników otwartych na pracę za granicą
 * lub zdalną w UE — czyli przy preferencji market = "international" lub "all".
 *
 * ⚠️ DO ZWERYFIKOWANIA: sprawdź `npm run source eures` i dostosuj mapowanie,
 * jeśli API zwróci inny kształt.
 */

const API = "https://europa.eu/eures/eures-apps/searchengine/page/jv-search/search";

export class EuresSource implements JobSource {
  id = "eures";
  label = "EURES (Komisja Europejska)";
  legalNote = "Publiczny portal instytucji UE. Dane udostępniane bez ograniczeń licencyjnych.";

  status(): SourceStatus {
    if ((process.env.SOURCE_EURES ?? "on").toLowerCase() === "off")
      return { ok: false, label: this.label, reason: "Wyłączone w .env.local", howToFix: "Ustaw SOURCE_EURES=on" };
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const out: Offer[] = [];
    for (const q of p.queries.slice(0, 4)) {
      try {
        const r = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            resultsPerPage: 25, page: 1, sortSearch: "BY_PUBLICATION_DATE",
            keywords: [{ keyword: q, specificSearchCode: "EVERYWHERE" }],
            publicationPeriod: null, occupationUris: [], skillUris: [],
            requiredExperienceCodes: [], positionScheduleCodes: [], sectorCodes: [],
            educationAndQualificationLevelCodes: [], positionOfferingCodes: [],
            locationCodes: p.location ? [] : ["PL"], euresFlagCodes: [], otherBenefitsCodes: [],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) { console.warn(`[eures] HTTP ${r.status} dla "${q}"`); continue; }
        const j = await r.json();
        for (const row of j?.jvs ?? j?.data ?? []) {
          const desc: string = String(row.description ?? row.jobDescription ?? "").replace(/<[^>]*>/g, " ");
          const id = row.id ?? row.jvReference ?? Math.random().toString(36).slice(2);
          out.push({
            id: `eures:${id}`,
            source: "eures",
            sourceLabel: "EURES",
            title: row.title ?? "(bez nazwy)",
            company: row.employer?.name ?? row.employerName ?? null,
            location: [row.locationMap?.[0]?.cityName, row.locationMap?.[0]?.countryCode].filter(Boolean).join(", ") || null,
            remote: parseRemote(desc),
            salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
            contract: row.positionScheduleCodes?.[0] ?? null,
            description: desc.slice(0, 4000),
            skills: extractSkills(`${row.title ?? ""} ${desc}`),
            publishedAt: row.creationDate ?? row.publicationDate ?? null,
            url: `https://europa.eu/eures/portal/jv-se/jv-details/${id}`,
          });
        }
      } catch (e) {
        console.warn(`[eures] błąd dla "${q}":`, (e as Error).message);
      }
    }
    return out;
  }
}
