/**
 * TEST WYBORU KIERUNKÓW —  npm run test:kierunki
 *
 * Pilnuje zachowania, które wcześniej było mylące: pole `accepted` było
 * trójstanowe i "nieustawione" znaczyło "szukaj". Efekt: kliknięcie „Szukaj”
 * nie zmieniało niczego widocznego, bo wszystko i tak było wyszukiwane.
 *
 * Teraz to zwykły przełącznik, a ten test tego pilnuje — żeby przy kolejnej
 * zmianie w silniku ekspansji nie wróciła ta sama pułapka.
 */
import { buildQueries, mergeDirections, type Direction } from "../src/lib/ai/expand-queries";

const mk = (id: string, pl: string, stretch: "core" | "adjacent" | "pivot"): Direction => ({
  id, pl, variants: [pl + " EN"], family: "analityka", familyLabel: "A",
  origin: ["ai"], why: "", basedOn: ["skill.0"], stretch, score: 0, accepted: true,
});

const merged = mergeDirections([[
  mk("a", "Analityk BI", "core"), mk("b", "Analityk danych", "core"),
  mk("c", "Controlling", "adjacent"), mk("d", "Data Engineer", "pivot"),
]]);

const t: [string, boolean][] = [];
const chk = (n: string, c: boolean) => t.push([n, c]);

chk("ambitne domyslnie ODZNACZONE", merged.find((d) => d.id === "d")!.accepted === false);
chk("bliskie domyslnie zaznaczone", merged.find((d) => d.id === "a")!.accepted === true);

const q1 = buildQueries(merged, "pl");
chk("zapytania tylko z zaznaczonych", !q1.includes("Data Engineer"));
chk("zaznaczone sa w zapytaniach", q1.includes("Analityk BI"));

merged.find((d) => d.id === "a")!.accepted = false;
const q2 = buildQueries(merged, "pl");
chk("po odznaczeniu fraza znika", !q2.includes("Analityk BI"));
chk("reszta zostaje", q2.includes("Analityk danych"));

for (const d of merged) d.accepted = false;
chk("wszystko odznaczone = zero fraz", buildQueries(merged, "pl").length === 0);

for (const [n, ok] of t) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
const bad = t.filter(([, ok]) => !ok);
console.log(`\n  ${t.length - bad.length}/${t.length} zaliczonych`);
if (bad.length) process.exit(1);
