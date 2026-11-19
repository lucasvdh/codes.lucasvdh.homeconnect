---
description: What changed in each version
---

# Changelog

## 1.6.0

New: hobs, with a tile per cooking zone showing its level, and Flows for cooking started or stopped, a zone changing and overheating. Hob support is new, please report how it works for you. Also new are Flow cards for all your appliances at once: something is wrong with an appliance, an appliance needs maintenance, and an appliance became unreachable (after 5 minutes) or is reachable again.

## 1.5.0

The app settings now fit on a phone, with a card per appliance that shows its status and, when it is unavailable, the reason. Pairing explains both methods and links to the new online guide. Appliances that aren't supported yet, such as hobs, say so. Extractor hoods get a mode picker: off, manual, automatic or run-on. Diagnostics reports log every action on a device and why it failed. Appliances that briefly drop the connection now reconnect without showing as unavailable. The most used Flow cards are shown first.

## 1.4.3

Appliances that stay unavailable now say why, for example not found on the network, no answer, or key not accepted. The app settings show the connection status per appliance. Appliances found via mDNS are connected directly, and their network name is kept when the address changes. Also updated the App Store description, readme and app image.

## 1.4.2

Fixed the app crashing with "not connected" when an appliance reconnected (for example after its address was found again on the network). The app now reconnects instead. The extractor hood and coffee machine now show a product photo in the App Store.

## 1.4.1

Fixed the app crashing with "not connected" when an appliance reconnected (for example after its address was found again on the network). The app now reconnects instead.

## 1.4.0

New: extractor hoods (fan level, intensive, automatic, run-on, lights, grease filter alerts) and coffee machines (make drinks, refill and descaling alerts). Both are new, please report how they work for you. Also includes everything from 1.3.0: appliances that stayed 'unreachable on the local network' now connect (mDNS/.local, IPv4 first, no more 403 on washers), remaining time as status indicator, a 'Start the selected program' card, a door check before starting, and a more forgiving login.

## 1.3.0

Fixed appliances showing as unreachable on the local network: hostnames now resolve over mDNS (.local) automatically, IPv4 is preferred over IPv6, and washers no longer reject the connection (403). New: remaining time can be used as the device status indicator, a 'Start the selected program' Flow card, and a clear error when starting with the door open. The login is more forgiving about what you paste and explains the network-inspector route. Also includes the dryer options and corrected program progress and energy/water forecast values.

## 1.2.0

More washer options (Rinse Plus, Less Ironing, Soak, Rinse Hold), program phase, energy/water forecast, and numeric spin speed/temperature for Flows. Fixed i-DOS controls and idle progress-tile flickering.

## 1.1.0

Added washing machine and tumble dryer support: program start/select/stop/pause/resume, options (wash temperature, spin speed, i-Dos, drying target) and full Flow cards.

## 1.0.0

Initial version

