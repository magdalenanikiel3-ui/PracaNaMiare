@echo off
chcp 65001 >nul
title Przenoszenie projektu poza OneDrive
cd /d "%~dp0"

set "CEL=C:\Projekty\praca-na-miare"

echo.
echo   ========================================
echo     PRZENIESIENIE PROJEKTU POZA ONEDRIVE
echo   ========================================
echo.
echo   DLACZEGO TO JEST POTRZEBNE
echo.
echo   npm tworzy dziesiatki tysiecy malych plikow w folderze
echo   node_modules. OneDrive probuje synchronizowac kazdy z nich
echo   do chmury na biezaco. Efekty:
echo.
echo     - instalacja trwa kilkanascie minut zamiast kilkunastu sekund
echo     - czesto przerywa sie w polowie i zostawia uszkodzony folder
echo     - pliki ustawien potrafia sie cofac do starszej wersji
echo.
echo   Pomiar z tego projektu: OneDrive - ponad 3 minuty i brak
echo   zakonczenia. Zwykly folder na dysku - 13 sekund.
echo.
echo   ----------------------------------------
echo   SKAD:  %CD%
echo   DOKAD: %CEL%
echo   ----------------------------------------
echo.
echo   Oryginal w OneDrive ZOSTANIE nietkniety jako kopia zapasowa.
echo   Twoj klucz API zostanie przeniesiony razem z projektem.
echo.
set "ZGODA="
set /p "ZGODA=  Kontynuowac? [T/N]: "
if /i not "%ZGODA%"=="T" goto ANULOWANO

echo.
echo   Kopiuje pliki...
echo.

if not exist "C:\Projekty" mkdir "C:\Projekty"

REM  node_modules i .next pomijamy celowo - to pliki generowane,
REM  ktore npm odtworzy na miejscu w kilkanascie sekund.
robocopy "%CD%" "%CEL%" /E /XD "node_modules" ".next" /XF "*.tmp" /NFL /NDL /NJH /NJS /NP
if errorlevel 8 goto BLAD_KOPIOWANIA

if not exist "%CEL%\package.json" goto BLAD_KOPIOWANIA

echo.
echo   ----------------------------------------
echo     GOTOWE
echo   ----------------------------------------
echo.
echo   Projekt jest teraz w:
echo       %CEL%
echo.

if exist "%CEL%\.env.local" echo   Klucz API zostal przeniesiony.
if not exist "%CEL%\.env.local" echo   UWAGA: nie znalazlem pliku .env.local - klucz podasz przy starcie.

echo.
echo   OD TERAZ PRACUJ NA NOWYM FOLDERZE.
echo   Ten w OneDrive zostaw jako kopie zapasowa - nie uruchamiaj go.
echo.
echo   Zaraz otworze nowy folder. Uruchom w nim URUCHOM.bat
echo.
pause
explorer "%CEL%"
exit /b 0

REM ==========================================================================
:BLAD_KOPIOWANIA
echo.
echo   ----------------------------------------
echo     KOPIOWANIE SIE NIE POWIODLO
echo   ----------------------------------------
echo.
echo   Sprobuj recznie:
echo     1. Otworz folder C:\ i utworz w nim folder Projekty
echo     2. Skopiuj tam caly folder praca-na-miare
echo     3. W skopiowanym folderze usun node_modules, jesli istnieje
echo     4. Uruchom URUCHOM.bat z nowej lokalizacji
echo.
pause
exit /b 1

REM ==========================================================================
:ANULOWANO
echo.
echo   Anulowano. Nic nie zostalo zmienione.
echo.
pause
exit /b 0
