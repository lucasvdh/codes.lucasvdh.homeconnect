---
description: Wat de app per type apparaat kan
---

# Functies

Elk apparaat toont alleen de opties die het model zelf meldt. Ontbreekt er iets, dan biedt jouw model het waarschijnlijk niet.

## Alle apparaten met programma's

- Aan/uit, bedrijfsstatus, actief programma en voortgang
- Resterende en verstreken tijd, met de resterende tijd als `u:mm` die je als statusindicator van het apparaat kunt kiezen
- Status van bediening op afstand, op afstand starten en lokale bediening
- Triggers als een programma start, klaar is of wordt afgebroken, als de status of voortgang verandert en bij een fout
- Acties om het programma te stoppen, een melding te bevestigen en naar stand-by te gaan

De meeste types hebben ook deurstatus, kinderslot, uitgesteld starten en de actie **Start het geselecteerde programma**: stel alles in op het apparaat en laat een Flow bepalen wanneer het start, bijvoorbeeld als stroom goedkoop is.

## Oven

Ovenruimtetemperatuur, kerntemperatuurmeter (aangesloten, temperatuur, doel), snel voorverwarmen, ovenlamp, kookwekker, pyrolyseniveau en display-instellingen. Triggers voor voorverwarmen klaar, kerntemperatuur bereikt, kookwekker afgelopen, gerecht plaatsen of omdraaien en schoonmaakherinneringen. Acties om een programma te starten en de doeltemperatuur, kerntemperatuur, kookwekker, ovenlamp en snel voorverwarmen in te stellen.

## Vaatwasser

Programmafase, verwacht energie- en waterverbruik, halve belading, stil programma, extra droog, hygiëne en andere opties, glansmiddelniveau en de teller voor machineonderhoud. Triggers voor zout of glansmiddel bijna op, filter controleren, machineonderhoud, afvoerproblemen en AquaStop. Acties om een programma te starten, te selecteren, te pauzeren, te hervatten of uitgesteld te starten en om het kinderslot in te stellen.

## Wasmachine

Wastemperatuur en centrifugetoerental (ook als getal voor vergelijkingen in Flows), programmafase, verwacht energie- en waterverbruik, i-Dos, voorwas, extra spoelen, minder strijken, weken en spoelstop. Triggers voor i-Dos bijna leeg en AquaStop. Acties om een programma te starten, te selecteren, te pauzeren, te hervatten of uitgesteld te starten en om temperatuur, toerental en i-Dos-dosering in te stellen.

## Wasdroger

Droogdoel, kreukbescherming, voorzichtig drogen en procesfase. Acties om een programma te starten, te selecteren, te pauzeren, te hervatten of uitgesteld te starten en om het droogdoel in te stellen.

## Afzuigkap

Modus (uit, handmatig, automatisch, nalooptijd), ventilatorstand, intensiefstand, verlichting, helderheid en sfeerverlichting. Triggers voor een gewijzigde ventilatorstand en een vetfilter dat bijna of helemaal verzadigd is. Acties om de ventilator- en intensiefstand in te stellen, automatisch of nalooptijd te starten en de verlichting te bedienen.

{% hint style="info" %}
Ondersteuning voor afzuigkappen is nieuw en gebouwd op basis van de Home Connect-documentatie. Laat weten hoe het werkt met jouw model.
{% endhint %}

## Kookplaat

De kookzones zijn niet op afstand te bedienen. Per kookzone een tegel met de stand (ook warmhouden, boost en restwarmte), plus het aantal zones in gebruik, kinderslot en aan/uit. Triggers voor koken begonnen of gestopt (eerste zone aan, laatste zone uit), een zone gewijzigd, oververhitting, een zone die de tijdslimiet bereikt en de braadsensor die op temperatuur is. Condities voor de kookplaat of een bepaalde zone in gebruik, en acties om de kookplaat uit te zetten of het kinderslot in te stellen.

Daarnaast zijn er de kaarten voor bedrijfsstatus, lokale bediening, fouten en software-updates. Gewone meldingen van de kookplaat, zoals een zonetimer of de kookwekker die afloopt, tellen niet als fout.

Een voorbeeld-Flow: als het koken begint, zet de afzuigkap op automatisch.

{% hint style="info" %}
Ondersteuning voor kookplaten is nieuw en gebouwd op de gegevens van één tester. Laat weten hoe het werkt met jouw model.
{% endhint %}

## Koffiemachine

Sterkte, hoeveelheid, kopjeswarmer en drankenteller. Acties om een drankje te maken met de instellingen van de machine of met je eigen sterkte, hoeveelheid en temperatuur. Triggers voor een leeg bonenreservoir of waterreservoir, een volle lekbak, het melkreservoir en schoonmaken of ontkalken.

{% hint style="info" %}
Ondersteuning voor koffiemachines is nieuw en gebouwd op basis van de Home Connect-documentatie. Laat weten hoe het werkt met jouw model.
{% endhint %}

## Nog niet ondersteund

Koelkasten, vriezers en andere types hebben nog geen driver. In de app-instellingen staan ze als **Nog niet ondersteund**.
