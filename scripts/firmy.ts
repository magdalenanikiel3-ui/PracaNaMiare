/**
 * OBSERWOWANE FIRMY Z WIERSZA POLECEŃ —  npm run firmy [komenda]
 *
 *   npm run firmy                              lista i stan
 *   npm run firmy add "Orlen" https://...      dodaj firmę
 *   npm run firmy rm orlen                     usuń
 *   npm run firmy refresh                      odczytaj wszystkie od nowa
 *   npm run firmy test https://.../kariera     sprawdź adres bez dodawania
 *
 * Ostatnia komenda jest najważniejsza przy dodawaniu nowej firmy:
 * pokazuje, czy z danego adresu da się cokolwiek odczytać, ZANIM dopiszesz
 * go do listy.
 */
import { addCompany, getWatchlist, refreshAll, removeCompany } from "../src/lib/sources/watchlist";
import { readJobsPage } from "../src/lib/sources/page-reader";

async function main() {
  const [, , cmd, a, b] = process.argv;

  if (cmd === "add") {
    if (!a || !b) { console.error('Użycie: npm run firmy add "Nazwa" https://firma.pl/kariera'); process.exit(1); }
    console.log(`\nSprawdzam ${b} ...`);
    const res = await readJobsPage(b, "test", "test");
    if (res.error && res.offers.length === 0) {
      console.log(`\n  ✗ ${res.error}`);
      console.log(`  Firma zostanie dodana mimo to — może to chwilowy problem.`);
      console.log(`  Jeśli się powtórzy, znajdź adres prowadzący wprost do LISTY ogłoszeń.\n`);
    } else {
      console.log(`  ✓ znaleziono ${res.offers.length} ofert`);
      for (const o of res.offers.slice(0, 5)) console.log(`      ${o.title}${o.location ? ` — ${o.location}` : ""}`);
      console.log("");
    }
    await addCompany(a, b);
    console.log(`Dodano: ${a}\n`);
    return;
  }

  if (cmd === "rm") {
    if (!a) { console.error("Podaj identyfikator firmy (zobacz: npm run firmy)"); process.exit(1); }
    await removeCompany(a);
    console.log(`\nUsunięto: ${a}\n`);
    return;
  }

  if (cmd === "test") {
    if (!a) { console.error("Użycie: npm run firmy test https://firma.pl/kariera"); process.exit(1); }
    console.log(`\nCzytam ${a} ...\n`);
    const res = await readJobsPage(a, "test", "test");
    if (res.error) console.log(`  ⚠ ${res.error}`);
    console.log(`  Wygląda na stronę z ofertami: ${res.looksLikeJobsPage ? "tak" : "nie"}`);
    console.log(`  Znaleziono ofert: ${res.offers.length}\n`);
    for (const o of res.offers) {
      console.log(`    ${o.title}`);
      if (o.location) console.log(`      ${o.location}`);
      console.log(`      ${o.url}`);
    }
    console.log("");
    return;
  }

  if (cmd === "refresh") {
    console.log(`\nOdczytuję wszystkie obserwowane firmy...\n`);
    const w = await refreshAll(true);
    for (const c of w.companies) {
      const mark = c.lastError ? "⚠" : c.offers.length ? "✓" : "·";
      console.log(`  ${mark} ${c.name.padEnd(28)} ${String(c.offers.length).padStart(3)} ofert${c.lastError ? `   ${c.lastError}` : ""}`);
    }
    console.log("");
    return;
  }

  const w = await getWatchlist();
  if (w.companies.length === 0) {
    console.log(`\nLista obserwowanych firm jest pusta.\n`);
    console.log(`Dodaj pierwszą:   npm run firmy add "Nazwa firmy" https://firma.pl/kariera`);
    console.log(`Albo w aplikacji — tam model podpowie firmy pasujące do Twojego profilu.\n`);
    return;
  }

  console.log(`\nOBSERWOWANE FIRMY (${w.companies.length})\n`);
  for (const c of w.companies) {
    const mark = c.lastError ? "⚠" : c.offers.length ? "✓" : "·";
    console.log(`  ${mark} ${c.name}`);
    console.log(`      ${c.careerUrl}`);
    console.log(`      ofert: ${c.offers.length}   sprawdzono: ${c.lastChecked ? new Date(c.lastChecked).toLocaleString("pl-PL") : "nigdy"}`);
    if (c.lastError) console.log(`      ⚠ ${c.lastError}`);
    console.log("");
  }
}

main().catch((e) => { console.error("\nBłąd:", e.message, "\n"); process.exit(1); });
