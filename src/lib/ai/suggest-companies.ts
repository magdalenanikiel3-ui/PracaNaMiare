import { getAI, parseJson } from "./provider";
import type { MasterProfile } from "../profile/schema";
import { profileSignals } from "./expand-queries";

/**
 * PODPOWIADANIE FIRM DO OBSERWOWANIA
 *
 * Lista obserwowanych firm jest z natury osobista — każdy użytkownik wpisuje
 * swoje. Ale puste pole i pytanie „jakie firmy Cię interesują?" to jeden
 * z najskuteczniejszych sposobów, żeby ktoś zamknął stronę.
 *
 * Dlatego model proponuje punkt startowy na podstawie profilu: firmy z tej
 * samej branży, o podobnym profilu działalności, z uwzględnieniem lokalizacji.
 * Użytkownik zostawia te, które go interesują, i dopisuje własne.
 *
 * Model podaje też PRZYPUSZCZALNY adres zakładki Kariera — w większości
 * polskich firm są to warianty /kariera, /praca, /careers. System sprawdza
 * je po kolei i zostawia ten, który zadziała.
 */

const SYSTEM = `Znasz polski rynek pracy i polskie firmy — duże, średnie i lokalne.

Twoje zadanie: zaproponować firmy, w których kandydat o podanym profilu
realnie mógłby pracować, i których warto pilnować w zakładce "Kariera".

ZASADY:
1. Podajesz WYŁĄCZNIE firmy, które faktycznie istnieją i działają w Polsce.
   Nie wymyślasz nazw. Jeśli nie jesteś pewien, że firma istnieje — pomijasz ją.
2. Mieszasz wielkości: kilka dużych rozpoznawalnych, kilka średnich, kilka
   mniej oczywistych. Same korporacje to bezużyteczna lista.
3. Uwzględniasz lokalizację kandydata. Firma bez obecności w jego regionie
   ma sens tylko przy pracy zdalnej.
4. "domain" to główna domena firmy bez protokołu, np. "orlen.pl".
   Jeśli nie znasz domeny na pewno — pomijasz firmę.
5. "why" to jedno krótkie zdanie po polsku, konkretnie: dlaczego akurat
   ta firma pasuje do tego profilu.
6. Nie podajesz agencji pracy tymczasowej ani firm rekrutacyjnych —
   kandydat szuka pracodawcy, nie pośrednika.`;

const SCHEMA = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string" },
          why: { type: "string" },
          size: { type: "string", enum: ["duza", "srednia", "mala"] },
        },
        required: ["name", "domain", "why", "size"],
      },
    },
  },
  required: ["companies"],
};

export type SuggestedCompany = {
  name: string;
  domain: string;
  why: string;
  size: "duza" | "srednia" | "mala";
  /** Adres zakładki Kariera ustalony przez sprawdzenie wariantów. */
  careerUrl: string | null;
};

/** Typowe adresy zakładek Kariera w polskich firmach, w kolejności popularności. */
const CAREER_PATHS = [
  "/kariera", "/praca", "/careers", "/career", "/kariera/oferty-pracy",
  "/o-nas/kariera", "/jobs", "/oferty-pracy", "/dolacz-do-nas", "/rekrutacja",
];

/** Sprawdzenie, który wariant adresu faktycznie istnieje. */
async function findCareerUrl(domain: string): Promise<string | null> {
  const base = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  for (const p of CAREER_PATHS) {
    try {
      const r = await fetch(base + p, {
        method: "HEAD",
        headers: { "User-Agent": "PracaNaMiare/0.6 (osobiste narzedzie do szukania pracy)" },
        signal: AbortSignal.timeout(6000),
        redirect: "follow",
      });
      if (r.ok) return base + p;
    } catch { /* próbujemy dalej */ }
  }
  return null;
}

export async function suggestCompanies(p: MasterProfile, limit = 12): Promise<SuggestedCompany[]> {
  const sig = profileSignals(p);
  const prefs = p.preferences;

  const prompt = `PROFIL KANDYDATA

Stanowiska dotychczas: ${sig.titles.join(", ") || "brak danych"}
Branże: ${sig.industries.join(", ") || "nieokreślone"}
Kluczowe umiejętności: ${sig.coreSkills.concat(sig.usedSkills).slice(0, 14).join(", ") || "brak danych"}
Doświadczenie: ok. ${sig.years} lat (poziom ${sig.seniority})
Interesujące kierunki: ${p.acceptedDirections.join(", ") || "jeszcze nie wybrano"}

PREFERENCJE
Lokalizacje: ${prefs.locations.join(", ") || "cała Polska"}
Tryb pracy: ${prefs.remote}
Typ firmy: ${prefs.companyTypes.join(", ")}

Zaproponuj ${limit} firm działających w Polsce, których zakładkę "Kariera"
warto pilnować przy tym profilu.`;

  const raw = await getAI().generate(prompt, { system: SYSTEM, schema: SCHEMA, temperature: 0.6 });
  const out = parseJson<{ companies: Omit<SuggestedCompany, "careerUrl">[] }>(raw);

  const list = (out.companies ?? []).slice(0, limit);

  // Ustalamy adresy równolegle, ale w małych partiach — nie zalewamy serwerów.
  const withUrls: SuggestedCompany[] = [];
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const urls = await Promise.all(batch.map((c) => findCareerUrl(c.domain).catch(() => null)));
    batch.forEach((c, j) => withUrls.push({ ...c, careerUrl: urls[j] }));
  }

  return withUrls;
}
