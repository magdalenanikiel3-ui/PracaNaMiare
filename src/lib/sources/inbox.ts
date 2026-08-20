import { readJson } from "../store";
import { type JobSource, type Offer, type SearchParams, type SourceStatus } from "./types";

/**
 * SKRZYNKA — oferty przysłane przez wtyczkę do przeglądarki.
 *
 * TO JEST ODPOWIEDŹ NA PROBLEM PRACUJ.PL I OLX.
 *
 * Pracuj.pl i OLX nie udostępniają API do agregacji, a ich regulaminy zabraniają
 * pobierania treści automatami. Budowanie na obchodzeniu zabezpieczeń jest
 * ryzykowne prawnie i technicznie kruche — portal zmieni jeden selektor i
 * wszystko przestaje działać, a w gorszym wariancie dostajesz pismo od prawnika.
 *
 * Rozwiązanie: NIE pobieramy niczego serwerem i NIE budujemy własnej bazy ofert.
 * Wtyczka działa w przeglądarce użytkownika, na stronie, którą on sam otworzył
 * i którą ma prawo oglądać. Wtyczka odczytuje to, co użytkownik ma na ekranie,
 * i przekazuje do jego własnej, lokalnej aplikacji.
 *
 * Różnica jest zasadnicza:
 *   - my nie zwielokrotniamy bazy portalu,
 *   - treść nie opuszcza urządzenia użytkownika,
 *   - nie ma ruchu automatycznego po serwerach portalu,
 *   - użytkownik przetwarza dane, które i tak przed chwilą zobaczył.
 *
 * ⚠️ TO NADAL WYMAGA ŚWIADOMEJ DECYZJI. To rozwiązanie znacząco zmniejsza ryzyko,
 * ale go nie zeruje. Przed publicznym udostępnieniem produktu skonsultuj to
 * z prawnikiem — patrz sekcja "Kwestie prawne" w README.
 */

export type InboxStore = { offers: Offer[] };

export class InboxSource implements JobSource {
  id = "inbox";
  label = "Skrzynka z wtyczki (Pracuj.pl, OLX, LinkedIn)";
  legalNote = "Oferty odczytane w Twojej przeglądarce ze stron, które sam(a) otworzyłeś/aś. Nic nie jest pobierane automatycznie.";

  status(): SourceStatus {
    return { ok: true, label: this.label };
  }

  async search(p: SearchParams): Promise<Offer[]> {
    const store = await readJson<InboxStore>("inbox.json", { offers: [] });
    // Skrzynka nie filtruje po frazach — użytkownik już dokonał wyboru,
    // otwierając te oferty. Filtruje dopiero wspólny prefiltr i reranking.
    return store.offers.slice(0, p.maxResults ?? 200);
  }
}
