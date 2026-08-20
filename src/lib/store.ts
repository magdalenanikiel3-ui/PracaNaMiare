import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Najprostsza możliwa trwałość: pliki JSON w katalogu data/.
 *
 * Świadoma decyzja. v0.4 zakładał Prisma + PostgreSQL, co przy projekcie
 * jednoosobowym, bez budżetu i uruchamianym lokalnie oznacza: postawienie
 * serwera bazy, migracje i utrzymanie — zanim jeszcze wiadomo, czy produkt
 * ma sens. Pliki JSON dają zero konfiguracji i pełną przenośność.
 *
 * Bonus dla prywatności: dane użytkownika nie opuszczają jego dysku.
 * Wymiana na bazę danych, gdy przyjdzie czas na wersję webową, to jeden plik.
 */

const DIR = path.join(process.cwd(), "data");

async function ensure() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    await ensure();
    return JSON.parse(await fs.readFile(path.join(DIR, file), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await ensure();
  const target = path.join(DIR, file);
  const tmp = `${target}.tmp`;
  // Zapis atomowy — przerwanie w trakcie nie zostawia uszkodzonego pliku.
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, target);
}
