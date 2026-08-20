# Instalacja wtyczki

1. Uruchom aplikację (`URUCHOM.bat`) — wtyczka wysyła oferty do niej.
2. Otwórz w Chrome adres: `chrome://extensions`
3. Włącz **Tryb dewelopera** (przełącznik w prawym górnym rogu).
4. Kliknij **Załaduj rozpakowane** i wskaż ten folder (`extension`).
5. Kliknij ikonę wtyczki na pasku → wklej ten sam token, który masz
   w pliku `.env.local` jako `INGEST_TOKEN` → **Zapisz ustawienia**.

## Jak używać

Wejdź na dowolne ogłoszenie na Pracuj.pl, OLX, LinkedIn, theProtocol.it,
JustJoin.it lub NoFluffJobs. W prawym dolnym rogu pojawi się przycisk
**„Zapisz w Praca na miarę"**. Kliknięcie zapisuje ofertę w aplikacji.

Zapisane oferty biorą udział w dopasowaniu razem z ofertami z pozostałych
źródeł — dostajesz dla nich taką samą ocenę, uzasadnienie i listę luk.

## Dlaczego to działa na kliknięcie, a nie automatycznie

To jest świadoma decyzja, nie ograniczenie techniczne. Wtyczka odczytuje
wyłącznie stronę, którą sam(a) otworzyłeś/aś i masz przed oczami.
Nie chodzi po portalu, nie pobiera list wyników, nie buduje kopii bazy ofert.
Uzasadnienie w pliku `src/lib/sources/inbox.ts` i w sekcji „Kwestie prawne"
w README.

## Gdy przycisk się nie pojawia

Portale zmieniają swój kod bez zapowiedzi i selektory w `content.js`
przestają pasować. Napraw tak:

1. Otwórz ogłoszenie, naciśnij `F12` → zakładka **Elements**.
2. Znajdź nagłówek z nazwą stanowiska, kliknij prawym → **Copy** → **Copy selector**.
3. Wklej go na początek odpowiedniej listy w tablicy `PORTALS` w `content.js`.
4. W `chrome://extensions` kliknij ikonę odświeżenia przy wtyczce.

Selektory są celowo podane jako listy — wtyczka bierze pierwszy, który zadziała,
więc stare wpisy można zostawić.
