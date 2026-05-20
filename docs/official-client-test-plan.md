# Plan: de-risking test - officiële client vs. lokale sleutels

## Doel

Eén vraag beantwoorden vóór we iets in de app veranderen: **kan een token uit het
officiële-app-flow (`client_id=11F75C04-…`) de lokale PSK-sleutels lezen**
(`encryption-information`), of is het puur een cloud-token? Dat bepaalt of dit pad
überhaupt bruikbaar is voor de lokale aanpak.

Geen wijzigingen in de app zelf - alleen een standalone testscript in `tests/`, net als
de eerdere de-risking aanpak.

## Achtergrond

De officiële Home Connect Homey-app gebruikt een ander OAuth-flow dan hcpy:

- **Ander client_id:** `11F75C04-21C2-4DA9-A623-228B54E9A256` (niet hcpy's
  `9B75AC9E-…`).
- **Echte HTTPS redirect:** `https://api.home-connect.com/security/oauth/redirect_target`
  i.p.v. hcpy's `hcauth://auth/prod`.
- Die `redirect_target` stuurt door naar `callback.athom.com/oauth2/callback`. Die
  laatste hop is Homey's eigen OAuth2-relay - de `code` daar is geen OAuth-code maar
  een Athom-wrapper (gedecodeerd:
  `{"region":"EU","stage":"PRD","cref":"F3D0AD25","token":"dde8ddd9-…","clty":"public",…}`).
  Dat is een referentie naar Athom's cloud, niet iets dat wij kunnen namaken.

`callback.athom.com` is Athom's OAuth-relay, alleen bedraad voor officieel gepartnerde
apps. We kunnen onze app daar niet doorheen routen. **Maar** de officiële app is een
cloud-integratie - de open vraag is of zo'n token überhaupt de lokale sleutels mag lezen.

## Testscript: `tests/official-client-test.js`

Hergebruikt `lib/home-connect-oauth.ts` (PKCE-helpers) en `lib/home-connect-discovery.ts`
(`discoverAppliances`). De authorize- en token-URL's worden in het script inline
opgebouwd zodat we `client_id` en `redirect_uri` kunnen variëren zonder de lib aan te
raken.

### Fase 1 - Authorize met de officiële client

- Genereer PKCE-paar (`createPkce()`).
- Bouw authorize-URL met:
  - `client_id = 11F75C04-21C2-4DA9-A623-228B54E9A256`
  - `redirect_uri = https://api.home-connect.com/security/oauth/redirect_target`
  - `scope = openid email profile offline_access homeconnect.general`
  - `response_type=code`, `state=<random>`, `code_challenge` + `code_challenge_method=S256`
- Print de URL. Gebruiker opent 'm in echte browser en logt in (hCaptcha werkt - echte
  origin).
- **Belangrijk praktisch punt:** `redirect_target` stuurt meteen door naar
  `callback.athom.com`. De `code` moet dus uit de **netwerk-inspector** geplukt worden bij
  de `redirect_target`-request (vóór de doorverwijzing), niet uit de adresbalk. Die `code`
  wordt teruggeplakt in het script (stdin-prompt).

### Fase 2 - Code inwisselen

- `exchangeCode(code, verifier, clientId, redirectUri)` tegen
  `https://api.home-connect.com/security/oauth/token`.
- **Dit test meteen of `11F75C04` een public/PKCE-client is.** Lukt de exchange zonder
  `client_secret` → public client, we kunnen verder. Faalt 'ie met "invalid_client" o.i.d.
  → confidential client → dit pad is dood voor ons (we hebben het secret niet).

### Fase 3 - Token tegen het lokale-sleutel-endpoint

- Draai `discoverAppliances(accessToken)` - die hit `paired-appliances` → per appliance
  `encryption-information`.
- **De beslissende check:** komen er appliances terug mét `key`/`iv` (de PSK-sleutels)? Of
  geeft het endpoint `403` / `insufficient_scope`?

### Fase 4 - Bonusprobe (snel, geen volledige login)

- Bouw alleen een authorize-URL met hcpy's `client_id=9B75AC9E-…` +
  `redirect_uri=https://api.home-connect.com/security/oauth/redirect_target` en open 'm.
- Toont SingleKey de loginpagina → `9B75AC9E` accepteert die HTTPS-redirect ook (opent
  UX-ruimte). Foutmelding "invalid redirect_uri" → niet.

## Beslisboom na de test

| Fase 2 | Fase 3 | Conclusie / vervolg |
|--------|--------|---------------------|
| Faalt (confidential) | - | Officieel pad dood. Blijf bij hcpy `9B75AC9E` + manuele paste. |
| Werkt | Sleutels terug | **Jackpot** - `11F75C04`-token leest lokale sleutels. Vervolgstap: uitzoeken of we de redirect ergens kunnen laten landen dat we wél lezen (aparte stap, niet deze test). |
| Werkt | Geen sleutels (403) | `11F75C04` is cloud-only. Blijf bij hcpy `9B75AC9E` + manuele paste. |

Fase 4 staat hier los van - puur een ja/nee of hcpy's client een HTTPS-redirect slikt.

## Belangrijke kanttekening vooraf

Zelfs in het jackpot-scenario lost deze test het **auto-capture-probleem niet op**:
`callback.athom.com` blijft Athom's relay die we niet kunnen gebruiken. We zouden de
redirect alsnog ergens moeten laten landen dat de app kan uitlezen. Deze test bepaalt puur
of het token *technisch bruikbaar* is - de UX-verbetering is een vervolgvraag die we pas
oppakken als Fase 3 groen is.

## Scope

- **Wel:** nieuw bestand `tests/official-client-test.js`, evt. een optionele
  `redirectUri`-parameter toevoegen aan `exchangeCode`/`buildAuthorizeUrl` in de lib
  (kleine, backwards-compatibele toevoeging).
- **Niet:** geen wijzigingen aan `api.ts`, `settings/`, de drivers of het
  onboarding-flow tot de test groen is.
