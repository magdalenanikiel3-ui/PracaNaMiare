/**
 * ZESTAW WZORCOWY — mierzenie jakości analizy CV.  `npm run eval`
 *
 * DLACZEGO TO JEST NAJWAŻNIEJSZY PLIK W PROJEKCIE:
 *
 * Bez tego zdanie "nowa wersja parsera jest lepsza" jest opinią, nie faktem.
 * Zmieniasz prompt, poprawia się jedno CV, psują się trzy inne — i nikt tego
 * nie zauważa, dopóki nie zgłosi tego użytkownik.
 *
 * Dokument projektowy opisuje, że test na prawdziwym CV wykrył błąd "Iturri".
 * To był przypadek. Ten plik zamienia przypadek w proces.
 *
 * JAK ZBUDOWAĆ ZESTAW (zrób to, zanim zaczniesz poprawiać prompty):
 *
 *   1. Zbierz 20–50 prawdziwych CV. Własne, znajomych (za zgodą), przykładowe
 *      z internetu. Im bardziej różnorodne, tym lepiej: jedno- i dwukolumnowe,
 *      z tabelami, ze zdjęciem, po polsku i po angielsku, z różnych branż.
 *   2. Dla każdego utwórz parę plików w eval/cases/:
 *        nazwa.pdf   — sam dokument
 *        nazwa.json  — co POWINNO zostać odczytane (wypełniasz ręcznie)
 *   3. Uruchom `npm run eval` i zapisz wynik jako punkt odniesienia.
 *   4. Po KAŻDEJ zmianie promptu uruchom ponownie i porównaj.
 *
 * Format pliku oczekiwań (wystarczą pola, które chcesz sprawdzać):
 *   {
 *     "firstName": "Magdalena",
 *     "lastName": "Nikiel",
 *     "email": "...",
 *     "experienceCount": 4,
 *     "mustHaveSkills": ["Power BI", "SQL"],
 *     "mustNotContain": ["Iturri"]
 *   }
 *
 * Pole "mustNotContain" jest kluczowe — to test regresji na konkretne błędy,
 * które już raz wystąpiły. Błąd naprawiony bez testu wraca.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractProfile } from "../src/lib/ai/extract-profile";
import { readDocument, modelInput } from "../src/lib/profile/read-document";

type Expected = {
  firstName?: string; lastName?: string; email?: string;
  experienceCount?: number; mustHaveSkills?: string[]; mustNotContain?: string[];
};

const DIR = path.join(process.cwd(), "eval", "cases");
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

async function main() {
  let files: string[] = [];
  try {
    files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".pdf") || f.endsWith(".docx"));
  } catch {
    console.log(`\nBrak katalogu ${DIR}.\n`);
    return;
  }

  if (files.length === 0) {
    console.log(`\nZestaw wzorcowy jest pusty.\n`);
    console.log(`Wrzuć CV do eval/cases/ razem z plikiem .json opisującym oczekiwany wynik.`);
    console.log(`Szczegóły w komentarzu na górze eval/run.ts.\n`);
    console.log(`To NIE jest opcjonalne, jeśli chcesz świadomie poprawiać jakość analizy CV.\n`);
    return;
  }

  let checks = 0, passed = 0;
  const failures: string[] = [];

  for (const f of files) {
    const base = f.replace(/\.(pdf|docx)$/, "");
    let exp: Expected;
    try {
      exp = JSON.parse(await fs.readFile(path.join(DIR, `${base}.json`), "utf-8"));
    } catch {
      console.log(`  ⊘ ${base} — brak pliku ${base}.json, pomijam`);
      continue;
    }

    process.stdout.write(`  … ${base}`);
    const bytes = await fs.readFile(path.join(DIR, f));
    const mime = f.endsWith(".pdf") ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    try {
      const { text } = await readDocument(bytes, mime);
      const mi = modelInput(bytes, mime, text);
      const p = await extractProfile({
        bytes: mi?.data ?? Buffer.from(""),
        mimeType: mi?.mimeType ?? "text/plain",
        plainText: text,
      });

      const check = (name: string, ok: boolean, got: string) => {
        checks++;
        if (ok) passed++;
        else failures.push(`${base} → ${name}: ${got}`);
      };

      if (exp.firstName) check("imię", fold(p.person.firstName.value ?? "") === fold(exp.firstName), `oczekiwano "${exp.firstName}", jest "${p.person.firstName.value}"`);
      if (exp.lastName) check("nazwisko", fold(p.person.lastName.value ?? "") === fold(exp.lastName), `oczekiwano "${exp.lastName}", jest "${p.person.lastName.value}"`);
      if (exp.email) check("e-mail", fold(p.person.email.value ?? "") === fold(exp.email), `oczekiwano "${exp.email}", jest "${p.person.email.value}"`);
      if (exp.experienceCount !== undefined) check("liczba miejsc pracy", p.experience.length === exp.experienceCount, `oczekiwano ${exp.experienceCount}, jest ${p.experience.length}`);

      for (const s of exp.mustHaveSkills ?? []) {
        check(`umiejętność "${s}"`, p.skills.some((x) => fold(x.name).includes(fold(s))), "nie znaleziono");
      }

      // Test regresji: konkretne błędy, które już raz wystąpiły.
      const blob = fold(JSON.stringify(p));
      for (const s of exp.mustNotContain ?? []) {
        check(`nie zawiera "${s}"`, !blob.includes(fold(s)), `ZNALEZIONO — to jest regresja`);
      }

      process.stdout.write("\r");
      console.log(`  ✓ ${base}`.padEnd(60));
    } catch (e) {
      process.stdout.write("\r");
      console.log(`  ✗ ${base} — ${(e as Error).message}`);
      checks++; failures.push(`${base} → wyjątek: ${(e as Error).message}`);
    }
  }

  console.log(`\n${"─".repeat(58)}`);
  console.log(`WYNIK: ${passed}/${checks} sprawdzeń zaliczonych (${checks ? Math.round((passed / checks) * 100) : 0}%)`);
  if (failures.length) {
    console.log(`\nBŁĘDY:`);
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log("");
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
