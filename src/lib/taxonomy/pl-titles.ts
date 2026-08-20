/**
 * TAKSONOMIA STANOWISK PL ↔ EN
 *
 * UWAGA ARCHITEKTONICZNA — to jest siatka bezpieczeństwa, NIE mechanizm.
 *
 * W v0.4 lista 11 zahardkodowanych ról BYŁA mechanizmem — i to jest dokładnie
 * ten problem, który użytkownik zgłasza: "nie wiem, jakie stanowisko wpisać".
 * Stała lista rozwiązuje go tylko dla tych 11 zawodów. Magazynier, technolog
 * żywności, koordynator transportu czy fizjoterapeuta nie dostają nic.
 *
 * Dlatego tutaj trzymamy tylko:
 *   1) rodziny zawodowe jako punkt startowy dla modelu,
 *   2) mapowania PL↔EN, których model nie musi zgadywać,
 *   3) słownik do WERYFIKACJI tego, co model wymyśli.
 *
 * Prawdziwe rozszerzanie zapytań robi expand-queries.ts — z profilu, z modelu
 * i z tego, co faktycznie występuje na rynku.
 */

export type Family =
  | "analityka" | "it" | "finanse" | "sprzedaz" | "marketing" | "hr"
  | "logistyka" | "produkcja" | "budownictwo" | "zdrowie" | "edukacja"
  | "administracja" | "obsluga_klienta" | "prawo" | "gastronomia" | "inne";

export const FAMILY_LABELS: Record<Family, string> = {
  analityka: "Analityka i raportowanie",
  it: "IT i technologie",
  finanse: "Finanse i księgowość",
  sprzedaz: "Sprzedaż i rozwój biznesu",
  marketing: "Marketing i komunikacja",
  hr: "HR i rekrutacja",
  logistyka: "Logistyka i łańcuch dostaw",
  produkcja: "Produkcja i utrzymanie ruchu",
  budownictwo: "Budownictwo i nieruchomości",
  zdrowie: "Zdrowie i opieka",
  edukacja: "Edukacja i szkolenia",
  administracja: "Administracja i biuro",
  obsluga_klienta: "Obsługa klienta",
  prawo: "Prawo i compliance",
  gastronomia: "Gastronomia i hotelarstwo",
  inne: "Pozostałe",
};

export type TitleEntry = {
  pl: string;
  en: string[];
  family: Family;
  /** Typowe umiejętności-sygnały. Używane do podpowiadania rodziny, nie do decyzji. */
  signals: string[];
};

export const TITLES: TitleEntry[] = [
  // ── analityka ────────────────────────────────────────────────────────────
  { pl: "Analityk BI", en: ["BI Analyst", "Business Intelligence Analyst", "BI Developer"], family: "analityka", signals: ["power bi", "dax", "tableau", "qlik", "power query", "hurtownia danych"] },
  { pl: "Analityk danych", en: ["Data Analyst", "Analytics Analyst"], family: "analityka", signals: ["sql", "python", "excel", "statystyka", "wizualizacja danych"] },
  { pl: "Specjalista ds. raportowania", en: ["Reporting Analyst", "Reporting Specialist", "MIS Analyst"], family: "analityka", signals: ["raporty", "excel", "sql", "kpi"] },
  { pl: "Analityk biznesowy", en: ["Business Analyst", "Systems Analyst"], family: "analityka", signals: ["wymagania", "procesy", "bpmn", "user story", "jira"] },
  { pl: "Inżynier danych", en: ["Data Engineer", "ETL Developer"], family: "analityka", signals: ["etl", "airflow", "dbt", "spark", "snowflake"] },
  { pl: "Analityk finansowy", en: ["Financial Analyst", "FP&A Analyst"], family: "finanse", signals: ["budżet", "forecast", "fp&a", "modelowanie finansowe"] },
  // ── it ───────────────────────────────────────────────────────────────────
  { pl: "Programista frontend", en: ["Frontend Developer", "Front-end Engineer"], family: "it", signals: ["react", "javascript", "typescript", "css", "vue", "angular"] },
  { pl: "Programista backend", en: ["Backend Developer", "Back-end Engineer"], family: "it", signals: ["java", "node.js", "c#", ".net", "python", "spring", "api"] },
  { pl: "Tester oprogramowania", en: ["QA Engineer", "Test Engineer", "QA Automation Engineer"], family: "it", signals: ["testy", "selenium", "cypress", "playwright", "qa"] },
  { pl: "Administrator systemów", en: ["System Administrator", "SysAdmin", "IT Administrator"], family: "it", signals: ["windows server", "linux", "active directory", "vmware"] },
  { pl: "Specjalista ds. wsparcia IT", en: ["IT Support Specialist", "Helpdesk Specialist", "Service Desk Analyst"], family: "it", signals: ["helpdesk", "wsparcie", "itil", "service desk"] },
  { pl: "Inżynier DevOps", en: ["DevOps Engineer", "Platform Engineer", "SRE"], family: "it", signals: ["docker", "kubernetes", "ci/cd", "terraform", "aws", "azure"] },
  // ── finanse ──────────────────────────────────────────────────────────────
  { pl: "Księgowy", en: ["Accountant", "General Ledger Accountant"], family: "finanse", signals: ["księgowość", "sap", "vat", "cit", "bilans", "optima", "symfonia"] },
  { pl: "Główny księgowy", en: ["Chief Accountant", "Finance Manager"], family: "finanse", signals: ["sprawozdanie finansowe", "ustawa o rachunkowości", "zespół księgowy"] },
  { pl: "Specjalista ds. kadr i płac", en: ["Payroll Specialist", "HR Payroll Specialist"], family: "finanse", signals: ["płace", "zus", "pit", "kadry", "płatnik"] },
  { pl: "Kontroler finansowy", en: ["Financial Controller", "Business Controller"], family: "finanse", signals: ["kontroling", "budżetowanie", "analiza odchyleń", "marża"] },
  // ── sprzedaż / marketing / hr ────────────────────────────────────────────
  { pl: "Specjalista ds. sprzedaży", en: ["Sales Specialist", "Sales Executive", "Sales Representative"], family: "sprzedaz", signals: ["sprzedaż", "b2b", "crm", "negocjacje", "plan sprzedaży"] },
  { pl: "Opiekun klienta / Account Manager", en: ["Account Manager", "Key Account Manager", "Client Partner"], family: "sprzedaz", signals: ["klienci kluczowi", "b2b", "utrzymanie klienta", "upsell"] },
  { pl: "Przedstawiciel handlowy", en: ["Sales Representative", "Field Sales Representative"], family: "sprzedaz", signals: ["teren", "prawo jazdy", "wizyty handlowe"] },
  { pl: "Specjalista ds. marketingu", en: ["Marketing Specialist", "Marketing Executive"], family: "marketing", signals: ["kampanie", "social media", "google ads", "seo", "content"] },
  { pl: "Specjalista ds. rekrutacji", en: ["Recruiter", "Talent Acquisition Specialist", "IT Recruiter"], family: "hr", signals: ["rekrutacja", "ats", "sourcing", "rozmowy kwalifikacyjne"] },
  { pl: "Specjalista ds. HR", en: ["HR Specialist", "HR Generalist", "People Partner"], family: "hr", signals: ["hr", "onboarding", "kadry", "polityka personalna"] },
  // ── logistyka / produkcja ────────────────────────────────────────────────
  { pl: "Specjalista ds. logistyki", en: ["Logistics Specialist", "Supply Chain Specialist"], family: "logistyka", signals: ["logistyka", "transport", "spedycja", "wms", "łańcuch dostaw"] },
  { pl: "Spedytor", en: ["Freight Forwarder", "Transport Planner"], family: "logistyka", signals: ["spedycja", "fracht", "cmr", "przewoźnicy"] },
  { pl: "Koordynator transportu", en: ["Transport Coordinator", "Fleet Coordinator"], family: "logistyka", signals: ["transport", "flota", "kierowcy", "trasy"] },
  { pl: "Magazynier", en: ["Warehouse Operative", "Warehouse Worker"], family: "logistyka", signals: ["magazyn", "wózek widłowy", "kompletacja", "inwentaryzacja"] },
  { pl: "Specjalista ds. zakupów", en: ["Procurement Specialist", "Buyer", "Purchasing Specialist"], family: "logistyka", signals: ["zakupy", "dostawcy", "przetargi", "negocjacje cenowe"] },
  { pl: "Inżynier procesu", en: ["Process Engineer", "Manufacturing Engineer"], family: "produkcja", signals: ["produkcja", "lean", "six sigma", "optymalizacja procesu"] },
  { pl: "Kierownik produkcji", en: ["Production Manager", "Plant Manager"], family: "produkcja", signals: ["produkcja", "zespół produkcyjny", "plan produkcji", "kpi"] },
  { pl: "Specjalista ds. jakości", en: ["Quality Specialist", "QA Specialist", "Quality Engineer"], family: "produkcja", signals: ["jakość", "iso", "audyt", "reklamacje", "haccp"] },
  { pl: "Automatyk / Utrzymanie ruchu", en: ["Maintenance Technician", "Automation Engineer"], family: "produkcja", signals: ["utrzymanie ruchu", "plc", "siemens", "awarie", "elektryka"] },
  // ── pozostałe rodziny ────────────────────────────────────────────────────
  { pl: "Kierownik projektu", en: ["Project Manager", "Project Lead", "Delivery Manager"], family: "administracja", signals: ["projekt", "harmonogram", "budżet projektu", "prince2", "scrum"] },
  { pl: "Specjalista ds. obsługi klienta", en: ["Customer Service Specialist", "Customer Support Specialist"], family: "obsluga_klienta", signals: ["obsługa klienta", "reklamacje", "call center", "crm"] },
  { pl: "Asystent / Specjalista ds. administracyjnych", en: ["Office Administrator", "Administrative Assistant", "Office Manager"], family: "administracja", signals: ["biuro", "administracja", "faktury", "korespondencja"] },
  { pl: "Kierownik budowy", en: ["Site Manager", "Construction Manager"], family: "budownictwo", signals: ["budowa", "uprawnienia budowlane", "kosztorys", "podwykonawcy"] },
  { pl: "Projektant / Konstruktor", en: ["Design Engineer", "CAD Designer"], family: "budownictwo", signals: ["autocad", "solidworks", "revit", "dokumentacja techniczna"] },
  { pl: "Pielęgniarka / Pielęgniarz", en: ["Nurse", "Registered Nurse"], family: "zdrowie", signals: ["pielęgniarstwo", "opieka", "pacjent", "prawo wykonywania zawodu"] },
  { pl: "Fizjoterapeuta", en: ["Physiotherapist"], family: "zdrowie", signals: ["fizjoterapia", "rehabilitacja", "pacjent"] },
  { pl: "Nauczyciel / Trener", en: ["Teacher", "Trainer", "Instructor"], family: "edukacja", signals: ["nauczanie", "szkolenia", "dydaktyka", "program nauczania"] },
  { pl: "Specjalista ds. prawnych", en: ["Legal Specialist", "Legal Counsel", "Compliance Specialist"], family: "prawo", signals: ["umowy", "rodo", "compliance", "prawo"] },
  { pl: "Kucharz", en: ["Chef", "Cook"], family: "gastronomia", signals: ["kuchnia", "haccp", "menu", "gastronomia"] },
  { pl: "Kelner / Barista", en: ["Waiter", "Barista"], family: "gastronomia", signals: ["obsługa gości", "kelnerstwo", "kawa", "restauracja"] },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Zwraca wpisy taksonomii pasujące do zbioru umiejętności — podpowiedź startowa dla modelu. */
export function familiesForSkills(skills: string[]): TitleEntry[] {
  const set = new Set(skills.map(norm));
  const scored = TITLES.map((t) => ({
    t,
    hits: t.signals.filter((s) => {
      const n = norm(s);
      return set.has(n) || [...set].some((x) => x.includes(n) || n.includes(x));
    }).length,
  })).filter((x) => x.hits > 0);
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 12).map((x) => x.t);
}

/** Czy tytuł wymyślony przez model istnieje w taksonomii — sygnał do wyliczenia pewności. */
export function lookupTitle(title: string): TitleEntry | null {
  const n = norm(title);
  return TITLES.find((t) => norm(t.pl) === n || t.en.some((e) => norm(e) === n)) ?? null;
}

/** Tłumaczenie PL→EN i EN→PL bez pytania modelu (darmowe i deterministyczne). */
export function translateTitle(title: string): string[] {
  const e = lookupTitle(title);
  if (!e) return [];
  const n = norm(title);
  return norm(e.pl) === n ? e.en : [e.pl];
}
