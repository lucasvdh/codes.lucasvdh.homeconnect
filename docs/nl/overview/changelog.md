---
description: Wat er per versie veranderd is
---

# Wijzigingen

## 1.5.0

De app-instellingen passen nu op een telefoon, met per apparaat een kaart met de status en, als het niet beschikbaar is, de reden. Het koppelen legt beide manieren uit en verwijst naar de nieuwe online handleiding. Apparaten die nog niet ondersteund worden, zoals kookplaten, laten dat zien. Afzuigkappen krijgen een moduskeuze: uit, handmatig, automatisch of nalooptijd. Diagnoserapporten loggen elke actie op een apparaat en waarom die mislukte. Apparaten die de verbinding kort verbreken, verbinden nu opnieuw zonder op niet beschikbaar te springen. De meestgebruikte Flow-kaarten staan bovenaan.

## 1.4.3

Apparaten die niet beschikbaar blijven, vertellen nu waarom, bijvoorbeeld niet gevonden op het netwerk, geen antwoord of sleutel niet geaccepteerd. De app-instellingen tonen de verbindingsstatus per apparaat. Apparaten die via mDNS gevonden worden, worden direct verbonden, en hun netwerknaam blijft bewaard als het adres verandert. Ook de beschrijving, leesmij en app-afbeelding in de App Store zijn bijgewerkt.

## 1.4.2

De app crashte met "not connected" als een apparaat opnieuw verbond (bijvoorbeeld nadat het adres opnieuw op het netwerk werd gevonden). Dat is opgelost: de app verbindt nu gewoon opnieuw. De afzuigkap en het koffiezetapparaat hebben nu een productfoto in de App Store.

## 1.4.1

De app crashte met "not connected" als een apparaat opnieuw verbond (bijvoorbeeld nadat het adres opnieuw op het netwerk werd gevonden). Dat is opgelost: de app verbindt nu gewoon opnieuw.

## 1.4.0

Nieuw: afzuigkappen (ventilatorstand, intensief, automatisch, nalooptijd, verlichting, vetfiltermelding) en koffiemachines (drankjes zetten, meldingen voor bijvullen en ontkalken). Beide zijn nieuw, laat weten hoe ze werken. Bevat ook alles uit 1.3.0: apparaten die 'onbereikbaar op het lokale netwerk' bleven verbinden nu wel (mDNS/.local, IPv4 eerst, geen 403 meer bij wasmachines), resterende tijd als statusindicator, een kaart 'Start het geselecteerde programma', een deurcontrole voor het starten en een vergevingsgezinder inloggen.

## 1.3.0

Apparaten die 'onbereikbaar op het lokale netwerk' bleven zijn verholpen: hostnamen worden nu automatisch via mDNS (.local) gevonden, IPv4 heeft voorrang op IPv6 en wasmachines weigeren de verbinding niet meer (403). Nieuw: resterende tijd als statusindicator, een Flow-kaart 'Start het geselecteerde programma' en een duidelijke melding bij starten met open deur. Het inloggen accepteert meer varianten van de geplakte URL en legt de route via de netwerk-inspector uit. Bevat ook de extra drogeropties en gecorrigeerde waarden voor programmavoortgang en verwacht energie-/waterverbruik.

## 1.2.0

Meer wasmachine-opties (extra spoelen, minder strijken, weken, spoelstop), programmafase, verwacht energie-/waterverbruik en numeriek centrifugetoerental/temperatuur voor Flows. i-DOS-bediening en knipperende voortgangstegels in rust verholpen.

## 1.1.0

Ondersteuning toegevoegd voor wasmachines en wasdrogers: programma starten/selecteren/stoppen/pauzeren/hervatten, opties (wastemperatuur, centrifugetoerental, i-Dos, droogdoel) en volledige Flow-kaarten.

## 1.0.0

Initial version

