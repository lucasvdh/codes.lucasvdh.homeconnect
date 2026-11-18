---
description: What the app can do per appliance type
---

# Features

Each appliance only shows the options its model reports. If something is missing, your model most likely doesn't offer it.

## All appliances with programs

- Power, operation state, active program and program progress
- Remaining and elapsed time, with the remaining time as `h:mm` that you can pick as the device's status indicator
- Remote control, remote start and local control status
- Triggers when a program starts, finishes or is aborted, when the operation state or progress changes, and when an error occurs
- Actions to stop the program, acknowledge an event and switch to standby

Most types also have door state, child lock, delayed start, and the **Start the selected program** action: set everything up on the appliance and let a Flow decide when it starts, for example when energy is cheap.

## Oven

Cavity temperature, meat probe (plugged in, temperature, target), fast preheat, oven light, kitchen timer, pyrolysis level and display settings. Triggers for preheat finished, meat probe target reached, kitchen timer elapsed, insert or turn food, and cleaning reminders. Actions to start a program, set the target temperature, meat probe target, kitchen timer, oven light and fast preheat.

## Dishwasher

Program phase, energy and water forecast, half load, silence, extra dry, hygiene and other options, rinse aid level and machine care counter. Triggers for salt or rinse aid low, filter check, machine care, drain problems and AquaStop. Actions to start, select, pause, resume or delay a program and to set the child lock.

## Washing machine

Wash temperature and spin speed (also as plain numbers for Flow comparisons), program phase, energy and water forecast, i-Dos, prewash, rinse plus, less ironing, soak and rinse hold. Triggers for i-Dos low and AquaStop. Actions to start, select, pause, resume or delay a program and to set temperature, spin speed and i-Dos dosing.

## Tumble dryer

Drying target, wrinkle guard, gentle drying and process phase. Actions to start, select, pause, resume or delay a program and to set the drying target.

## Extractor hood

Mode (off, manual, automatic, run-on), fan level, intensive level, light, light brightness and ambient light. Triggers for fan level changed and grease filter nearly saturated or saturated. Actions to set the fan level and intensive level, start automatic mode or run-on, and control the lights.

{% hint style="info" %}
Hood support is new and built from the Home Connect documentation. Please report how it works for your model.
{% endhint %}

## Hob

The cooking zones can't be controlled remotely. A tile per cooking zone shows its level (including keep warm, boost and residual heat), plus the number of zones in use, child lock and on/off. Triggers for cooking started or stopped (first zone on, last zone off), a zone changed, overheating, a zone reaching its time limit and the frying sensor reaching its temperature. Conditions for the hob or a specific zone being in use, and actions to switch the hob off or set the child lock.

It also gets the operation state, local control, error and software update cards. Everyday hob notifications such as a zone timer or the minute minder running out don't count as errors.

A typical Flow: when cooking starts, start the extractor hood in automatic mode.

{% hint style="info" %}
Hob support is new and built from one tester's appliance data. Please report how it works for your model.
{% endhint %}

## Coffee machine

Strength, fill quantity, cup warmer and drink counter. Actions to make a drink with the machine's own settings or with your own strength, quantity and temperature. Triggers for an empty bean container or water tank, a full drip tray, the milk container and cleaning or descaling.

{% hint style="info" %}
Coffee machine support is new and built from the Home Connect documentation. Please report how it works for your model.
{% endhint %}

## Not supported yet

Fridges, freezers and other appliance types don't have a driver yet. They show as **Not supported yet** in the app settings.
