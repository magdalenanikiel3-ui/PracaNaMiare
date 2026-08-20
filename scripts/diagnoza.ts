/**
 * DIAGNOZA POKRYCIA ŹRÓDEŁ —  npm run diagnoza "analityk danych"
 *
 * PO CO TO ISTNIEJE:
 * „Trzeba przeszukiwać jak najwięcej stron" brzmi oczywiście, ale bez pomiaru
 * jest to zgadywanie. Może się okazać, że dwa agregatory dają 90% tego, co
 * pięć źródeł — a wtedy dokładanie kolejnych to strata czasu. Albo odwrotnie:
 * że jedno źródło nie daje NIC unikalnego i można je wyłączyć.
 *
 * Ten skrypt mierzy to, co naprawdę ma znaczenie: nie ile ofert daje źródło,
 * tylko ile daje ofert, KTÓRYCH NIE MA NIGDZIE INDZIEJ. Źródło z 200 ofertami,
 * z których wszystkie są też w innym źródle, jest warte zero.
 */
import { SOURCES } from "../src/lib/sources/registry";
import type { Offer } from "../src/lib/sources/types";

const key = (o: Offer) =>
  [
    (o.company ?? "").toLowerCase().replace(/\s|sp\.|z o\.o\.|s\.a\.|,/g, ""),
    o.title.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, "").slice(0, 40),
  ].join("|");

async function main() {
  const query = process.argv.slice(2).join(" ") || "analityk";
  console.log(`\n${"═".repeat(70)}`);
  console.log(`DIAGNOZA POKRYCIA — fraza: "${query}"`);
  console.log("═".repeat(70));

  const active = SOURCES.filter((s) => s.status().ok);
  const inactive = SOURCES.filter((s) => !s.status().ok);

  if (inactive.length) {
    console.log(`\nŹRÓDŁA NIEAKTYWNE (nie biorą udziału w teście):`);
    for (const s of inactive) {
      const st = s.status();
      if (!st.ok) console.log(`  ✗ ${s.label}\n      ${st.reason}${st.howToFix ? `\n      → ${st.howToFix}` : ""}`);
    }
  }

  console.log(`\nODPYTUJĘ ${active.length} ŹRÓDEŁ...\n`);

  const results = new Map<string, { label: string; offers: Offer[]; ms: number; error?: string }>();

  for (const s of active) {
    process.stdout.write(`  ${s.label.padEnd(38)}`);
    const t0 = Date.now();
    try {
      const offers = await s.search({ queries: [query], maxResults: 60 });
      const ms = Date.now() - t0;
      results.set(s.id, { label: s.label, offers, ms });
      console.log(`${String(offers.length).padStart(4)} ofert   ${String(ms).padStart(6)} ms`);
    } catch (e) {
      results.set(s.id, { label: s.label, offers: [], ms: Date.now() - t0, error: (e as Error).message });
      console.log(`   błąd: ${(e as Error).message}`);
    }
  }

  // ── ile każde źródło wnosi UNIKALNIE ──────────────────────────────────────
  const keysBySource = new Map([...results].map(([id, r]) => [id, new Set(r.offers.map(key))]));
  const allKeys = new Set<string>();
  for (const ks of keysBySource.values()) for (const k of ks) allKeys.add(k);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`WKŁAD UNIKALNY — ile ofert daje źródło, których NIE MA nigdzie indziej`);
  console.log("─".repeat(70));

  const rows: { label: string; total: number; unique: number; share: number }[] = [];
  for (const [id, r] of results) {
    const mine = keysBySource.get(id)!;
    let unique = 0;
    for (const k of mine) {
      let elsewhere = false;
      for (const [otherId, other] of keysBySource) {
        if (otherId !== id && other.has(k)) { elsewhere = true; break; }
      }
      if (!elsewhere) unique++;
    }
    rows.push({ label: r.label, total: r.offers.length, unique, share: r.offers.length ? unique / r.offers.length : 0 });
  }

  rows.sort((a, b) => b.unique - a.unique);
  console.log(`  ${"ŹRÓDŁO".padEnd(38)} ${"RAZEM".padStart(6)} ${"UNIKAT".padStart(7)} ${"%".padStart(6)}`);
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(38)} ${String(r.total).padStart(6)} ${String(r.unique).padStart(7)} ${String(Math.round(r.share * 100)).padStart(5)}%`);
  }

  console.log("─".repeat(70));
  console.log(`  ${"ŁĄCZNIE PO ODSIANIU DUPLIKATÓW".padEnd(38)} ${String(allKeys.size).padStart(6)}`);

  const sumRaw = rows.reduce((s, r) => s + r.total, 0);
  const dupes = sumRaw - allKeys.size;
  console.log(`  ${"DUPLIKATY MIĘDZY ŹRÓDŁAMI".padEnd(38)} ${String(dupes).padStart(6)}  (${sumRaw ? Math.round((dupes / sumRaw) * 100) : 0}%)`);

  // ── wnioski ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(70)}`);
  console.log(`WNIOSKI`);
  console.log("─".repeat(70));

  const useless = rows.filter((r) => r.total > 0 && r.unique === 0);
  const stars = rows.filter((r) => r.unique >= 5);
  const empty = rows.filter((r) => r.total === 0);

  if (stars.length) {
    console.log(`\n  Źródła, które realnie coś wnoszą:`);
    for (const r of stars) console.log(`    ✓ ${r.label} — ${r.unique} ofert nie do znalezienia gdzie indziej`);
  }
  if (useless.length) {
    console.log(`\n  Źródła bez unikalnego wkładu przy tej frazie:`);
    for (const r of useless) console.log(`    ~ ${r.label} — wszystko dubluje się z innymi`);
    console.log(`    (sprawdź inną frazę zanim wyłączysz — wkład bywa zależny od branży)`);
  }
  if (empty.length) {
    console.log(`\n  Źródła, które nie zwróciły nic:`);
    for (const r of empty) console.log(`    ✗ ${r.label} — sprawdź: npm run source ${[...results].find(([, x]) => x.label === r.label)?.[0]}`);
  }

  console.log(`\n  Fraza ma znaczenie. Uruchom to dla 3–4 różnych zawodów,`);
  console.log(`  zanim wyciągniesz wnioski o pokryciu.\n`);
}

main().catch((e) => { console.error("\nBłąd:", e.message, "\n"); process.exit(1); });
