#!/usr/bin/env node
// One-shot generator for the oven + dishwasher driver compose files. Run from
// the repo root. Overwrites driver.compose.json and driver.flow.compose.json
// for both drivers. Safe to re-run.

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
  "target_temperature",
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
  "homeconnect_microwave_power",
  "homeconnect_oven_program_name",
  "homeconnect_interior_light_active",
  "homeconnect_oven_temp_too_high",
  "homeconnect_software_update_available",
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
  "homeconnect_remaining_time_estimated",
  "homeconnect_salt_lack",
  "homeconnect_rinse_aid_lack",
  "homeconnect_filter_check_required",
  "homeconnect_drain_pump_blocked",
  "homeconnect_software_update_available",
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

function sharedActions(prefix, label) {
  return [
    {
      id: `${prefix}_start_program`,
      title: { en: "Start a program", nl: "Start een programma" },
      titleFormatted: { en: "Start [[program]]", nl: "Start [[program]]" },
      hint: {
        en: `Requires remote start to be enabled on the ${label} first.`,
        nl: `Vereist dat op afstand starten eerst op de ${label} is ingeschakeld.`,
      },
      args: [{ name: "program", type: "autocomplete", title: { en: "Program", nl: "Programma" } }],
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
    args: [{ name: "enabled", type: "checkbox", title: { en: "Enabled", nl: "Aan" } }],
  },
  {
    id: "oven_set_fast_preheat",
    title: { en: "Set fast preheat", nl: "Zet snelvoorverwarmen" },
    titleFormatted: { en: "Fast preheat [[enabled]]", nl: "Snelvoorverwarmen [[enabled]]" },
    args: [{ name: "enabled", type: "checkbox", title: { en: "Enabled", nl: "Aan" } }],
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

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeJson(p, body) {
  writeFileSync(p, JSON.stringify(body, null, 2) + "\n");
}

// --- Oven driver -----------------------------------------------------------

const ovenCompose = readJson("drivers/oven/driver.compose.json");
ovenCompose.capabilities = OVEN_CAPS;
writeJson("drivers/oven/driver.compose.json", ovenCompose);

const ovenStart = ovenStartProgramOverride();
const ovenActions = sharedActions("oven", "oven").map((a) =>
  a.id === ovenStart.id ? ovenStart : a,
);

writeJson("drivers/oven/driver.flow.compose.json", {
  triggers: [...sharedTriggers("oven"), ...OVEN_EVENT_TRIGGERS],
  conditions: [...sharedConditions("oven"), ...OVEN_CONDITIONS],
  actions: [...ovenActions, ...OVEN_ACTIONS],
});

// --- Dishwasher driver -----------------------------------------------------

const dwCompose = readJson("drivers/dishwasher/driver.compose.json");
dwCompose.capabilities = DISHWASHER_CAPS;
writeJson("drivers/dishwasher/driver.compose.json", dwCompose);

writeJson("drivers/dishwasher/driver.flow.compose.json", {
  triggers: [...sharedTriggers("dishwasher"), ...DISHWASHER_EVENT_TRIGGERS],
  conditions: [...sharedConditions("dishwasher"), ...DISHWASHER_CONDITIONS],
  actions: sharedActions("dishwasher", "dishwasher"),
});

console.log("oven + dishwasher driver compose + flow files written");
