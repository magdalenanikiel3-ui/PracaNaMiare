/**
 * NARZĘDZIE DO WERYFIKACJI KONEKTORA — `npm run source <id> [fraza]`
 *
 * PO CO TO ISTNIEJE:
 * Konektory zostały napisane na podstawie dokumentacji i typowych kształtów
 * odpowiedzi, ale NIE zostały uruchomione przeciwko żywym API. Portale zmieniają
 * swoje odpowiedzi bez zapowiedzi.
 *
 * Zanim uznasz, że źródło "nie działa", uruchom to i zobacz, co naprawdę wraca.
 * Skrypt pokazuje surową odpowiedź, więc poprawienie mapowania to kwestia minut.
 *
 * Przykłady:
 *   npm run source cbop
 *   npm run source adzuna "analityk danych"
 *   npm run source            (lista wszystkich źródeł i ich stan)
 */
import { config } from "node:process";
import { SOURCES, getSource } from "../src/lib/sources/registry";

void config;

async function main() {
  const [, , id, ...rest] = process.argv;
  const query = rest.join(" ") || "analityk";

  if (!id) {
    console.log("\nDostępne źródła:\n");
    for (const s of SOURCES) {
      const st = s.status();
      console.log(`  ${st.ok ? "✓" : "✗"}  ${s.id.padEnd(10)} ${s.label}`);
      if (!st.ok) console.log(`     └─ ${st.reason}${st.howToFix ? ` → ${st.howToFix}` : ""}`);
    }
    console.log(`\nUżycie: npm run source <id> ["fraza"]\n`);
    return;
  }

  const src = getSource(id);
  if (!src) { console.error(`Nie znam źródła "${id}".`); process.exit(1); }

  const st = src.status();
  if (!st.ok) {
    console.error(`\n✗ ${src.label} nie jest skonfigurowane.`);
    console.error(`  ${st.reason}`);
    if (st.howToFix) console.error(`  → ${st.howToFix}\n`);
    process.exit(1);
  }

  console.log(`\nPytam: ${src.label}`);
  console.log(`Fraza: "${query}"\n`);

  const t0 = Date.now();
  const offers = await src.search({ queries: [query], maxResults: 10 });
  const ms = Date.now() - t0;

  if (offers.length === 0) {
    console.log(`✗ Zero wyników po ${ms} ms.\n`);
    console.log(`Możliwe przyczyny:`);
    console.log(`  1. Zmienił się kształt odpowiedzi API → popraw mapowanie w src/lib/sources/${id}.ts`);
    console.log(`  2. Fraza faktycznie nic nie zwraca → spróbuj innej`);
    console.log(`  3. Zmienił się adres API → sprawdź w przeglądarce (F12 → Network)\n`);
    process.exit(1);
  }

  console.log(`✓ ${offers.length} ofert w ${ms} ms\n`);
  for (const o of offers.slice(0, 5)) {
    console.log(`  ${o.title}`);
    console.log(`    ${[o.company, o.location, o.remote].filter(Boolean).join(" · ")}`);
    if (o.salaryMin) console.log(`    ${o.salaryMin}${o.salaryMax ? `–${o.salaryMax}` : ""} ${o.salaryCurrency}/${o.salaryPeriod}`);
    if (o.skills.length) console.log(`    umiejętności: ${o.skills.join(", ")}`);
    console.log(`    ${o.url}\n`);
  }

  // Kontrola jakości mapowania — puste pola oznaczają błąd w konektorze, nie brak danych.
  const empty = {
    firma: offers.filter((o) => !o.company).length,
    lokalizacja: offers.filter((o) => !o.location).length,
    opis: offers.filter((o) => o.description.length < 40).length,
    link: offers.filter((o) => !o.url || !o.url.startsWith("http")).length,
  };
  const problems = Object.entries(empty).filter(([, n]) => n > offers.length / 2);
  if (problems.length) {
    console.log(`⚠ Podejrzanie dużo pustych pól — prawdopodobnie złe mapowanie w src/lib/sources/${id}.ts:`);
    for (const [f, n] of problems) console.log(`    ${f}: puste w ${n}/${offers.length} ofertach`);
    console.log("");
  }
}

main().catch((e) => { console.error("\nBłąd:", e.message, "\n"); process.exit(1); });
