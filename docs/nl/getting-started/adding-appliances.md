---
description: Voeg je gekoppelde apparaten toe aan Homey
---

# Apparaten toevoegen

1. Ga in de Homey-app naar **Apparaten** > **+** > **Home Connect (Lokaal)**.
2. Kies het type apparaat, bijvoorbeeld **Vaatwasser**.
3. Selecteer de apparaten die je wilt toevoegen en bevestig.

Alleen apparaten van het gekozen type verschijnen. Is de lijst leeg, kijk dan in de app-instellingen: het apparaat moet daar in de lijst staan en het type moet ondersteund worden.

## Wat je ziet in de app-instellingen

De instellingen tonen per apparaat een kaart met de status:

| Status | Betekenis |
| --- | --- |
| Verbonden | Homey praat lokaal met het apparaat. |
| Verbinden… | Homey zet de verbinding op. |
| Niet beschikbaar | Homey kan het apparaat niet bereiken. De kaart vertelt waarom; zie [Veelgestelde vragen](../overview/faq.md). |
| Nog niet toegevoegd | Het apparaat is gekoppeld maar nog niet aan Homey toegevoegd. |
| Nog niet ondersteund | Er is nog geen driver voor dit type apparaat. |

Open **Technische details** op een kaart voor de reden, het laatste adres en of Homey het apparaat op het netwerk heeft gezien (mDNS). Een screenshot van die kaart helpt enorm als je om hulp vraagt.

## Tips

- Zet het apparaat aan als je het toevoegt. Sommige modellen zetten hun wifi uit in stand-by.
- Homey en het apparaat moeten op hetzelfde netwerk zitten. Zie [Veelgestelde vragen](../overview/faq.md) als ze op verschillende netwerken of VLAN's zitten.
- Voor veel acties, zoals een programma starten, moet **Op afstand starten** op het apparaat zelf zijn ingeschakeld.
