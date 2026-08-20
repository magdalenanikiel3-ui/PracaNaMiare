import { z } from "zod";

/**
 * MASTER PROFILE — jedyne źródło prawdy o użytkowniku.
 *
 * Zasada architektoniczna: CV NIE jest źródłem prawdy. CV to jeden z wielu
 * dokumentów wejściowych. Wszystko, co system wie o użytkowniku, żyje tutaj,
 * a konkretne CV pod ofertę jest z tego GENEROWANE.
 *
 * Zasada antyhalucynacyjna: każde pole ma stabilny identyfikator (`id`).
 * Generator CV może wyłącznie WYBIERAĆ i PRZEFORMUŁOWYWAĆ pola po ich id.
 * Nie ma technicznej możliwości, żeby model dopisał doświadczenie, którego
 * nie ma w profilu — bo generator nie przyjmuje wolnego tekstu.
 */

/** Skąd w dokumencie pochodzi informacja. Musi dać się zweryfikować programowo. */
export const EvidenceSchema = z.object({
  /** Dosłowny fragment dokumentu źródłowego. Weryfikujemy, że naprawdę tam jest. */
  quote: z.string(),
  /** Numer strony (PDF) lub numer akapitu (DOCX). */
  page: z.number().int().nonnegative().optional(),
  /** Nazwa sekcji rozpoznanej w dokumencie, np. "Doświadczenie zawodowe". */
  section: z.string().optional(),
  /** Ustawiane przez nas, nie przez model: czy `quote` faktycznie istnieje w źródle. */
  verified: z.boolean().default(false),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * Pewność NIE pochodzi z modelu.
 *
 * Prośba do LLM o "podaj pewność w procentach" daje liczby słabo skalibrowane —
 * to w dużej mierze szum. Zamiast tego wyliczamy pewność z sygnałów
 * strukturalnych (patrz confidence.ts):
 *   - czy cytat źródłowy zweryfikował się dosłownie w dokumencie,
 *   - czy wartość znalazła się w rozpoznanej sekcji,
 *   - czy dwa niezależne przebiegi ekstrakcji dały ten sam wynik,
 *   - czy wartość przeszła walidację formatu (e-mail, data, telefon).
 */
export const ConfidenceSchema = z.enum([
  "confirmed", // użytkownik potwierdził ręcznie — najwyższy poziom
  "high",      // cytat zweryfikowany + rozpoznana sekcja + zgodne przebiegi
  "medium",    // częściowe potwierdzenie
  "low",       // model podał, ale nie udało się potwierdzić
  "missing",   // nie ustalono — system MA o to zapytać, nie zgadywać
]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Uniwersalna koperta na pojedynczą informację o użytkowniku. */
export const FieldSchema = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    id: z.string(),
    value: inner.nullable(),
    confidence: ConfidenceSchema,
    evidence: z.array(EvidenceSchema).default([]),
    /** Pytanie do użytkownika, gdy pewność jest za niska. */
    question: z.string().optional(),
  });

const Str = () => FieldSchema(z.string());

export const PersonSchema = z.object({
  firstName: Str(),
  lastName: Str(),
  email: Str(),
  phone: Str(),
  city: Str(),
  links: z.array(FieldSchema(z.string())).default([]),
});

export const ExperienceSchema = z.object({
  id: z.string(),
  company: Str(),
  title: Str(),
  from: Str(),
  to: Str(),
  /** Pojedyncze obowiązki/osiągnięcia — każde z własnym id, bo generator CV wybiera je po id. */
  bullets: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      /** Umiejętności, których ten punkt jest DOWODEM. Podstawa dopasowania do oferty. */
      skills: z.array(z.string()).default([]),
      /** Czy zawiera mierzalny efekt (liczba, %, kwota) — takie punkty są mocniejsze w CV. */
      quantified: z.boolean().default(false),
      evidence: z.array(EvidenceSchema).default([]),
    })
  ).default([]),
  industry: Str().optional(),
});

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Znormalizowana forma do porównań, np. "power bi" -> "powerbi". */
  canonical: z.string(),
  category: z.enum(["technical", "tool", "business", "soft", "language"]),
  /**
   * Poziom NIE deklarowany przez użytkownika, tylko wywnioskowany z dowodów:
   * "mentioned" = tylko wymieniona w sekcji umiejętności,
   * "used"      = pojawia się w opisie obowiązków,
   * "core"      = wielokrotnie, z mierzalnym efektem.
   * To rozróżnienie jest kluczowe — CV pełne wymienionych, nigdy nieużywanych
   * narzędzi to najczęstszy powód złego dopasowania.
   */
  depth: z.enum(["mentioned", "used", "core"]),
  /** Identyfikatory punktów doświadczenia, które to potwierdzają. */
  evidenceRefs: z.array(z.string()).default([]),
  yearsApprox: z.number().nullable().default(null),
});

export const EducationSchema = z.object({
  id: z.string(),
  school: Str(),
  field: Str(),
  degree: Str(),
  to: Str(),
});

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.string().nullable(),
  confidence: ConfidenceSchema,
});

export const CertificateSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
});

/** Preferencje — świadomie oddzielone od faktów. Fakty pochodzą z CV, preferencje od użytkownika. */
export const PreferencesSchema = z.object({
  locations: z.array(z.string()).default([]),
  remote: z.enum(["onsite", "hybrid", "remote", "any"]).default("any"),
  salaryMin: z.number().nullable().default(null),
  salaryCurrency: z.string().default("PLN"),
  salaryPeriod: z.enum(["month", "year", "hour"]).default("month"),
  contract: z.array(z.enum(["uop", "b2b", "zlecenie", "any"])).default(["any"]),
  companyTypes: z.array(z.enum(["polish", "international", "startup", "corp", "public", "any"])).default(["any"]),
  market: z.enum(["pl", "international", "all"]).default("all"),
  excludeCompanies: z.array(z.string()).default([]),
  /** Branże, do których użytkownik świadomie NIE chce wracać. Oszczędza mnóstwo przeglądania. */
  excludeIndustries: z.array(z.string()).default([]),
});

export const MasterProfileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  person: PersonSchema,
  headline: Str(),
  summary: Str(),
  experience: z.array(ExperienceSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  education: z.array(EducationSchema).default([]),
  languages: z.array(LanguageSchema).default([]),
  certificates: z.array(CertificateSchema).default([]),
  preferences: PreferencesSchema,
  /** Kierunki zawodowe zaakceptowane przez użytkownika (patrz expand-queries.ts). */
  acceptedDirections: z.array(z.string()).default([]),
  rejectedDirections: z.array(z.string()).default([]),
  /** Pytania, które system chce zadać, bo czegoś nie ustalił na pewno. */
  openQuestions: z.array(
    z.object({ fieldId: z.string(), question: z.string(), why: z.string() })
  ).default([]),
});

export type MasterProfile = z.infer<typeof MasterProfileSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;

export function emptyProfile(): MasterProfile {
  const f = (id: string) => ({ id, value: null, confidence: "missing" as const, evidence: [] });
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    person: {
      firstName: f("person.firstName"),
      lastName: f("person.lastName"),
      email: f("person.email"),
      phone: f("person.phone"),
      city: f("person.city"),
      links: [],
    },
    headline: f("headline"),
    summary: f("summary"),
    experience: [],
    skills: [],
    education: [],
    languages: [],
    certificates: [],
    preferences: PreferencesSchema.parse({}),
    acceptedDirections: [],
    rejectedDirections: [],
    openQuestions: [],
  };
}

/** Normalizacja nazw umiejętności do porównań między CV a ofertą. */
export function canonicalizeSkill(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#.]/g, "");
}
