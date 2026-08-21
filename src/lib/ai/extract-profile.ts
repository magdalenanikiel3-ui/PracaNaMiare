import { getAI, parseJson, withRetry } from "./provider";
import { canonicalizeSkill, emptyProfile, type Confidence, type MasterProfile } from "../profile/schema";

/**
 * EKSTRAKCJA MASTER PROFILE Z DOKUMENTU
 *
 * Trzy naprawy względem v0.4:
 *
 * ─── 1. NAZWA PLIKU NIGDY NIE TRAFIA DO MODELU ───────────────────────────────
 * W v0.4 plik "CV_Magdalena_Nikiel_Iturri_final_v3.pdf" spowodował, że system
 * uznał "Iturri" (nazwę firmy, do której CV było przygotowane) za część nazwiska.
 *
 * Diagnoza w dokumencie projektowym była taka, że winny jest parser regułowy.
 * To nieprawda — przejście na AI samo z siebie tego nie naprawia, bo model
 * dostałby tę samą mylącą nazwę pliku i popełniłby ten sam błąd, tylko
 * bardziej przekonująco.
 *
 * Prawdziwa przyczyna: nazwa pliku w ogóle znalazła się w kontekście ekstrakcji.
 * Nazwa pliku to metadana, nie treść dokumentu. Poniżej nie jest przekazywana
 * nigdzie — funkcja przyjmuje wyłącznie bajty i typ MIME.
 *
 * ─── 2. PEWNOŚĆ WYLICZANA, NIE DEKLAROWANA ───────────────────────────────────
 * v0.4 prosił model o confidence 0–1. Modele podają takie liczby słabo
 * skalibrowane — "0.67" nie znaczy, że w 67% przypadków ma rację.
 * Tutaj model podaje wyłącznie wartość i cytat źródłowy, a poziom pewności
 * wyliczamy z tego, czy cytat DA SIĘ ZNALEŹĆ w dokumencie i czy wartość
 * przeszła walidację formatu.
 *
 * ─── 3. DOWÓD JEST WERYFIKOWANY, NIE OZDOBNY ─────────────────────────────────
 * v0.4 miał pole `evidence: string`, którego nikt nigdy nie sprawdzał —
 * model mógł tam wpisać cokolwiek. Tutaj każdy cytat jest porównywany
 * z tekstem dokumentu. Cytat, którego w dokumencie nie ma, obniża pewność
 * pola do "low" i kieruje je do potwierdzenia przez użytkownika.
 */

const SYSTEM = `Jesteś ekspertem od czytania CV. Analizujesz dokument i wyciągasz z niego
ustrukturyzowany profil zawodowy.

ZASADY BEZWZGLĘDNE:

1. NIE ZGADUJESZ. Jeśli nie jesteś pewien wartości pola, ustawiasz je na null.
   Wartość null jest ZAWSZE lepsza niż wartość zmyślona. System dopyta użytkownika.

2. DO KAŻDEJ WARTOŚCI PODAJESZ DOSŁOWNY CYTAT z dokumentu w polu "quote".
   Cytat musi występować w dokumencie znak w znak. Nie parafrazujesz, nie
   poprawiasz literówek, nie tłumaczysz. Kopiujesz.

3. ROZRÓŻNIASZ NAZWISKO OD KONTEKSTU. W CV bywają nazwy firm, do których
   dokument był przygotowany, nazwy projektów, miast i klientów. To NIE są
   części nazwiska. Nazwisko bierzesz wyłącznie z nagłówka dokumentu lub
   z danych kontaktowych.

4. POZIOM UMIEJĘTNOŚCI oceniasz po dowodach w treści, nie po deklaracji:
   - "core"      = pojawia się w opisie obowiązków wielokrotnie lub z konkretnym efektem,
   - "used"      = występuje w opisie obowiązków,
   - "mentioned" = wyłącznie na liście umiejętności, bez potwierdzenia w doświadczeniu.
   To rozróżnienie jest istotne — CV z listą dwudziestu narzędzi, z których
   żadne nie pojawia się w opisie pracy, to nie jest profil eksperta.

5. OBOWIĄZKI ROZBIJASZ na pojedyncze punkty. Przy każdym oznaczasz, czy zawiera
   mierzalny efekt (liczbę, procent, kwotę, skalę) — pole "quantified".

6. CV MOŻE MIEĆ DOWOLNY UKŁAD: dwie kolumny, tabele, ikony, nietypową kolejność
   sekcji, nagłówki po polsku lub angielsku. Czytasz dokument tak, jak czyta go
   człowiek — rozumiejąc układ, nie kolejność bajtów.

7. NIE INTERPRETUJESZ nazwy pliku, bo jej nie dostajesz. Opierasz się wyłącznie
   na treści dokumentu.

8. JĘZYKI OBCE WYCIĄGASZ ZAWSZE, gdy tylko są w dokumencie. To pole bywa
   pomijane, a jest jednym z najczęstszych wymagań w ogłoszeniach.
   W polskich CV języki bywają zapisane na wiele sposobów:
   - w osobnej sekcji "Języki", "Języki obce", "Languages",
   - jako lista z poziomem: "angielski – B2", "niemiecki: średniozaawansowany",
   - opisowo: "biegła znajomość angielskiego w mowie i piśmie",
   - graficznie: kropkami, gwiazdkami lub paskiem postępu przy nazwie języka,
   - flagami zamiast nazw,
   - wewnątrz podsumowania zawodowego lub opisu stanowiska.
   Poziom podajesz dokładnie tak, jak w dokumencie. Gdy jest tylko wykres
   albo kropki, wpisujesz to, co widzisz, np. "4/5" lub "zaawansowany".
   Gdy poziomu nie ma wcale — sam język, a poziom zostaw pusty.
   JĘZYK OJCZYSTY też wypisujesz, jeśli jest wymieniony.

9. CERTYFIKATY I UPRAWNIENIA wyciągasz tak samo skrupulatnie. W Polsce liczą
   się szczególnie: prawo jazdy z kategorią, uprawnienia SEP, uprawnienia
   budowlane, certyfikaty księgowe, ACCA, CIMA, PRINCE2, PMP, Scrum,
   certyfikaty językowe, uprawnienia na wózki widłowe, książeczka sanepidu.
   Znajdują się czasem poza sekcją "Certyfikaty" — także w opisie
   doświadczenia albo w dodatkowych informacjach.`;

const SCHEMA = {
  type: "object",
  properties: {
    person: {
      type: "object",
      properties: {
        firstName: v(), lastName: v(), email: v(), phone: v(), city: v(),
        links: { type: "array", items: { type: "string" } },
      },
    },
    headline: v(),
    summary: v(),
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: v(), title: v(), from: v(), to: v(), industry: v(),
          bullets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                quote: { type: "string" },
                skills: { type: "array", items: { type: "string" } },
                quantified: { type: "boolean" },
              },
              required: ["text", "quote", "skills", "quantified"],
            },
          },
        },
        required: ["company", "title", "from", "to", "bullets"],
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: ["technical", "tool", "business", "soft", "language"] },
          depth: { type: "string", enum: ["mentioned", "used", "core"] },
          quote: { type: "string" },
        },
        required: ["name", "category", "depth", "quote"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: { school: v(), field: v(), degree: v(), to: v() },
        required: ["school"],
      },
    },
    languages: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, level: { type: "string" }, quote: { type: "string" } },
        required: ["name"],
      },
    },
    certificates: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, issuer: { type: "string" }, date: { type: "string" } },
        required: ["name"],
      },
    },
    /** Pytania, które model chce zadać, bo czegoś nie ustalił. */
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { field: { type: "string" }, question: { type: "string" }, why: { type: "string" } },
        required: ["field", "question", "why"],
      },
    },
  },
  required: ["person", "experience", "skills"],
};

function v() {
  return {
    type: "object",
    properties: { value: { type: "string" }, quote: { type: "string" } },
    required: ["value", "quote"],
  };
}

type RawField = { value: string | null; quote: string | null };

export type ExtractionInput = {
  /** Wyłącznie bajty. Nazwa pliku CELOWO nie jest częścią tego typu. */
  bytes: Buffer;
  mimeType: string;
  /** Tekst wydobyty deterministycznie — służy do WERYFIKACJI cytatów. */
  plainText: string;
};

export async function extractProfile(input: ExtractionInput): Promise<MasterProfile> {
  const prompt = `Przeanalizuj załączone CV i wyciągnij z niego ustrukturyzowany profil zawodowy.

Dla orientacji, poniżej tekst wydobyty z dokumentu automatycznie. Może mieć
pomieszaną kolejność, jeśli CV jest wielokolumnowe — dlatego rozstrzygający
jest załączony dokument, a nie ten tekst. Cytaty w polach "quote" podawaj
tak, jak występują w dokumencie.

--- TEKST POMOCNICZY ---
${input.plainText.slice(0, 24000)}
--- KONIEC ---

Zanim odpowiesz, sprawdź jeszcze raz, czy nie pominąłeś:
  - języków obcych wraz z poziomem,
  - certyfikatów, uprawnień i prawa jazdy,
  - umiejętności wymienionych wewnątrz opisu obowiązków, a nie tylko na liście.
Te trzy rzeczy są najczęściej pomijane, a decydują o dopasowaniu do ofert.`;

  const raw = await withRetry(() => getAI().generate(prompt, {
    system: SYSTEM,
    schema: SCHEMA,
    temperature: 0.1,
    // Model dostaje ORYGINALNY plik — dzięki temu widzi układ stron, kolumny
    // i tabele. To jest właśnie różnica między "odczytaniem PDF" a "zrozumieniem CV".
    files: [{ mimeType: input.mimeType, data: input.bytes }],
  }), "analiza CV");

  return assemble(parseJson<Record<string, unknown>>(raw), input.plainText);
}

/** Normalizacja tekstu do porównań: to samo słowo zapisane inaczej ma się zgadzać. */
const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** Sedno weryfikacji dowodu: czy cytat NAPRAWDĘ jest w dokumencie. */
function quoteVerified(quote: string | null | undefined, source: string): boolean {
  if (!quote || quote.length < 3) return false;
  return fold(source).includes(fold(quote));
}

/**
 * Wyliczenie pewności z sygnałów strukturalnych.
 * Nigdzie w tej funkcji nie ma liczby pochodzącej od modelu — i o to chodzi.
 */
function confidenceOf(value: string | null, quote: string | null, source: string, validator?: (v: string) => boolean): Confidence {
  if (!value) return "missing";
  const verified = quoteVerified(quote, source);
  const inSource = fold(source).includes(fold(value));
  const formatOk = validator ? validator(value) : true;

  if (!formatOk) return "low";
  if (verified && inSource) return "high";
  if (verified || inSource) return "medium";
  return "low";
}

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s.trim());
const isPhone = (s: string) => (s.replace(/\D/g, "").length >= 9);

function assemble(r: Record<string, unknown>, source: string): MasterProfile {
  const p = emptyProfile();
  const person = (r.person ?? {}) as Record<string, RawField>;

  const mk = (id: string, f: RawField | undefined, validator?: (v: string) => boolean) => ({
    id,
    value: f?.value?.trim() || null,
    confidence: confidenceOf(f?.value ?? null, f?.quote ?? null, source, validator),
    evidence: f?.quote ? [{ quote: f.quote, verified: quoteVerified(f.quote, source) }] : [],
  });

  p.person.firstName = mk("person.firstName", person.firstName);
  p.person.lastName = mk("person.lastName", person.lastName);
  p.person.email = mk("person.email", person.email, isEmail);
  p.person.phone = mk("person.phone", person.phone, isPhone);
  p.person.city = mk("person.city", person.city);
  p.headline = mk("headline", (r.headline ?? undefined) as RawField | undefined);
  p.summary = mk("summary", (r.summary ?? undefined) as RawField | undefined);

  // ── doświadczenie ────────────────────────────────────────────────────────
  const exps = (r.experience ?? []) as Array<Record<string, unknown>>;
  p.experience = exps.map((e, i) => {
    const eid = `exp.${i}`;
    const bullets = ((e.bullets ?? []) as Array<Record<string, unknown>>).map((b, j) => ({
      id: `${eid}.b${j}`,
      text: String(b.text ?? ""),
      skills: ((b.skills ?? []) as string[]).map(String),
      quantified: Boolean(b.quantified),
      evidence: b.quote ? [{ quote: String(b.quote), verified: quoteVerified(String(b.quote), source) }] : [],
    })).filter((b) => b.text.length > 2);

    return {
      id: eid,
      company: mk(`${eid}.company`, e.company as RawField),
      title: mk(`${eid}.title`, e.title as RawField),
      from: mk(`${eid}.from`, e.from as RawField),
      to: mk(`${eid}.to`, e.to as RawField),
      industry: mk(`${eid}.industry`, e.industry as RawField),
      bullets,
    };
  });

  // ── umiejętności ─────────────────────────────────────────────────────────
  const seen = new Set<string>();
  p.skills = ((r.skills ?? []) as Array<Record<string, unknown>>)
    .map((s, i) => {
      const name = String(s.name ?? "").trim();
      const canonical = canonicalizeSkill(name);
      return {
        id: `skill.${i}`,
        name,
        canonical,
        category: (["technical", "tool", "business", "soft", "language"].includes(String(s.category))
          ? String(s.category) : "technical") as "technical" | "tool" | "business" | "soft" | "language",
        depth: (["mentioned", "used", "core"].includes(String(s.depth)) ? String(s.depth) : "mentioned") as "mentioned" | "used" | "core",
        evidenceRefs: [] as string[],
        yearsApprox: null,
      };
    })
    .filter((s) => {
      if (!s.name || s.canonical.length < 2 || seen.has(s.canonical)) return false;
      seen.add(s.canonical);
      return true;
    });

  // Powiązanie umiejętności z punktami doświadczenia, które je potwierdzają.
  // To jest podstawa późniejszego generowania CV: wiemy nie tylko CO kandydat umie,
  // ale GDZIE tego dowiódł.
  for (const s of p.skills) {
    for (const e of p.experience) {
      for (const b of e.bullets) {
        if (b.skills.some((x) => canonicalizeSkill(x) === s.canonical) || fold(b.text).includes(fold(s.name))) {
          s.evidenceRefs.push(b.id);
        }
      }
    }
    // Korekta poziomu na podstawie faktów, a nie deklaracji modelu.
    if (s.evidenceRefs.length >= 3) s.depth = "core";
    else if (s.evidenceRefs.length >= 1 && s.depth === "mentioned") s.depth = "used";
    else if (s.evidenceRefs.length === 0) s.depth = "mentioned";
  }

  p.education = ((r.education ?? []) as Array<Record<string, RawField>>).map((e, i) => ({
    id: `edu.${i}`,
    school: mk(`edu.${i}.school`, e.school),
    field: mk(`edu.${i}.field`, e.field),
    degree: mk(`edu.${i}.degree`, e.degree),
    to: mk(`edu.${i}.to`, e.to),
  }));

  const seenLang = new Set<string>();
  p.languages = ((r.languages ?? []) as Array<Record<string, unknown>>)
    .map((l, i) => ({
      id: `lang.${i}`,
      name: String(l.name ?? "").trim(),
      level: l.level ? String(l.level).trim() : null,
      confidence: quoteVerified(l.quote as string, source) ? ("high" as const) : ("medium" as const),
    }))
    .filter((l) => {
      const k = fold(l.name);
      if (!l.name || seenLang.has(k)) return false;
      seenLang.add(k);
      return true;
    });

  // Jezyk wymieniony w sekcji umiejetnosci, a pominiety w sekcji jezykow —
  // czesty przypadek w CV, gdzie angielski stoi obok Excela na jednej liscie.
  for (const sk of p.skills.filter((x) => x.category === "language")) {
    if (!seenLang.has(fold(sk.name))) {
      seenLang.add(fold(sk.name));
      p.languages.push({
        id: `lang.s${p.languages.length}`,
        name: sk.name,
        level: null,
        confidence: "low" as const,
      });
    }
  }

  p.certificates = ((r.certificates ?? []) as Array<Record<string, unknown>>).map((c, i) => ({
    id: `cert.${i}`,
    name: String(c.name ?? ""),
    issuer: c.issuer ? String(c.issuer) : null,
    date: c.date ? String(c.date) : null,
  })).filter((c) => c.name);

  // ── pytania do użytkownika ───────────────────────────────────────────────
  // Wszystko, czego nie udało się ustalić z wysoką pewnością, staje się pytaniem.
  // System PYTA zamiast zgadywać — to jest wymóg z dokumentu projektowego,
  // tutaj wyegzekwowany mechanicznie, a nie obiecany w prompcie.
  const asks = ((r.questions ?? []) as Array<Record<string, string>>).map((q) => ({
    fieldId: String(q.field ?? ""), question: String(q.question ?? ""), why: String(q.why ?? ""),
  })).filter((q) => q.question);

  p.openQuestions = [];
  const weak: Array<[string, string]> = [];
  const check = (f: { id: string; value: string | null; confidence: Confidence }, label: string) => {
    if (f.confidence === "missing" || f.confidence === "low") weak.push([f.id, label]);
  };
  check(p.person.firstName, "imię");
  check(p.person.lastName, "nazwisko");
  check(p.person.email, "adres e-mail");
  check(p.headline, "obecne stanowisko lub specjalizacja");

  // Jezyk bez poziomu jest w ogloszeniach bezuzyteczny — "angielski" nie mowi,
  // czy kandydat spelnia wymog "angielski B2". Lepiej dopytac.
  for (const l of p.languages.filter((x) => !x.level)) {
    p.openQuestions.push({
      fieldId: l.id,
      question: `Na jakim poziomie znasz język ${l.name.toLowerCase()}?`,
      why: "W CV nie było poziomu, a większość ogłoszeń podaje konkretny wymóg, np. B2.",
    });
  }

  p.openQuestions = [
    ...p.openQuestions,
    ...asks,
    ...weak.map(([fieldId, label]) => ({
      fieldId,
      question: `Nie udało się jednoznacznie ustalić: ${label}. Możesz to uzupełnić?`,
      why: "Wartość nie miała potwierdzenia w treści dokumentu, więc system woli zapytać, niż zgadywać.",
    })),
  ];

  p.updatedAt = new Date().toISOString();
  return p;
}
