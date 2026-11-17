---
description: Veelgestelde vragen en problemen oplossen
---

# Veelgestelde vragen en problemen oplossen

## Kan ik koppelen op mijn telefoon?

Nee. Voor het inloggen zijn de ontwikkelaarstools van een desktopbrowser nodig, en die hebben telefoons en tablets niet. Open de app-instellingen op een computer via [my.homey.app](https://my.homey.app) > Apps > Home Connect. Zie [Koppelen](../getting-started/pairing.md).

## De pagina blijft hangen na het inloggen. Is er iets misgegaan?

Nee, dat is verwacht gedrag. De browser kan het `hcauth://`-adres waar hij naartoe wordt gestuurd niet openen. De code die je nodig hebt staat in de ontwikkelaarstools; volg de stappen in [Koppelen](../getting-started/pairing.md#inloggen-in-de-browser).

## Mijn apparaat is niet beschikbaar

Het apparaat in Homey en de kaart in de app-instellingen vertellen waarom:

| Melding | Wat je controleert |
| --- | --- |
| Homey kan het apparaat niet vinden op het netwerk | Staat het apparaat aan en zit het op hetzelfde netwerk als Homey? Sommige modellen zetten hun wifi uit in stand-by. |
| Het apparaat antwoordt niet | Hetzelfde netwerk als Homey, geen gast- of IoT-netwerk? |
| Het apparaat weigert de verbinding | Het adres is mogelijk veranderd; de app blijft ernaar zoeken. |
| Homey kan het netwerk van het apparaat niet bereiken | Het apparaat zit op een ander netwerk of VLAN. Zie hieronder. |
| Het apparaat accepteert de sleutel niet | Druk in de app-instellingen op **Apparaten verversen** om de actuele sleutels op te halen. |
| Het apparaat heeft de verbinding verbroken | Is het ook toegevoegd aan een andere Homey of controller? Verwijder het daar. |

## Mijn apparaten zitten op een apart netwerk of VLAN

Homey vindt apparaten via mDNS, en dat werkt meestal niet over netwerken heen. Homey moet het apparaat ook kunnen bereiken op poort 443 (bij sommige modellen poort 80). Zet de apparaten op hetzelfde netwerk als Homey, of sta dat verkeer tussen de netwerken toe in je router.

## Kan ik hetzelfde apparaat op twee Homeys gebruiken?

Niet betrouwbaar. Een apparaat accepteert mogelijk maar één lokale verbinding tegelijk, waardoor twee Homeys elkaar kunnen wegdrukken. Voeg het toe aan één Homey.

## Heb ik de officiële Home Connect-app nog nodig?

Om nieuwe apparaten aan je Home Connect-account toe te voegen wel. Voor dagelijks gebruik praat deze app lokaal met de apparaten en is de Home Connect-cloud niet nodig.

## Een programma starten lukt niet

Controleer of **Op afstand starten** op het apparaat is ingeschakeld. Bij sommige modellen moet je dat elke keer op het apparaat zelf aanzetten. De app start ook geen programma zolang de deur openstaat.

## Hoe meld ik een probleem?

1. Open Home Connect (Lokaal) in de Homey-app en kies **Diagnoserapport maken**. Doe dat direct nadat het probleem optreedt.
2. Plaats het rapport-ID, een screenshot van de kaart van het apparaat in de app-instellingen en wat je deed in het [forumtopic](https://community.homey.app/t/155077) of als [GitHub-issue](https://github.com/lucasvdh/codes.lucasvdh.homeconnect/issues).

Deel nooit je `devices.json` of de waarden van `key` en `iv` daarin.
