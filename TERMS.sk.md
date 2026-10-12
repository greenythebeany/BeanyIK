# Podmienky používania a ochrana súkromia BeanyIK

_Posledná aktualizácia: 10. októbra 2026_

[English version](TERMS.md)

Tieto podmienky platia pre desktopovú aplikáciu BeanyIK („aplikácia“), ktorú vydáva
GreenyBeany („autor“) na <https://github.com/greenythebeany/BeanyIK>.
Inštaláciou alebo používaním aplikácie s nimi súhlasíš. Záväzná je anglická verzia,
tento preklad slúži na pohodlnejšie čítanie.

## 1. Licencia

BeanyIK je bezplatný open-source softvér pod [licenciou MIT](LICENSE). Môžeš ho
používať, kopírovať, upravovať a šíriť podľa podmienok tejto licencie. Súčasti
tretích strán majú vlastné licencie (pozri [CREDITS.md](CREDITS.md)).

## 2. Účel: vzdelávanie a návrh

BeanyIK je nástroj na učenie a prototypovanie kinematiky robotov: skladanie
kinematických reťazcov, výpočet priamej a inverznej kinematiky, Jakobiánov a
pracovných priestorov.

- Výsledky sú **numerické aproximácie**. Numerická IK môže skonvergovať k lokálnemu
  riešeniu, minúť niektoré riešenia alebo zlyhať blízko singularít. Analytické
  riešiče sú správne len do tej miery, do akej sú správne zadané rovnice.
- Aplikácia **nemodeluje** dynamiku, kolízie, krútiace momenty, vedenie káblov,
  bezpečnostné zóny ani správanie skutočného riadiaceho systému.
- **BeanyIK nepoužívaj ako jediný podklad na riadenie skutočného hardvéru.** Hodnoty
  kĺbov, limity aj trajektórie si pred spustením na fyzickom stroji vždy over
  nástrojmi výrobcu robota a s primeranými bezpečnostnými opatreniami.
- Ak aplikáciu používaš na školské zadania, dodržuj pravidlá svojej školy a
  podľa potreby ju uveď ako zdroj.

## 3. Tvoj obsah a vlastný kód

- Roboty, ktoré vytvoríš (súbory `.robot.json`, parametre, poznámky), patria tebe.
- Panel **Analytický IK riešič** spúšťa JavaScript, ktorý napíšeš **ty**, lokálne
  v aplikácii. Vkladaj iba kód, ktorému rozumieš a dôveruješ. Súbory robotov od
  iných ľudí môžu obsahovať kód riešiča, skontroluj ho skôr, než stlačíš
  *Analyticky* alebo *Otestovať*.

## 4. Súkromie

BeanyIK nemá účty, analytiku ani telemetriu.

- Tvoje roboty, otvorené karty, zoznam nedávnych súborov a nastavenia (téma, jazyk,
  posledný panel) sa ukladajú **iba v tvojom počítači**: v súboroch, ktoré uložíš,
  a v lokálnom úložisku aplikácie v tvojom používateľskom profile.
- Jediná sieťová požiadavka, ktorú aplikácia robí sama od seba, je **kontrola
  aktualizácií**. Pri spustení sa opýta verejného GitHub API
  (`api.github.com/repos/greenythebeany/BeanyIK/releases/latest`), či existuje
  novšia verzia. Kontrolu môžeš vypnúť v okne *O aplikácii*. Ak aktualizáciu
  potvrdíš, inštalátor sa stiahne z GitHub vydaní projektu. Tieto požiadavky
  posielajú GitHubu bežné HTTP údaje (IP adresu, identifikátor prehliadača), nič
  o tvojich robotoch. Pozri
  [vyhlásenie o ochrane súkromia GitHubu](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- Odkazy, na ktoré klikneš (GitHub, tento dokument), sa otvoria v bežnom prehliadači.

## 5. Bez záruky

APLIKÁCIA SA POSKYTUJE „TAK, AKO JE“, BEZ AKEJKOĽVEK ZÁRUKY, VÝSLOVNEJ ALEBO
PREDPOKLADANEJ, VRÁTANE ZÁRUKY PREDAJNOSTI, VHODNOSTI NA KONKRÉTNY ÚČEL A
NEPORUŠENIA PRÁV. V MAXIMÁLNOM ROZSAHU POVOLENOM ZÁKONOM AUTOR NEZODPOVEDÁ ZA ŽIADNE
NÁROKY, ŠKODY ANI INÚ ZODPOVEDNOSŤ VRÁTANE POŠKODENIA ZARIADENÍ, MAJETKU ALEBO
ZRANENIA OSÔB, KTORÉ VZNIKNÚ POUŽÍVANÍM APLIKÁCIE ALEBO VÝSLEDKOV Z NEJ.

## 6. Nepodpísané zostavenia

Zostavenia pre Windows nie sú digitálne podpísané. Windows SmartScreen môže pri prvom
spustení zobraziť varovanie („Systém Windows ochránil váš počítač“). Klikni na *Ďalšie
informácie* a potom na *Spustiť aj tak*. BeanyIK sťahuj iba z oficiálnej
stránky vydaní na GitHube uvedenej vyššie.

## 7. Zmeny

Tieto podmienky sa môžu s novými vydaniami meniť. Platná je verzia v repozitári.
Používaním novšej verzie súhlasíš s jej podmienkami.

## 8. Kontakt

Otázky, chyby alebo nápady: založ issue na
<https://github.com/greenythebeany/BeanyIK/issues>.
