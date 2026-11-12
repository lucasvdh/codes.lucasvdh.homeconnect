#!/usr/bin/env node
// Generator for the appliance driver compose files. Run from the repo root:
//   node tools/generate-drivers.mjs [driver]
// Overwrites driver.compose.json capabilities and driver.flow.compose.json.
// Safe to re-run: on a clean checkout it must reproduce the committed files.

import { readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Capability lists per driver (declared in driver.compose.json). The runtime
// removes those whose backing feature isn't present on the specific paired
// appliance (see ApplianceDevice.syncCapabilities).
// ---------------------------------------------------------------------------

const SHARED_CAPS = [
  "onoff",
  "homeconnect_operation_state",
  "homeconnect_door_state",
  "homeconnect_program",
  "homeconnect_selected_program",
  "homeconnect_program_progress",
  "homeconnect_remaining_time",
  "homeconnect_remaining_time_display",
  "homeconnect_elapsed_time",
  "homeconnect_start_in_relative",
  "homeconnect_remote_start",
  "homeconnect_remote_control_active",
  "homeconnect_local_control_active",
  "homeconnect_program_count_started",
  "homeconnect_child_lock",
];

const OVEN_CAPS = [
  ...SHARED_CAPS,
  "measure_temperature",
  "homeconnect_program_duration",
  "homeconnect_meat_probe_plugged",
  "homeconnect_meat_probe_temp",
  "homeconnect_meat_probe_target",
  "homeconnect_cavity_light",
  "homeconnect_fast_preheat",
  "homeconnect_alarm_clock",
  "homeconnect_pyrolysis_level",
  "homeconnect_count_up_timer",
  "homeconnect_display_brightness",
  "homeconnect_button_tones",
  "homeconnect_signal_duration",
];

const DISHWASHER_CAPS = [
  ...SHARED_CAPS,
  "homeconnect_program_phase",
  "homeconnect_energy_forecast",
  "homeconnect_water_forecast",
  "homeconnect_eco_dry_active",
  "homeconnect_machine_care_runs_left",
  "homeconnect_silence_remaining",
  "homeconnect_half_load",
  "homeconnect_silence_on_demand",
  "homeconnect_intensiv_zone",
  "homeconnect_vario_speed_plus",
  "homeconnect_hygiene_plus",
  "homeconnect_brilliance_dry",
  "homeconnect_extra_dry",
  "homeconnect_eco_as_default",
  "homeconnect_drying_assistant",
  "homeconnect_gap_illumination",
  "homeconnect_rinse_aid_level",
  "homeconnect_water_hardness",
  "homeconnect_hot_water_connection",
  "homeconnect_sensitivity_turbidity",
  "homeconnect_sound_level_signal",
  "homeconnect_silence_default_time",
];

// Own order: program_phase sits next to the program on the device tile.
const WASHER_CAPS = [
  "onoff",
  "homeconnect_operation_state",
  "homeconnect_door_state",
  "homeconnect_program",
  "homeconnect_selected_program",
  "homeconnect_program_phase",
  "homeconnect_program_progress",
  "homeconnect_remaining_time",
  "homeconnect_remaining_time_display",
  "homeconnect_elapsed_time",
  "homeconnect_start_in_relative",
  "homeconnect_remote_start",
  "homeconnect_remote_control_active",
  "homeconnect_local_control_active",
  "homeconnect_program_count_started",
  "homeconnect_child_lock",
  "homeconnect_wash_temperature",
  "homeconnect_wash_temperature_celsius",
  "homeconnect_spin_speed",
  "homeconnect_spin_speed_rpm",
  "homeconnect_vario_perfect",
  "homeconnect_speed_perfect",
  "homeconnect_eco_perfect",
  "homeconnect_water_plus",
  "homeconnect_prewash",
  "homeconnect_rinse_plus",
  "homeconnect_less_ironing",
  "homeconnect_soak",
  "homeconnect_multiple_soak",
  "homeconnect_rinse_hold",
  "homeconnect_idos1_active",
  "homeconnect_idos2_active",
  "homeconnect_energy_forecast",
  "homeconnect_water_forecast",
];

const DRYER_CAPS = [
  ...SHARED_CAPS,
  "homeconnect_drying_target",
  "homeconnect_dryer_wrinkle_guard",
  "homeconnect_dryer_gentle",
  "homeconnect_dryer_drying_target_adjustment",
  "homeconnect_dryer_process_phase",
];

// ---------------------------------------------------------------------------
// Flow cards. We render each driver's `driver.flow.compose.json` from a
// shared template + per-driver event lists.
// ---------------------------------------------------------------------------

function tokenString(name, en, nl, example) {
  return {
    name,
    type: "string",
    title: { en, nl },
    example: { en: example, nl: example },
  };
}

function tokenNumber(name, en, nl, example) {
  return { name, type: "number", title: { en, nl }, example };
}

function tokenBool(name, en, nl) {
  return {
    name,
    type: "boolean",
    title: { en, nl },
    example: { en: "true", nl: "true" },
  };
}

function sharedTriggers(prefix) {
  return [
    {
      id: `${prefix}_program_finished`,
      title: { en: "A program finished", nl: "Een programma is klaar" },
      hint: {
        en: `Triggers when the ${prefix}'s operation state becomes Finished.`,
        nl: "Wordt geactiveerd wanneer de bedrijfstoestand Klaar wordt.",
      },
    },
    {
      id: `${prefix}_program_started`,
      title: { en: "A program started", nl: "Een programma is gestart" },
    },
    {
      id: `${prefix}_program_aborted`,
      title: { en: "A program was aborted", nl: "Een programma is afgebroken" },
    },
    {
      id: `${prefix}_door_changed`,
      title: { en: "The door state changed", nl: "De deurstatus is veranderd" },
      tokens: [tokenString("door_state", "Door state", "Deurstatus", "Open")],
    },
    {
      id: `${prefix}_door_opened`,
      title: { en: "The door was opened", nl: "De deur is geopend" },
    },
    {
      id: `${prefix}_door_closed`,
      title: { en: "The door was closed", nl: "De deur is gesloten" },
    },
    {
      id: `${prefix}_operation_state_changed`,
      title: { en: "The operation state changed", nl: "De bedrijfstoestand is veranderd" },
      tokens: [tokenString("operation_state", "Operation state", "Bedrijfstoestand", "Run")],
    },
    {
      id: `${prefix}_program_progress_changed`,
      title: { en: "The program progress changed", nl: "De programmavoortgang is veranderd" },
      tokens: [tokenNumber("progress", "Progress (%)", "Voortgang (%)", 50)],
    },
    {
      id: `${prefix}_remaining_time_changed`,
      title: { en: "Remaining time changed", nl: "Resterende tijd is veranderd" },
      tokens: [tokenNumber("minutes", "Minutes", "Minuten", 25)],
    },
    {
      id: `${prefix}_elapsed_time_changed`,
      title: { en: "Elapsed time changed", nl: "Verstreken tijd is veranderd" },
      tokens: [tokenNumber("minutes", "Minutes", "Minuten", 5)],
    },
    {
      id: `${prefix}_remote_start_allowed_changed`,
      title: {
        en: "Remote start allowed changed",
        nl: "Op afstand starten toegestaan is veranderd",
      },
      tokens: [tokenBool("allowed", "Allowed", "Toegestaan")],
    },
    {
      id: `${prefix}_remote_control_active_changed`,
      title: {
        en: "Remote control active changed",
        nl: "Bediening op afstand actief is veranderd",
      },
      tokens: [tokenBool("active", "Active", "Actief")],
    },
    {
      id: `${prefix}_local_control_changed`,
      title: { en: "Local control changed", nl: "Lokale bediening is veranderd" },
      tokens: [tokenBool("active", "Active", "Actief")],
    },
    {
      id: `${prefix}_child_lock_changed`,
      title: { en: "Child lock changed", nl: "Kinderslot is veranderd" },
      tokens: [tokenBool("enabled", "Enabled", "Ingeschakeld")],
    },
    {
      id: `${prefix}_error_occurred`,
      title: { en: "An error occurred", nl: "Er is een fout opgetreden" },
      tokens: [tokenString("error_code", "Error code", "Foutcode", "InternalError")],
    },
    {
      id: `${prefix}_aqua_stop_occurred`,
      title: { en: "AquaStop occurred", nl: "AquaStop is geactiveerd" },
    },
    {
      id: `${prefix}_low_water_pressure`,
      title: { en: "Low water pressure", nl: "Lage waterdruk" },
    },
    {
      id: `${prefix}_software_update_available`,
      title: { en: "A software update is available", nl: "Er is een software-update beschikbaar" },
    },
  ];
}

function sharedConditions(prefix) {
  return [
    {
      id: `${prefix}_is_running`,
      title: { en: "!{{Is|Is not}} running", nl: "!{{Is|Is niet}} bezig" },
    },
    {
      id: `${prefix}_is_finished`,
      title: { en: "!{{Is|Is not}} finished", nl: "!{{Is|Is niet}} klaar" },
    },
    {
      id: `${prefix}_is_paused`,
      title: { en: "!{{Is|Is not}} paused", nl: "!{{Is|Is niet}} gepauzeerd" },
    },
    {
      id: `${prefix}_is_inactive`,
      title: { en: "!{{Is|Is not}} idle", nl: "!{{Is|Is niet}} inactief" },
    },
    {
      id: `${prefix}_is_in_delayed_start`,
      title: {
        en: "Delayed start !{{is|is not}} active",
        nl: "Uitgestelde start !{{is|is niet}} actief",
      },
    },
    {
      id: `${prefix}_has_error`,
      title: { en: "There !{{is|is not}} an error", nl: "Er !{{is|is niet}} een fout" },
    },
    {
      id: `${prefix}_door_is_open`,
      title: { en: "The door !{{is|is not}} open", nl: "De deur !{{is|is niet}} open" },
    },
    {
      id: `${prefix}_remote_start_allowed`,
      title: {
        en: "Remote start !{{is|is not}} allowed",
        nl: "Op afstand starten !{{is|is niet}} toegestaan",
      },
    },
    {
      id: `${prefix}_remote_control_is_active`,
      title: {
        en: "Remote control !{{is|is not}} active",
        nl: "Bediening op afstand !{{is|is niet}} actief",
      },
    },
    {
      id: `${prefix}_local_control_is_active`,
      title: {
        en: "Local control !{{is|is not}} active",
        nl: "Lokale bediening !{{is|is niet}} actief",
      },
    },
    {
      id: `${prefix}_child_lock_is_on`,
      title: {
        en: "The child lock !{{is|is not}} on",
        nl: "Het kinderslot !{{is|is niet}} aan",
      },
    },
    {
      id: `${prefix}_remaining_time_below`,
      title: {
        en: "Remaining time !{{is|is not}} below ...",
        nl: "Resterende tijd !{{is|is niet}} minder dan ...",
      },
      titleFormatted: {
        en: "Remaining time !{{is|is not}} below [[minutes]] min",
        nl: "Resterende tijd !{{is|is niet}} minder dan [[minutes]] min",
      },
      args: [
        {
          name: "minutes",
          type: "number",
          title: { en: "Minutes", nl: "Minuten" },
          min: 0,
          max: 1440,
          step: 1,
        },
      ],
    },
    {
      id: `${prefix}_program_progress_above`,
      title: {
        en: "Program progress !{{is|is not}} above ...",
        nl: "Programmavoortgang !{{is|is niet}} hoger dan ...",
      },
      titleFormatted: {
        en: "Program progress !{{is|is not}} above [[percent]] %",
        nl: "Programmavoortgang !{{is|is niet}} hoger dan [[percent]] %",
      },
      args: [
        {
          name: "percent",
          type: "number",
          title: { en: "Percent", nl: "Percentage" },
          min: 0,
          max: 100,
          step: 1,
        },
      ],
    },
    {
      id: `${prefix}_current_program_is`,
      title: {
        en: "The active program !{{is|is not}} ...",
        nl: "Het actieve programma !{{is|is niet}} ...",
      },
      titleFormatted: {
        en: "The active program !{{is|is not}} [[program]]",
        nl: "Het actieve programma !{{is|is niet}} [[program]]",
      },
      args: [
        { name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } },
      ],
    },
    {
      id: `${prefix}_selected_program_is`,
      title: {
        en: "The selected program !{{is|is not}} ...",
        nl: "Het geselecteerde programma !{{is|is niet}} ...",
      },
      titleFormatted: {
        en: "The selected program !{{is|is not}} [[program]]",
        nl: "Het geselecteerde programma !{{is|is niet}} [[program]]",
      },
      args: [
        { name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } },
      ],
    },
  ];
}

// How each driver names its appliance inside a sentence ("on the <noun>").
const NOUNS = {
  oven: { en: "oven", nl: "oven", de: "am Backofen" },
  dishwasher: { en: "dishwasher", nl: "vaatwasser", de: "am Geschirrspüler" },
  washer: { en: "washing machine", nl: "wasmachine", de: "an der Waschmaschine" },
  dryer: { en: "dryer", nl: "droger", de: "am Trockner" },
  hood: { en: "hood", nl: "afzuigkap", de: "an der Dunstabzugshaube" },
  coffeemaker: { en: "coffee machine", nl: "koffiemachine", de: "am Kaffeevollautomaten" },
};

function sharedActions(prefix) {
  const noun = NOUNS[prefix];
  return [
    {
      id: `${prefix}_start_program`,
      title: { en: "Start a program", nl: "Start een programma" },
      titleFormatted: { en: "Start [[program]]", nl: "Start [[program]]" },
      hint: {
        en: `Requires remote start to be enabled on the ${noun.en} first.`,
        nl: `Vereist dat op afstand starten eerst op de ${noun.nl} is ingeschakeld.`,
      },
      args: [{ name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } }],
    },
    {
      id: `${prefix}_start_selected_program`,
      title: {
        en: "Start the selected program",
        nl: "Start het geselecteerde programma",
        de: "Ausgewähltes Programm starten",
      },
      hint: {
        en: `Starts the program that is currently selected on the ${noun.en}, with the options set there. Requires remote start to be enabled and the door to be closed.`,
        nl: `Start het programma dat nu op de ${noun.nl} is geselecteerd, met de daar ingestelde opties. Vereist dat op afstand starten is ingeschakeld en de deur dicht is.`,
        de: `Startet das ${noun.de} aktuell ausgewählte Programm mit den dort eingestellten Optionen. Erfordert aktivierten Fernstart und eine geschlossene Tür.`,
      },
    },
    {
      id: `${prefix}_select_program`,
      title: { en: "Select a program", nl: "Selecteer een programma" },
      titleFormatted: { en: "Select [[program]]", nl: "Selecteer [[program]]" },
      hint: {
        en: "Queues the program without starting it.",
        nl: "Selecteert het programma zonder het te starten.",
      },
      args: [{ name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } }],
    },
    {
      id: `${prefix}_start_program_delayed`,
      title: { en: "Start a program with a delay", nl: "Start een programma met uitstel" },
      titleFormatted: {
        en: "Start [[program]] in [[delay_minutes]] min",
        nl: "Start [[program]] over [[delay_minutes]] min",
      },
      args: [
        { name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } },
        {
          name: "delay_minutes",
          type: "number",
          title: { en: "Delay (min)", nl: "Uitstel (min)" },
          min: 1,
          max: 1440,
          step: 1,
        },
      ],
    },
    {
      id: `${prefix}_stop_program`,
      title: { en: "Stop the program", nl: "Stop het programma" },
    },
    {
      id: `${prefix}_pause_program`,
      title: { en: "Pause the program", nl: "Pauzeer het programma" },
    },
    {
      id: `${prefix}_resume_program`,
      title: { en: "Resume the program", nl: "Hervat het programma" },
    },
    {
      id: `${prefix}_set_child_lock`,
      title: { en: "Set child lock", nl: "Zet kinderslot" },
      titleFormatted: {
        en: "Set child lock to [[enabled]]",
        nl: "Zet kinderslot op [[enabled]]",
      },
      args: [
        { name: "enabled", type: "checkbox", title: { en: "Enabled", nl: "Ingeschakeld" } },
      ],
    },
    {
      id: `${prefix}_acknowledge_event`,
      title: { en: "Acknowledge event", nl: "Bevestig melding" },
      hint: {
        en: "Clears whatever event is currently signalled on the appliance.",
        nl: "Wist de melding die op het apparaat actief is.",
      },
    },
    {
      id: `${prefix}_power_off`,
      title: { en: "Turn off (standby)", nl: "Uitschakelen (stand-by)" },
    },
  ];
}

// ---- Oven-only -----------------------------------------------------------

const OVEN_EVENT_TRIGGERS = [
  {
    id: "oven_preheat_finished",
    title: { en: "Preheat finished", nl: "Voorverwarmen klaar" },
    tokens: [tokenString("mode", "Preheat mode", "Voorverwarmingsmodus", "regular")],
  },
  {
    id: "oven_alarm_clock_elapsed",
    title: { en: "Kitchen timer elapsed", nl: "Kookwekker afgelopen" },
  },
  {
    id: "oven_meat_probe_temp_reached",
    title: { en: "Meat probe target reached", nl: "Vleesthermometer-streefwaarde bereikt" },
  },
  {
    id: "oven_meat_probe_attention",
    title: { en: "Meat probe needs attention", nl: "Vleesthermometer vereist aandacht" },
    tokens: [tokenString("kind", "Reason", "Reden", "necessary")],
  },
  {
    id: "oven_insert_food",
    title: { en: "Insert food", nl: "Voeg etenswaren toe" },
    tokens: [tokenString("when", "When", "Wanneer", "now")],
  },
  {
    id: "oven_turn_food",
    title: { en: "Turn food", nl: "Draai etenswaren om" },
    tokens: [tokenString("when", "When", "Wanneer", "now")],
  },
  {
    id: "oven_door_attention",
    title: { en: "Door needs attention", nl: "Deur vereist aandacht" },
    tokens: [tokenString("kind", "Reason", "Reden", "open")],
  },
  {
    id: "oven_cavity_temp_too_high",
    title: { en: "Cavity temperature too high", nl: "Ovenruimte te warm" },
  },
  { id: "oven_easy_clean_required", title: { en: "EasyClean required", nl: "EasyClean vereist" } },
  {
    id: "oven_pyrolysis_remove_tank",
    title: { en: "Remove pyrolysis tank", nl: "Verwijder pyrolyse-bakje" },
  },
  {
    id: "oven_subsequent_cooking_request",
    title: { en: "Subsequent cooking suggested", nl: "Nakookmodus voorgesteld" },
  },
  {
    id: "oven_operating_time_limit_reached",
    title: { en: "Operating time limit reached", nl: "Maximale bedrijfsduur bereikt" },
  },
  {
    id: "oven_cooling_lock_active",
    title: { en: "Door locked while cooling", nl: "Deur vergrendeld tijdens afkoelen" },
  },
];

const OVEN_CONDITIONS = [
  {
    id: "oven_meat_probe_is_plugged",
    title: {
      en: "Meat probe !{{is|is not}} plugged in",
      nl: "Vleesthermometer !{{is|is niet}} aangesloten",
    },
  },
  {
    id: "oven_cavity_temperature_above",
    title: {
      en: "Cavity temperature !{{is|is not}} above ...",
      nl: "Ovenruimte !{{is|is niet}} warmer dan ...",
    },
    titleFormatted: {
      en: "Cavity temperature !{{is|is not}} above [[celsius]] °C",
      nl: "Ovenruimte !{{is|is niet}} warmer dan [[celsius]] °C",
    },
    args: [
      { name: "celsius", type: "number", title: { en: "°C", nl: "°C" }, min: 0, max: 300, step: 1 },
    ],
  },
  {
    id: "oven_meat_probe_temperature_above",
    title: {
      en: "Meat probe temperature !{{is|is not}} above ...",
      nl: "Vleesthermometer !{{is|is niet}} warmer dan ...",
    },
    titleFormatted: {
      en: "Meat probe !{{is|is not}} above [[celsius]] °C",
      nl: "Vleesthermometer !{{is|is niet}} warmer dan [[celsius]] °C",
    },
    args: [
      { name: "celsius", type: "number", title: { en: "°C", nl: "°C" }, min: 0, max: 110, step: 1 },
    ],
  },
  {
    id: "oven_target_temperature_above",
    deprecated: true,
    title: {
      en: "Target temperature !{{is|is not}} above ...",
      nl: "Insteltemperatuur !{{is|is niet}} hoger dan ...",
    },
    titleFormatted: {
      en: "Target !{{is|is not}} above [[celsius]] °C",
      nl: "Instel !{{is|is niet}} hoger dan [[celsius]] °C",
    },
    args: [
      { name: "celsius", type: "number", title: { en: "°C", nl: "°C" }, min: 30, max: 300, step: 5 },
    ],
  },
  {
    id: "oven_fast_preheat_is_on",
    title: {
      en: "Fast preheat !{{is|is not}} on",
      nl: "Snelvoorverwarmen !{{is|is niet}} aan",
    },
  },
  {
    id: "oven_cavity_light_is_on",
    title: { en: "Oven light !{{is|is not}} on", nl: "Ovenverlichting !{{is|is niet}} aan" },
  },
];

const OVEN_ACTIONS = [
  {
    id: "oven_set_target_temperature",
    title: { en: "Set target temperature", nl: "Stel insteltemperatuur in" },
    titleFormatted: { en: "Set target to [[celsius]] °C", nl: "Stel instel in op [[celsius]] °C" },
    args: [
      { name: "celsius", type: "number", title: { en: "°C", nl: "°C" }, min: 30, max: 300, step: 5 },
    ],
  },
  {
    id: "oven_set_meat_probe_target",
    title: { en: "Set meat probe target", nl: "Stel vleesthermometer-streefwaarde in" },
    titleFormatted: {
      en: "Meat probe target [[celsius]] °C",
      nl: "Vleesthermometer streef [[celsius]] °C",
    },
    args: [
      { name: "celsius", type: "number", title: { en: "°C", nl: "°C" }, min: 0, max: 99, step: 1 },
    ],
  },
  {
    id: "oven_set_alarm_clock",
    title: { en: "Set kitchen timer", nl: "Stel kookwekker in" },
    titleFormatted: { en: "Kitchen timer [[minutes]] min", nl: "Kookwekker [[minutes]] min" },
    args: [
      {
        name: "minutes",
        type: "number",
        title: { en: "Minutes", nl: "Minuten" },
        min: 0,
        max: 1440,
        step: 1,
      },
    ],
  },
  {
    id: "oven_set_cavity_light",
    title: { en: "Set oven light", nl: "Zet ovenverlichting" },
    titleFormatted: { en: "Light [[enabled]]", nl: "Verlichting [[enabled]]" },
    args: [{ name: "enabled", type: "checkbox", title: { en: "Enabled", nl: "Aan", de: "Ein" } }],
  },
  {
    id: "oven_set_fast_preheat",
    title: { en: "Set fast preheat", nl: "Zet snelvoorverwarmen" },
    titleFormatted: { en: "Fast preheat [[enabled]]", nl: "Snelvoorverwarmen [[enabled]]" },
    args: [{ name: "enabled", type: "checkbox", title: { en: "Enabled", nl: "Aan", de: "Ein" } }],
  },
];

function ovenStartProgramOverride() {
  return {
    id: "oven_start_program",
    title: { en: "Start a program", nl: "Start een programma" },
    titleFormatted: {
      en: "Start [[program]] at [[temperature]] °C for [[duration]] min",
      nl: "Start [[program]] op [[temperature]] °C voor [[duration]] min",
    },
    hint: {
      en: "Requires remote start to be enabled on the oven first.",
      nl: "Vereist dat op afstand starten eerst op de oven is ingeschakeld.",
    },
    args: [
      { name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } },
      {
        name: "temperature",
        type: "number",
        title: { en: "Temperature (°C)", nl: "Temperatuur (°C)" },
        min: 30,
        max: 300,
        step: 5,
      },
      {
        name: "duration",
        type: "number",
        title: { en: "Duration (minutes)", nl: "Duur (minuten)" },
        min: 1,
        max: 1440,
        step: 1,
      },
    ],
  };
}

// ---- Dishwasher-only -----------------------------------------------------

const DISHWASHER_EVENT_TRIGGERS = [
  {
    id: "dishwasher_program_phase_changed",
    title: { en: "The program phase changed", nl: "De programmafase is veranderd" },
    tokens: [tokenString("phase", "Phase", "Fase", "MainWash")],
  },
  {
    id: "dishwasher_salt_low",
    title: { en: "Salt is low", nl: "Zout bijna op" },
    tokens: [tokenString("severity", "Severity", "Ernst", "empty")],
  },
  {
    id: "dishwasher_rinse_aid_low",
    title: { en: "Rinse aid is low", nl: "Glansspoelmiddel bijna op" },
    tokens: [tokenString("severity", "Severity", "Ernst", "empty")],
  },
  {
    id: "dishwasher_filter_check_required",
    title: { en: "Filter check required", nl: "Filtercontrole vereist" },
  },
  {
    id: "dishwasher_machine_care_reminder",
    title: { en: "Machine care reminder", nl: "Machineverzorging-herinnering" },
  },
  {
    id: "dishwasher_draining_issue",
    title: { en: "Draining problem", nl: "Afvoerprobleem" },
    tokens: [tokenString("kind", "Kind", "Soort", "pump_blocked")],
  },
  { id: "dishwasher_low_voltage", title: { en: "Low voltage", nl: "Lage netspanning" } },
  {
    id: "dishwasher_water_heater_calcified",
    title: { en: "Water heater scaled up", nl: "Waterverwarmer verkalkt" },
  },
  { id: "dishwasher_internal_error", title: { en: "Internal error", nl: "Interne fout" } },
];

const DISHWASHER_CONDITIONS = [
  {
    id: "dishwasher_program_phase_is",
    title: {
      en: "Program phase !{{is|is not}} ...",
      nl: "Programmafase !{{is|is niet}} ...",
    },
    titleFormatted: {
      en: "Program phase !{{is|is not}} [[phase]]",
      nl: "Programmafase !{{is|is niet}} [[phase]]",
    },
    args: [{ name: "phase", type: "autocomplete", title: { en: "Phase", nl: "Fase" } }],
  },
  {
    id: "dishwasher_eco_dry_is_active",
    title: { en: "Eco-dry !{{is|is not}} active", nl: "Eco-drogen !{{is|is niet}} actief" },
  },
  {
    id: "dishwasher_half_load_is_on",
    title: { en: "Half load !{{is|is not}} on", nl: "Halve belading !{{is|is niet}} aan" },
  },
  {
    id: "dishwasher_silence_on_demand_is_active",
    title: { en: "Silence !{{is|is not}} active", nl: "Stiltemodus !{{is|is niet}} actief" },
  },
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const DE_DICT = {
  "1": "1",
  "2": "2",
  "A program finished": "Ein Programm ist fertig",
  "Triggers when the oven's operation state becomes Finished.": "Wird ausgelöst, wenn der Betriebszustand des Backofens Fertig wird.",
  "A program started": "Ein Programm wurde gestartet",
  "A program was aborted": "Ein Programm wurde abgebrochen",
  "The door state changed": "Der Türstatus wurde geändert",
  "Door state": "Türstatus",
  "Open": "Offen",
  "The door was opened": "Die Tür wurde geöffnet",
  "The door was closed": "Die Tür wurde geschlossen",
  "The operation state changed": "Der Betriebszustand wurde geändert",
  "Operation state": "Betriebszustand",
  "Run": "Run",
  "The program progress changed": "Der Programmfortschritt wurde geändert",
  "Progress (%)": "Fortschritt (%)",
  "Remaining time changed": "Restzeit wurde geändert",
  "Minutes": "Minuten",
  "Elapsed time changed": "Verstrichene Zeit wurde geändert",
  "Remote start allowed changed": "Fernstart erlaubt wurde geändert",
  "Allowed": "Erlaubt",
  "true": "true",
  "Remote control active changed": "Fernsteuerung aktiv wurde geändert",
  "Active": "Aktiv",
  "Local control changed": "Lokale Bedienung wurde geändert",
  "Child lock changed": "Kindersicherung wurde geändert",
  "Enabled": "Aktiviert",
  "An error occurred": "Ein Fehler ist aufgetreten",
  "Error code": "Fehlercode",
  "InternalError": "InternalError",
  "AquaStop occurred": "AquaStop wurde ausgelöst",
  "Low water pressure": "Niedriger Wasserdruck",
  "A software update is available": "Ein Software-Update ist verfügbar",
  "Preheat finished": "Vorheizen abgeschlossen",
  "Preheat mode": "Vorheizmodus",
  "regular": "regular",
  "Kitchen timer elapsed": "Kurzzeitwecker abgelaufen",
  "Meat probe target reached": "Zieltemperatur des Bratenthermometers erreicht",
  "Meat probe needs attention": "Bratenthermometer erfordert Aufmerksamkeit",
  "Reason": "Grund",
  "necessary": "necessary",
  "Insert food": "Lebensmittel einlegen",
  "When": "Wann",
  "now": "now",
  "Turn food": "Lebensmittel wenden",
  "Door needs attention": "Tür erfordert Aufmerksamkeit",
  "open": "open",
  "Cavity temperature too high": "Garraumtemperatur zu hoch",
  "EasyClean required": "EasyClean erforderlich",
  "Remove pyrolysis tank": "Pyrolysebehälter entfernen",
  "Subsequent cooking suggested": "Nachgaren vorgeschlagen",
  "Operating time limit reached": "Maximale Betriebsdauer erreicht",
  "Door locked while cooling": "Tür während des Abkühlens verriegelt",
  "!{{Is|Is not}} running": "!{{Läuft|Läuft nicht}}",
  "!{{Is|Is not}} finished": "!{{Ist|Ist nicht}} fertig",
  "!{{Is|Is not}} paused": "!{{Ist|Ist nicht}} pausiert",
  "!{{Is|Is not}} idle": "!{{Ist|Ist nicht}} inaktiv",
  "Delayed start !{{is|is not}} active": "Startzeitvorwahl !{{ist|ist nicht}} aktiv",
  "There !{{is|is not}} an error": "Es !{{liegt|liegt kein}} Fehler vor",
  "The door !{{is|is not}} open": "Die Tür !{{ist|ist nicht}} offen",
  "Remote start !{{is|is not}} allowed": "Fernstart !{{ist|ist nicht}} erlaubt",
  "Remote control !{{is|is not}} active": "Fernsteuerung !{{ist|ist nicht}} aktiv",
  "Local control !{{is|is not}} active": "Lokale Bedienung !{{ist|ist nicht}} aktiv",
  "The child lock !{{is|is not}} on": "Die Kindersicherung !{{ist|ist nicht}} eingeschaltet",
  "Remaining time !{{is|is not}} below ...": "Restzeit !{{ist|ist nicht}} unter ...",
  "Remaining time !{{is|is not}} below [[minutes]] min": "Restzeit !{{ist|ist nicht}} unter [[minutes]] Min.",
  "Program progress !{{is|is not}} above ...": "Programmfortschritt !{{ist|ist nicht}} über ...",
  "Program progress !{{is|is not}} above [[percent]] %": "Programmfortschritt !{{ist|ist nicht}} über [[percent]] %",
  "Percent": "Prozent",
  "The active program !{{is|is not}} ...": "Das aktive Programm !{{ist|ist nicht}} ...",
  "The active program !{{is|is not}} [[program]]": "Das aktive Programm !{{ist|ist nicht}} [[program]]",
  "Program": "Programm",
  "The selected program !{{is|is not}} ...": "Das ausgewählte Programm !{{ist|ist nicht}} ...",
  "The selected program !{{is|is not}} [[program]]": "Das ausgewählte Programm !{{ist|ist nicht}} [[program]]",
  "Meat probe !{{is|is not}} plugged in": "Bratenthermometer !{{ist|ist nicht}} eingesteckt",
  "Cavity temperature !{{is|is not}} above ...": "Garraumtemperatur !{{ist|ist nicht}} über ...",
  "Cavity temperature !{{is|is not}} above [[celsius]] °C": "Garraumtemperatur !{{ist|ist nicht}} über [[celsius]] °C",
  "°C": "°C",
  "Meat probe temperature !{{is|is not}} above ...": "Bratenthermometer-Temperatur !{{ist|ist nicht}} über ...",
  "Meat probe !{{is|is not}} above [[celsius]] °C": "Bratenthermometer !{{ist|ist nicht}} über [[celsius]] °C",
  "Target temperature !{{is|is not}} above ...": "Zieltemperatur !{{ist|ist nicht}} über ...",
  "Target !{{is|is not}} above [[celsius]] °C": "Zieltemperatur !{{ist|ist nicht}} über [[celsius]] °C",
  "Fast preheat !{{is|is not}} on": "Schnellaufheizen !{{ist|ist nicht}} eingeschaltet",
  "Oven light !{{is|is not}} on": "Backofenbeleuchtung !{{ist|ist nicht}} eingeschaltet",
  "Start a program": "Programm starten",
  "Start [[program]] at [[temperature]] °C for [[duration]] min": "[[program]] bei [[temperature]] °C für [[duration]] Min. starten",
  "Requires remote start to be enabled on the oven first.": "Erfordert, dass Fernstart zuerst am Backofen aktiviert ist.",
  "Temperature (°C)": "Temperatur (°C)",
  "Duration (minutes)": "Dauer (Minuten)",
  "Select a program": "Programm auswählen",
  "Select [[program]]": "[[program]] auswählen",
  "Queues the program without starting it.": "Wählt das Programm aus, ohne es zu starten.",
  "Start a program with a delay": "Programm mit Verzögerung starten",
  "Start [[program]] in [[delay_minutes]] min": "[[program]] in [[delay_minutes]] Min. starten",
  "Delay (min)": "Verzögerung (Min.)",
  "Stop the program": "Programm stoppen",
  "Pause the program": "Programm pausieren",
  "Resume the program": "Programm fortsetzen",
  "Set child lock": "Kindersicherung setzen",
  "Set child lock to [[enabled]]": "Kindersicherung auf [[enabled]] setzen",
  "Acknowledge event": "Meldung bestätigen",
  "Clears whatever event is currently signalled on the appliance.": "Löscht die aktuell am Gerät angezeigte Meldung.",
  "Turn off (standby)": "Ausschalten (Standby)",
  "Set target temperature": "Zieltemperatur einstellen",
  "Set target to [[celsius]] °C": "Ziel auf [[celsius]] °C einstellen",
  "Set meat probe target": "Ziel des Bratenthermometers einstellen",
  "Meat probe target [[celsius]] °C": "Bratenthermometer-Ziel [[celsius]] °C",
  "Set kitchen timer": "Kurzzeitwecker stellen",
  "Kitchen timer [[minutes]] min": "Kurzzeitwecker [[minutes]] Min.",
  "Set oven light": "Backofenbeleuchtung setzen",
  "Light [[enabled]]": "Beleuchtung [[enabled]]",
  "Set fast preheat": "Schnellaufheizen setzen",
  "Fast preheat [[enabled]]": "Schnellaufheizen [[enabled]]",
  "Triggers when the dishwasher's operation state becomes Finished.": "Wird ausgelöst, wenn der Betriebszustand des Geschirrspülers Fertig wird.",
  "The program phase changed": "Die Programmphase wurde geändert",
  "Phase": "Phase",
  "MainWash": "MainWash",
  "Salt is low": "Salz ist niedrig",
  "Severity": "Schweregrad",
  "empty": "empty",
  "Rinse aid is low": "Klarspüler ist niedrig",
  "Filter check required": "Filterprüfung erforderlich",
  "Machine care reminder": "Maschinenpflege-Erinnerung",
  "Draining problem": "Ablaufproblem",
  "Kind": "Art",
  "pump_blocked": "pump_blocked",
  "Low voltage": "Niedrige Netzspannung",
  "Water heater scaled up": "Wassererhitzer verkalkt",
  "Internal error": "Interner Fehler",
  "Program phase !{{is|is not}} ...": "Programmphase !{{ist|ist nicht}} ...",
  "Program phase !{{is|is not}} [[phase]]": "Programmphase !{{ist|ist nicht}} [[phase]]",
  "Eco-dry !{{is|is not}} active": "Eco-Trocknen !{{ist|ist nicht}} aktiv",
  "Half load !{{is|is not}} on": "Halbe Beladung !{{ist|ist nicht}} eingeschaltet",
  "Silence !{{is|is not}} active": "Stillemodus !{{ist|ist nicht}} aktiv",
  "Start [[program]]": "[[program]] starten",
  "Requires remote start to be enabled on the dishwasher first.": "Erfordert, dass Fernstart zuerst am Geschirrspüler aktiviert ist.",
  "Triggers when the washer's operation state becomes Finished.": "Wird ausgelöst, wenn der Betriebszustand der Waschmaschine Fertig wird.",
  "Triggers when the dryer's operation state becomes Finished.": "Wird ausgelöst, wenn der Betriebszustand des Wäschetrockners Fertig wird.",
  "Requires remote start to be enabled on the washing machine first.": "Erfordert, dass Fernstart zuerst an der Waschmaschine aktiviert ist.",
  "Requires remote start to be enabled on the dryer first.": "Erfordert, dass Fernstart zuerst am Wäschetrockner aktiviert ist.",
  "Triggers when the hood's operation state becomes Finished.": "Wird ausgelöst, wenn der Betriebszustand der Dunstabzugshaube Fertig wird.",
  "Requires remote start to be enabled on the hood first.": "Erfordert, dass Fernstart zuerst an der Dunstabzugshaube aktiviert ist.",
  "Triggers when the coffeemaker's operation state becomes Finished.": "Wird ausgelöst, wenn der Betriebszustand des Kaffeevollautomaten Fertig wird.",
  "i-Dos is low": "i-Dos fast leer",
  "Dispenser": "Behälter",
  "i-Dos !{{is|is not}} active": "i-Dos !{{ist|ist nicht}} aktiv",
  "i-Dos [[dispenser]] !{{is|is not}} active": "i-Dos [[dispenser]] !{{ist|ist nicht}} aktiv",
  "Set wash temperature": "Waschtemperatur einstellen",
  "Set wash temperature to [[value]]": "Waschtemperatur auf [[value]] einstellen",
  "Temperature": "Temperatur",
  "Set spin speed": "Schleuderdrehzahl einstellen",
  "Set spin speed to [[value]]": "Schleuderdrehzahl auf [[value]] einstellen",
  "Spin speed": "Schleuderdrehzahl",
  "Set i-Dos dosing": "i-Dos-Dosierung einstellen",
  "Set i-Dos [[dispenser]] to [[enabled]]": "i-Dos [[dispenser]] auf [[enabled]] einstellen",
  "Cold": "Kalt",
  "Off": "Aus",
  "20 °C": "20 °C",
  "30 °C": "30 °C",
  "40 °C": "40 °C",
  "50 °C": "50 °C",
  "60 °C": "60 °C",
  "70 °C": "70 °C",
  "80 °C": "80 °C",
  "90 °C": "90 °C",
  "400 rpm": "400 U/min",
  "600 rpm": "600 U/min",
  "800 rpm": "800 U/min",
  "1000 rpm": "1000 U/min",
  "1200 rpm": "1200 U/min",
  "1400 rpm": "1400 U/min",
  "1600 rpm": "1600 U/min",
  "Set drying target": "Trockenziel einstellen",
  "Set drying target to [[value]]": "Trockenziel auf [[value]] einstellen",
  "Drying target": "Trockenziel",
  "Iron dry": "Bügeltrocken",
  "Cupboard dry": "Schranktrocken",
  "Cupboard dry plus": "Schranktrocken plus",
  "Extra dry": "Extratrocken"
};

// Layer German onto a flow object by matching English strings, reusing the
// curated de from oven/dishwasher. Keeps generation trilingual without
// hand-maintaining de in every template literal.
function applyDe(node) {
  if (Array.isArray(node)) { node.forEach(applyDe); return; }
  if (node && typeof node === "object") {
    if (typeof node.en === "string" && node.de === undefined && DE_DICT[node.en] !== undefined) {
      node.de = DE_DICT[node.en];
    }
    for (const k of Object.keys(node)) applyDe(node[k]);
  }
}

function writeFlow(p, flow) {
  applyDe(flow);
  writeJson(p, flow);
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeJson(p, body) {
  writeFileSync(p, JSON.stringify(body, null, 2) + "\n");
}

// ---- Washer-only ---------------------------------------------------------

const WASHER_EVENT_TRIGGERS = [
  {
    id: "washer_idos_low",
    title: { en: "i-Dos is low", nl: "i-Dos bijna leeg" },
    tokens: [tokenString("dispenser", "Dispenser", "Reservoir", "1")],
  },
];

const DISPENSER_VALUES = [
  { id: "1", label: { en: "1", nl: "1" } },
  { id: "2", label: { en: "2", nl: "2" } },
];

const WASHER_CONDITIONS = [
  {
    id: "washer_idos_is_active",
    title: { en: "i-Dos !{{is|is not}} active", nl: "i-Dos !{{is|is niet}} actief" },
    titleFormatted: {
      en: "i-Dos [[dispenser]] !{{is|is not}} active",
      nl: "i-Dos [[dispenser]] !{{is|is niet}} actief",
    },
    args: [
      { name: "dispenser", type: "dropdown", title: { en: "Dispenser", nl: "Reservoir" }, values: DISPENSER_VALUES },
    ],
  },
];

const TEMP_VALUES = [
  { id: "Cold", label: { en: "Cold", nl: "Koud" } },
  { id: "GC20", label: { en: "20 °C", nl: "20 °C" } },
  { id: "GC30", label: { en: "30 °C", nl: "30 °C" } },
  { id: "GC40", label: { en: "40 °C", nl: "40 °C" } },
  { id: "GC50", label: { en: "50 °C", nl: "50 °C" } },
  { id: "GC60", label: { en: "60 °C", nl: "60 °C" } },
  { id: "GC70", label: { en: "70 °C", nl: "70 °C" } },
  { id: "GC80", label: { en: "80 °C", nl: "80 °C" } },
  { id: "GC90", label: { en: "90 °C", nl: "90 °C" } },
];

const SPIN_VALUES = [
  { id: "Off", label: { en: "Off", nl: "Uit" } },
  { id: "RPM400", label: { en: "400 rpm", nl: "400 tpm" } },
  { id: "RPM600", label: { en: "600 rpm", nl: "600 tpm" } },
  { id: "RPM800", label: { en: "800 rpm", nl: "800 tpm" } },
  { id: "RPM1000", label: { en: "1000 rpm", nl: "1000 tpm" } },
  { id: "RPM1200", label: { en: "1200 rpm", nl: "1200 tpm" } },
  { id: "RPM1400", label: { en: "1400 rpm", nl: "1400 tpm" } },
  { id: "RPM1600", label: { en: "1600 rpm", nl: "1600 tpm" } },
];

const WASHER_ACTIONS = [
  {
    id: "washer_set_temperature",
    title: { en: "Set wash temperature", nl: "Stel wastemperatuur in" },
    titleFormatted: {
      en: "Set wash temperature to [[value]]",
      nl: "Stel wastemperatuur in op [[value]]",
    },
    args: [{ name: "value", type: "dropdown", title: { en: "Temperature", nl: "Temperatuur" }, values: TEMP_VALUES }],
  },
  {
    id: "washer_set_spin_speed",
    title: { en: "Set spin speed", nl: "Stel centrifugetoerental in" },
    titleFormatted: {
      en: "Set spin speed to [[value]]",
      nl: "Stel centrifugetoerental in op [[value]]",
    },
    args: [{ name: "value", type: "dropdown", title: { en: "Spin speed", nl: "Toerental" }, values: SPIN_VALUES }],
  },
  {
    id: "washer_set_idos",
    title: { en: "Set i-Dos dosing", nl: "Stel i-Dos dosering in" },
    titleFormatted: {
      en: "Set i-Dos [[dispenser]] to [[enabled]]",
      nl: "Zet i-Dos [[dispenser]] op [[enabled]]",
    },
    args: [
      { name: "dispenser", type: "dropdown", title: { en: "Dispenser", nl: "Reservoir" }, values: DISPENSER_VALUES },
      { name: "enabled", type: "checkbox", title: { en: "Enabled", nl: "Ingeschakeld" } },
    ],
  },
];

const DRYING_TARGET_VALUES = [
  { id: "IronDry", label: { en: "Iron dry", nl: "Strijkdroog" } },
  { id: "CupboardDry", label: { en: "Cupboard dry", nl: "Kastdroog" } },
  { id: "CupboardDryPlus", label: { en: "Cupboard dry plus", nl: "Kastdroog plus" } },
  { id: "ExtraDry", label: { en: "Extra dry", nl: "Extra droog" } },
];

const DRYER_ACTIONS = [
  {
    id: "dryer_set_drying_target",
    title: { en: "Set drying target", nl: "Stel droogdoel in" },
    titleFormatted: {
      en: "Set drying target to [[value]]",
      nl: "Stel droogdoel in op [[value]]",
    },
    args: [{ name: "value", type: "dropdown", title: { en: "Drying target", nl: "Droogdoel" }, values: DRYING_TARGET_VALUES }],
  },
];

// ---------------------------------------------------------------------------
// Assembly. Optional CLI arg scopes generation to one driver, e.g.
//   node tools/generate-drivers.mjs washer
// With no arg, all drivers are (re)generated.
// ---------------------------------------------------------------------------

// ---- Hood ----------------------------------------------------------------

const HOOD_CAPS = [
  "onoff",
  "homeconnect_operation_state",
  "homeconnect_program",
  "homeconnect_venting_level",
  "homeconnect_intensive_level",
  "homeconnect_light",
  "homeconnect_light_brightness",
  "homeconnect_ambient_light",
  "homeconnect_ambient_light_brightness",
  "homeconnect_program_progress",
  "homeconnect_remaining_time",
  "homeconnect_remaining_time_display",
  "homeconnect_elapsed_time",
  "homeconnect_remote_control_active",
  "homeconnect_local_control_active",
];

// Shared cards that make sense for a hood (no door, child lock, delayed start).
const HOOD_SHARED = {
  triggers: [
    "program_started",
    "program_finished",
    "operation_state_changed",
    "remaining_time_changed",
    "remote_control_active_changed",
    "local_control_changed",
    "error_occurred",
    "software_update_available",
  ],
  conditions: [
    "is_running",
    "is_inactive",
    "has_error",
    "remote_control_is_active",
    "local_control_is_active",
    "current_program_is",
  ],
  actions: ["start_program", "stop_program", "acknowledge_event", "power_off"],
};

const pick = (cards, prefix, ids) =>
  cards.filter((c) => ids.includes(c.id.slice(prefix.length + 1)));

const VENTING_LEVEL_VALUES = [
  { id: "FanOff", title: { en: "Off", nl: "Uit", de: "Aus" } },
  ...[1, 2, 3, 4, 5].map((i) => ({
    id: `FanStage0${i}`,
    title: { en: `Level ${i}`, nl: `Stand ${i}`, de: `Stufe ${i}` },
  })),
];

const INTENSIVE_LEVEL_VALUES = [
  { id: "IntensiveStageOff", title: { en: "Off", nl: "Uit", de: "Aus" } },
  { id: "IntensiveStage1", title: { en: "Intensive 1", nl: "Intensief 1", de: "Intensiv 1" } },
  { id: "IntensiveStage2", title: { en: "Intensive 2", nl: "Intensief 2", de: "Intensiv 2" } },
];

const levelArg = (values) => ({
  name: "level",
  type: "dropdown",
  title: { en: "Level", nl: "Stand", de: "Stufe" },
  values,
});

const onOffArg = {
  name: "enabled",
  type: "checkbox",
  title: { en: "On", nl: "Aan", de: "Ein" },
};

const HOOD_TRIGGERS = [
  {
    id: "hood_venting_level_changed",
    title: { en: "Fan level changed", nl: "Ventilatorstand is gewijzigd", de: "Lüfterstufe hat sich geändert" },
    tokens: [
      {
        name: "level",
        type: "string",
        title: { en: "Level", nl: "Stand", de: "Stufe" },
        example: { en: "FanStage02", nl: "FanStage02", de: "FanStage02" },
      },
    ],
  },
  {
    id: "hood_grease_filter_nearly_saturated",
    title: {
      en: "Grease filter is nearly saturated",
      nl: "Vetfilter is bijna verzadigd",
      de: "Fettfilter ist fast gesättigt",
    },
  },
  {
    id: "hood_grease_filter_saturated",
    title: {
      en: "Grease filter is saturated",
      nl: "Vetfilter is verzadigd",
      de: "Fettfilter ist gesättigt",
    },
  },
];

const HOOD_CONDITIONS = [
  {
    id: "hood_venting_level_is",
    title: {
      en: "Fan level !{{is|is not}} ...",
      nl: "Ventilatorstand !{{is|is niet}} ...",
      de: "Lüfterstufe !{{ist|ist nicht}} ...",
    },
    titleFormatted: {
      en: "Fan level !{{is|is not}} [[level]]",
      nl: "Ventilatorstand !{{is|is niet}} [[level]]",
      de: "Lüfterstufe !{{ist|ist nicht}} [[level]]",
    },
    args: [levelArg(VENTING_LEVEL_VALUES)],
  },
  {
    id: "hood_light_is_on",
    title: {
      en: "Light !{{is|is not}} on",
      nl: "Verlichting !{{is|is niet}} aan",
      de: "Beleuchtung !{{ist|ist nicht}} an",
    },
  },
];

const HOOD_ACTIONS = [
  {
    id: "hood_set_venting_level",
    title: { en: "Set fan level", nl: "Zet ventilatorstand", de: "Lüfterstufe einstellen" },
    titleFormatted: {
      en: "Set fan level to [[level]]",
      nl: "Zet ventilatorstand op [[level]]",
      de: "Lüfterstufe auf [[level]] einstellen",
    },
    hint: {
      en: "Starts the fan at this level, changes the level while it runs, or stops it with Off.",
      nl: "Start de ventilator op deze stand, wijzigt de stand terwijl hij draait, of stopt hem met Uit.",
      de: "Startet den Lüfter auf dieser Stufe, ändert die Stufe im Betrieb oder stoppt ihn mit Aus.",
    },
    args: [levelArg(VENTING_LEVEL_VALUES)],
  },
  {
    id: "hood_set_intensive_level",
    title: { en: "Set intensive level", nl: "Zet intensiefstand", de: "Intensivstufe einstellen" },
    titleFormatted: {
      en: "Set intensive level to [[level]]",
      nl: "Zet intensiefstand op [[level]]",
      de: "Intensivstufe auf [[level]] einstellen",
    },
    args: [levelArg(INTENSIVE_LEVEL_VALUES)],
  },
  {
    id: "hood_start_automatic",
    title: { en: "Start automatic mode", nl: "Start automatische stand", de: "Automatikbetrieb starten" },
    hint: {
      en: "The hood picks the fan level itself based on its sensor.",
      nl: "De kap kiest zelf de ventilatorstand op basis van zijn sensor.",
      de: "Die Haube wählt die Lüfterstufe anhand ihres Sensors selbst.",
    },
  },
  {
    id: "hood_start_delayed_shutoff",
    title: { en: "Start run-on", nl: "Start nalooptijd", de: "Nachlauf starten" },
    hint: {
      en: "Keeps the fan running for the hood's run-on time and then switches it off.",
      nl: "Laat de ventilator nog de nalooptijd van de kap draaien en schakelt hem dan uit.",
      de: "Lässt den Lüfter für die Nachlaufzeit der Haube laufen und schaltet ihn dann aus.",
    },
  },
  {
    id: "hood_set_light",
    title: { en: "Turn the light on or off", nl: "Zet de verlichting aan of uit", de: "Beleuchtung ein- oder ausschalten" },
    titleFormatted: {
      en: "Turn the light [[enabled]]",
      nl: "Zet de verlichting [[enabled]]",
      de: "Beleuchtung [[enabled]] schalten",
    },
    args: [onOffArg],
  },
  {
    id: "hood_set_light_brightness",
    title: { en: "Set light brightness", nl: "Zet helderheid verlichting", de: "Helligkeit der Beleuchtung einstellen" },
    titleFormatted: {
      en: "Set light brightness to [[brightness]]%",
      nl: "Zet helderheid verlichting op [[brightness]]%",
      de: "Helligkeit der Beleuchtung auf [[brightness]]% einstellen",
    },
    args: [
      {
        name: "brightness",
        type: "range",
        title: { en: "Brightness", nl: "Helderheid", de: "Helligkeit" },
        min: 10,
        max: 100,
        step: 1,
        label: "%",
      },
    ],
  },
  {
    id: "hood_set_ambient_light",
    title: {
      en: "Turn the ambient light on or off",
      nl: "Zet de sfeerverlichting aan of uit",
      de: "Ambientebeleuchtung ein- oder ausschalten",
    },
    titleFormatted: {
      en: "Turn the ambient light [[enabled]]",
      nl: "Zet de sfeerverlichting [[enabled]]",
      de: "Ambientebeleuchtung [[enabled]] schalten",
    },
    args: [onOffArg],
  },
];

// ---- Coffee machine ------------------------------------------------------

const COFFEEMAKER_CAPS = [
  "onoff",
  "homeconnect_operation_state",
  "homeconnect_program",
  "homeconnect_program_progress",
  "homeconnect_bean_amount",
  "homeconnect_fill_quantity",
  "homeconnect_cup_warmer",
  "homeconnect_beverage_count_coffee",
  "homeconnect_remote_start",
  "homeconnect_remote_control_active",
  "homeconnect_local_control_active",
  "homeconnect_child_lock",
];

const COFFEEMAKER_SHARED = {
  triggers: [
    "program_started",
    "program_finished",
    "program_aborted",
    "operation_state_changed",
    "program_progress_changed",
    "remote_start_allowed_changed",
    "remote_control_active_changed",
    "local_control_changed",
    "error_occurred",
    "software_update_available",
  ],
  conditions: [
    "is_running",
    "is_inactive",
    "has_error",
    "remote_start_allowed",
    "remote_control_is_active",
    "local_control_is_active",
    "current_program_is",
  ],
  actions: ["stop_program", "acknowledge_event", "power_off"],
};

const BEAN_AMOUNT_VALUES = [
  { id: "VeryMild", title: { en: "Very mild", nl: "Zeer mild", de: "Sehr mild" } },
  { id: "Mild", title: { en: "Mild", nl: "Mild", de: "Mild" } },
  { id: "MildPlus", title: { en: "Mild +", nl: "Mild +", de: "Mild +" } },
  { id: "Normal", title: { en: "Normal", nl: "Normaal", de: "Normal" } },
  { id: "NormalPlus", title: { en: "Normal +", nl: "Normaal +", de: "Normal +" } },
  { id: "Strong", title: { en: "Strong", nl: "Sterk", de: "Stark" } },
  { id: "StrongPlus", title: { en: "Strong +", nl: "Sterk +", de: "Stark +" } },
  { id: "VeryStrong", title: { en: "Very strong", nl: "Zeer sterk", de: "Sehr stark" } },
  { id: "VeryStrongPlus", title: { en: "Very strong +", nl: "Zeer sterk +", de: "Sehr stark +" } },
  { id: "ExtraStrong", title: { en: "Extra strong", nl: "Extra sterk", de: "Extra stark" } },
  { id: "DoubleShot", title: { en: "Double shot", nl: "Dubbele shot", de: "Doppelter Shot" } },
  { id: "DoubleShotPlus", title: { en: "Double shot +", nl: "Dubbele shot +", de: "Doppelter Shot +" } },
  { id: "DoubleShotPlusPlus", title: { en: "Double shot ++", nl: "Dubbele shot ++", de: "Doppelter Shot ++" } },
  { id: "TripleShot", title: { en: "Triple shot", nl: "Driedubbele shot", de: "Dreifacher Shot" } },
  { id: "TripleShotPlus", title: { en: "Triple shot +", nl: "Driedubbele shot +", de: "Dreifacher Shot +" } },
  { id: "CoffeeGround", title: { en: "Ground coffee", nl: "Gemalen koffie", de: "Kaffeepulver" } },
];

const MACHINE_DEFAULT_VALUE = {
  id: "default",
  title: { en: "Machine setting", nl: "Instelling van de machine", de: "Einstellung der Maschine" },
};

const COFFEE_TEMPERATURE_VALUES = ["88C", "90C", "92C", "94C", "95C", "96C"].map((id) => ({
  id,
  title: { en: `${id.slice(0, -1)} °C`, nl: `${id.slice(0, -1)} °C`, de: `${id.slice(0, -1)} °C` },
}));

const beverageArg = {
  name: "beverage",
  type: "autocomplete",
  title: { en: "Drink", nl: "Drank", de: "Getränk" },
};

const coffeeAlert = (id, en, nl, de) => ({ id: `coffeemaker_${id}`, title: { en, nl, de } });

const COFFEEMAKER_TRIGGERS = [
  coffeeAlert("bean_container_empty", "Bean container is empty", "Bonenreservoir is leeg", "Bohnenbehälter ist leer"),
  coffeeAlert("water_tank_empty", "Water tank is empty", "Waterreservoir is leeg", "Wassertank ist leer"),
  coffeeAlert("drip_tray_full", "Drip tray is full", "Lekbak is vol", "Tropfschale ist voll"),
  coffeeAlert("keep_milk_tank_cool", "Keep the milk container cool", "Houd het melkreservoir koel", "Milchbehälter kühl halten"),
  {
    ...coffeeAlert(
      "maintenance_required",
      "Cleaning or descaling is due",
      "Reinigen of ontkalken is nodig",
      "Reinigen oder Entkalken ist fällig",
    ),
    tokens: [
      {
        name: "reminder",
        type: "string",
        title: { en: "Reminder", nl: "Melding", de: "Hinweis" },
        example: { en: "DescalingIn10Cups", nl: "DescalingIn10Cups", de: "DescalingIn10Cups" },
      },
    ],
  },
];

const COFFEEMAKER_CONDITIONS = [
  {
    id: "coffeemaker_cup_warmer_is_on",
    title: {
      en: "Cup warmer !{{is|is not}} on",
      nl: "Kopjesverwarmer !{{staat|staat niet}} aan",
      de: "Tassenwärmer !{{ist|ist nicht}} an",
    },
  },
];

const COFFEEMAKER_ACTIONS = [
  {
    id: "coffeemaker_make_beverage",
    title: { en: "Make a drink", nl: "Zet een drankje", de: "Getränk zubereiten" },
    titleFormatted: { en: "Make [[beverage]]", nl: "Zet [[beverage]]", de: "[[beverage]] zubereiten" },
    hint: {
      en: "Uses the machine's own settings for this drink. The machine must be on and allow remote start.",
      nl: "Gebruikt de eigen instellingen van de machine voor dit drankje. De machine moet aan staan en starten op afstand toestaan.",
      de: "Verwendet die Einstellungen der Maschine für dieses Getränk. Die Maschine muss eingeschaltet sein und Fernstart erlauben.",
    },
    args: [beverageArg],
  },
  {
    id: "coffeemaker_make_beverage_custom",
    title: {
      en: "Make a drink with settings",
      nl: "Zet een drankje met instellingen",
      de: "Getränk mit Einstellungen zubereiten",
    },
    titleFormatted: {
      en: "Make [[beverage]], [[strength]], [[quantity]] ml at [[temperature]]",
      nl: "Zet [[beverage]], [[strength]], [[quantity]] ml op [[temperature]]",
      de: "[[beverage]] zubereiten, [[strength]], [[quantity]] ml bei [[temperature]]",
    },
    hint: {
      en: "Pick 'Machine setting' (or quantity 0) to keep the machine's own value. Settings this model doesn't have are skipped; values outside the drink's range are rejected by the machine.",
      nl: "Kies 'Instelling van de machine' (of hoeveelheid 0) om de eigen waarde van de machine te houden. Instellingen die dit model niet heeft worden overgeslagen; waarden buiten het bereik van het drankje weigert de machine.",
      de: "Wähle 'Einstellung der Maschine' (oder Menge 0), um den eigenen Wert der Maschine zu behalten. Einstellungen, die dieses Modell nicht hat, werden übersprungen; Werte außerhalb des Bereichs lehnt die Maschine ab.",
    },
    args: [
      beverageArg,
      {
        name: "strength",
        type: "dropdown",
        title: { en: "Strength", nl: "Sterkte", de: "Stärke" },
        values: [MACHINE_DEFAULT_VALUE, ...BEAN_AMOUNT_VALUES],
      },
      {
        name: "quantity",
        type: "number",
        title: {
          en: "Quantity (ml, 0 = machine setting)",
          nl: "Hoeveelheid (ml, 0 = instelling machine)",
          de: "Füllmenge (ml, 0 = Einstellung der Maschine)",
        },
        min: 0,
        max: 500,
        step: 10,
      },
      {
        name: "temperature",
        type: "dropdown",
        title: { en: "Temperature", nl: "Temperatuur", de: "Temperatur" },
        values: [MACHINE_DEFAULT_VALUE, ...COFFEE_TEMPERATURE_VALUES],
      },
    ],
  },
];

const ONLY = process.argv[2];
const want = (id) => !ONLY || ONLY === id;

if (want("oven")) {
  const ovenCompose = readJson("drivers/oven/driver.compose.json");
  ovenCompose.capabilities = OVEN_CAPS;
  writeJson("drivers/oven/driver.compose.json", ovenCompose);

  const ovenStart = ovenStartProgramOverride();
  const ovenActions = sharedActions("oven").map((a) =>
    a.id === ovenStart.id ? ovenStart : a,
  );

  writeFlow("drivers/oven/driver.flow.compose.json", {
    triggers: [...sharedTriggers("oven"), ...OVEN_EVENT_TRIGGERS],
    conditions: [...sharedConditions("oven"), ...OVEN_CONDITIONS],
    actions: [...ovenActions, ...OVEN_ACTIONS],
  });
}

if (want("dishwasher")) {
  const dwCompose = readJson("drivers/dishwasher/driver.compose.json");
  dwCompose.capabilities = DISHWASHER_CAPS;
  writeJson("drivers/dishwasher/driver.compose.json", dwCompose);

  writeFlow("drivers/dishwasher/driver.flow.compose.json", {
    triggers: [...sharedTriggers("dishwasher"), ...DISHWASHER_EVENT_TRIGGERS],
    conditions: [...sharedConditions("dishwasher"), ...DISHWASHER_CONDITIONS],
    actions: sharedActions("dishwasher"),
  });
}

if (want("washer")) {
  const washerCompose = readJson("drivers/washer/driver.compose.json");
  washerCompose.capabilities = WASHER_CAPS;
  writeJson("drivers/washer/driver.compose.json", washerCompose);

  writeFlow("drivers/washer/driver.flow.compose.json", {
    triggers: [...sharedTriggers("washer"), ...WASHER_EVENT_TRIGGERS],
    conditions: [...sharedConditions("washer"), ...WASHER_CONDITIONS],
    actions: [...sharedActions("washer"), ...WASHER_ACTIONS],
  });
}

if (want("dryer")) {
  const dryerCompose = readJson("drivers/dryer/driver.compose.json");
  dryerCompose.capabilities = DRYER_CAPS;
  writeJson("drivers/dryer/driver.compose.json", dryerCompose);

  writeFlow("drivers/dryer/driver.flow.compose.json", {
    triggers: sharedTriggers("dryer"),
    conditions: sharedConditions("dryer"),
    actions: [...sharedActions("dryer"), ...DRYER_ACTIONS],
  });
}

if (want("hood")) {
  const hoodCompose = readJson("drivers/hood/driver.compose.json");
  hoodCompose.capabilities = HOOD_CAPS;
  writeJson("drivers/hood/driver.compose.json", hoodCompose);

  writeFlow("drivers/hood/driver.flow.compose.json", {
    triggers: [...pick(sharedTriggers("hood"), "hood", HOOD_SHARED.triggers), ...HOOD_TRIGGERS],
    conditions: [
      ...pick(sharedConditions("hood"), "hood", HOOD_SHARED.conditions),
      ...HOOD_CONDITIONS,
    ],
    actions: [...pick(sharedActions("hood"), "hood", HOOD_SHARED.actions), ...HOOD_ACTIONS],
  });
}

if (want("coffeemaker")) {
  const coffeeCompose = readJson("drivers/coffeemaker/driver.compose.json");
  coffeeCompose.capabilities = COFFEEMAKER_CAPS;
  writeJson("drivers/coffeemaker/driver.compose.json", coffeeCompose);

  const p = "coffeemaker";
  writeFlow("drivers/coffeemaker/driver.flow.compose.json", {
    triggers: [...pick(sharedTriggers(p), p, COFFEEMAKER_SHARED.triggers), ...COFFEEMAKER_TRIGGERS],
    conditions: [
      ...pick(sharedConditions(p), p, COFFEEMAKER_SHARED.conditions),
      ...COFFEEMAKER_CONDITIONS,
    ],
    actions: [...pick(sharedActions(p), p, COFFEEMAKER_SHARED.actions), ...COFFEEMAKER_ACTIONS],
  });
}

console.log(`driver compose + flow files written${ONLY ? " (scope: " + ONLY + ")" : ""}`);
