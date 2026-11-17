---
description: Haal eenmalig de lokale sleutels van je apparaten op
---

# Je Home Connect-account koppelen

Voor lokale aansturing heeft Homey de sleutel van elk apparaat nodig. Deze worden eenmalig opgehaald via je Home Connect-account (SingleKey ID). Daarna verloopt alle communicatie via je eigen netwerk.

{% hint style="warning" %}
Koppelen is niet mogelijk op een telefoon of tablet. Gebruik een computer en open de app-instellingen via [my.homey.app](https://my.homey.app) > Apps > Home Connect.
{% endhint %}

Er zijn twee manieren om te koppelen:

| Manier | Wat je nodig hebt | Wanneer |
| --- | --- | --- |
| Inloggen in de browser | Chrome of Edge op een computer | Aanbevolen |
| devices.json importeren | De tool homeconnect-profile-downloader | Als inloggen in de browser niet lukt |

## Inloggen in de browser

Na het inloggen stuurt Home Connect je browser door naar een adres dat begint met `hcauth://`. Browsers kunnen dat adres niet openen, dus de pagina lijkt te blijven hangen of toont een foutmelding. In dat adres staat de code die de app nodig heeft. Je kopieert het uit de ontwikkelaarstools van de browser.

1. Open op je computer [my.homey.app](https://my.homey.app) > Apps > Home Connect > Instellingen.
2. Open een **nieuw tabblad** in Chrome of Edge en open de ontwikkelaarstools:
   - Windows en Linux: **F12** of **Ctrl+Shift+I**
   - Mac: **fn+F12** of **⌥⌘I**
   - Chromebook: **Ctrl+Shift+I** (een Chromebook heeft geen F12-toets)
3. Ga naar het tabblad **Network** en vink **Preserve log** aan. Zonder dat wordt de lijst gewist zodra de pagina doorverwijst.
4. Druk in de app-instellingen op **Login-link maken**, kopieer de link en open deze in het tabblad met de ontwikkelaarstools.
5. Log in met je SingleKey ID. Blijft de pagina daarna hangen of zie je een foutmelding, dan is dat verwacht gedrag.
6. Typ `hcauth` in het filter van het tabblad Network. Klik op het rode of mislukte verzoek en kopieer de **Request URL**. Die begint met `hcauth://auth/prod?code=`.
7. Plak deze in de app-instellingen bij **Adres na het inloggen** en druk op **Koppelen**.

De app laat zien hoeveel apparaten er gevonden zijn. Ga verder met [Apparaten toevoegen](adding-appliances.md).

{% hint style="info" %}
De code in het adres is maar kort geldig. Mislukt het koppelen met een verlopen of niet-passende code, maak dan een nieuwe login-link en begin opnieuw.
{% endhint %}

### Welke browsers werken

| Browser | Status |
| --- | --- |
| Chrome, Edge (Windows, macOS, Linux) | Werkt, bevestigd door testers |
| Brave, Opera, Arc | Gebouwd op Chromium, werkt naar verwachting, niet getest |
| Chromebook | Werkt als de ontwikkelaarstools zijn toegestaan. Op een Chromebook van school of werk kan een beheerder ze hebben uitgezet. |
| Firefox | Toont het `hcauth://`-verzoek niet in het tabblad Network. Gebruik Chrome of Edge. |
| Safari | Niet getest. Gebruik Chrome of Edge. |
| Elke browser op een telefoon of tablet | Werkt niet: er zijn geen ontwikkelaarstools |

## devices.json importeren

De [homeconnect-profile-downloader](https://github.com/bruestel/homeconnect-profile-downloader/releases) is een kleine app voor Windows, macOS en Linux die inlogt bij Home Connect en de profielen van je apparaten opslaat.

1. Download en start de profile downloader.
2. Log in met je SingleKey ID.
3. Kies het **hcpy**-profiel en sla het bestand `devices.json` op.
4. Open in de app-instellingen het tabblad **devices.json**, kies het bestand (of plak de inhoud) en druk op **Importeer apparaten**.

{% hint style="danger" %}
`devices.json` bevat de sleutels van je apparaten. Deel het bestand niet, en plaats nooit de waarden van `key` of `iv` op het forum of in een issue.
{% endhint %}

## Later verversen

Een nieuw apparaat gekocht? Voeg het eerst in de officiële app toe aan je Home Connect-account en druk daarna in de app-instellingen op **Apparaten verversen**. De app haalt de lijst dan opnieuw op met de opgeslagen login. Heb je gekoppeld door `devices.json` te importeren, importeer dan een nieuw bestand.
