#!/usr/bin/env node
// One-shot generator for the Home Connect (Local) app capability JSONs +
// SVG icons. Run from the repo root. Safe to re-run: overwrites whatever is
// already there. Intentionally not part of the build pipeline.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd(), ".homeycompose", "capabilities");
const assetsRoot = resolve(process.cwd(), "assets", "capability");
mkdirSync(root, { recursive: true });
mkdirSync(assetsRoot, { recursive: true });

// All SVGs share a 24x24 viewBox, 1.5 stroke, rounded caps, currentColor.
// Homey re-colours the icon based on UI state, so a single-colour path is
// what the platform expects.
function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
${body}
</svg>
`;
}

const caps = [
  // ===== Shared read-only =====
  {
    id: "homeconnect_selected_program",
    json: {
      type: "string",
      title: { en: "Selected program", nl: "Geselecteerd programma" },
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
<path d="M15 4v5h5"/>
<path d="M8 14h8"/>
<path d="M8 18h5"/>`),
  },
  {
    id: "homeconnect_elapsed_time",
    json: {
      type: "number",
      title: { en: "Elapsed time", nl: "Verstreken tijd" },
      units: { en: "min" },
      decimals: 0,
      min: 0,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<circle cx="12" cy="13" r="8"/>
<path d="M12 9v4l3 2"/>
<path d="M9 2h6"/>
<path d="M12 2v3"/>`),
  },
  {
    id: "homeconnect_start_in_relative",
    json: {
      type: "number",
      title: { en: "Starts in", nl: "Start over" },
      units: { en: "min" },
      decimals: 0,
      min: 0,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<circle cx="12" cy="13" r="8"/>
<path d="M12 9v4"/>
<path d="M15 14l-3-1"/>
<path d="M16 4l3 3-3 3"/>
<path d="M19 7H9"/>`),
  },
  {
    id: "homeconnect_remote_control_active",
    json: {
      type: "boolean",
      title: { en: "Remote control active", nl: "Bediening op afstand actief" },
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<rect x="3" y="5" width="14" height="14" rx="2"/>
<path d="M7 9h6"/>
<path d="M7 13h4"/>
<path d="M17 5l4 4"/>
<circle cx="20" cy="6" r="1.5"/>`),
  },
  {
    id: "homeconnect_local_control_active",
    json: {
      type: "boolean",
      title: { en: "Operated locally", nl: "Lokaal bediend" },
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M9 11V5a1.5 1.5 0 0 1 3 0v6"/>
<path d="M12 11V4a1.5 1.5 0 0 1 3 0v8"/>
<path d="M15 12V6a1.5 1.5 0 0 1 3 0v9a6 6 0 0 1-6 6h-1a5 5 0 0 1-5-5v-2l-2-3a1.5 1.5 0 0 1 2-2l2 1"/>`),
  },
  {
    id: "homeconnect_program_count_started",
    json: {
      type: "number",
      title: { en: "Programs started", nl: "Programma's gestart" },
      decimals: 0,
      min: 0,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M4 6h16"/>
<path d="M4 12h16"/>
<path d="M4 18h10"/>
<circle cx="18" cy="18" r="3"/>
<path d="M16.5 18l1 1 2-2"/>`),
  },
  {
    id: "homeconnect_energy_forecast",
    json: {
      type: "number",
      title: { en: "Energy forecast", nl: "Verwacht energieverbruik" },
      units: { en: "%" },
      decimals: 0,
      min: 0,
      max: 100,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>`),
  },
  {
    id: "homeconnect_water_forecast",
    json: {
      type: "number",
      title: { en: "Water forecast", nl: "Verwacht waterverbruik" },
      units: { en: "%" },
      decimals: 0,
      min: 0,
      max: 100,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M12 3C7 10 6 14 6 16a6 6 0 0 0 12 0c0-2-1-6-6-13z"/>`),
  },
  // ===== Shared writable =====
  {
    id: "homeconnect_child_lock",
    json: {
      type: "boolean",
      title: { en: "Child lock", nl: "Kinderslot" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<rect x="5" y="11" width="14" height="10" rx="2"/>
<path d="M8 11V8a4 4 0 0 1 8 0v3"/>
<circle cx="12" cy="16" r="1.2"/>`),
  },
  // ===== Oven =====
  {
    id: "homeconnect_meat_probe_plugged",
    json: {
      type: "boolean",
      title: { en: "Meat probe plugged in", nl: "Vleesthermometer geplaatst" },
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M3 13l4 4 12-12-4-4z"/>
<path d="M9 11l4 4"/>
<circle cx="6" cy="18" r="2"/>`),
  },
  {
    id: "homeconnect_meat_probe_temp",
    json: {
      type: "number",
      title: { en: "Meat probe temperature", nl: "Vleesthermometer temperatuur" },
      units: { en: "°C" },
      decimals: 0,
      min: 0,
      max: 110,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M14 14V5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0z"/>
<path d="M12 8v6"/>`),
  },
  {
    id: "homeconnect_meat_probe_target",
    json: {
      type: "number",
      title: { en: "Meat probe target", nl: "Vleesthermometer streefwaarde" },
      units: { en: "°C" },
      decimals: 0,
      min: 0,
      max: 99,
      step: 1,
      getable: true,
      setable: true,
      uiComponent: "slider",
    },
    svg: svg(`<path d="M14 14V5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0z"/>
<circle cx="12" cy="18" r="2"/>
<path d="M19 4l3 3-3 3"/>
<path d="M22 7h-8"/>`),
  },
  {
    id: "homeconnect_program_duration",
    json: {
      type: "number",
      title: { en: "Program duration", nl: "Programmaduur" },
      units: { en: "min" },
      decimals: 0,
      min: 0,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M7 2h10"/>
<path d="M7 22h10"/>
<path d="M9 2v4a4 4 0 0 0 6 0V2"/>
<path d="M9 22v-4a4 4 0 0 1 6 0v4"/>`),
  },
  {
    id: "homeconnect_cavity_light",
    json: {
      type: "boolean",
      title: { en: "Oven light", nl: "Ovenverlichting" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M9 16h6"/>
<path d="M10 19h4"/>
<path d="M12 2a6 6 0 0 1 4 10c-1 1-1.5 2-1.5 4h-5c0-2-.5-3-1.5-4A6 6 0 0 1 12 2z"/>`),
  },
  {
    id: "homeconnect_fast_preheat",
    json: {
      type: "boolean",
      title: { en: "Fast preheat", nl: "Snelvoorverwarmen" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>`),
  },
  {
    id: "homeconnect_alarm_clock",
    json: {
      type: "number",
      title: { en: "Kitchen timer", nl: "Kookwekker" },
      units: { en: "min" },
      decimals: 0,
      min: 0,
      max: 1440,
      step: 1,
      getable: true,
      setable: true,
      uiComponent: "slider",
    },
    svg: svg(`<circle cx="12" cy="14" r="8"/>
<path d="M12 10v4l3 2"/>
<path d="M5 4l3 3"/>
<path d="M19 4l-3 3"/>`),
  },
  {
    id: "homeconnect_pyrolysis_level",
    json: {
      type: "enum",
      title: { en: "Pyrolysis level", nl: "Pyrolyse-niveau" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "Level01", title: { en: "Level 1", nl: "Niveau 1" } },
        { id: "Level02", title: { en: "Level 2", nl: "Niveau 2" } },
        { id: "Level03", title: { en: "Level 3", nl: "Niveau 3" } },
      ],
    },
    svg: svg(`<path d="M12 2c2 4 4 6 4 10a4 4 0 1 1-8 0c0-3 2-5 4-10z"/>
<path d="M12 14c1 1 1.5 2 1.5 3a1.5 1.5 0 1 1-3 0c0-1 .5-2 1.5-3z"/>`),
  },
  {
    id: "homeconnect_count_up_timer",
    json: {
      type: "boolean",
      title: { en: "Count-up timer", nl: "Stopwatch" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<circle cx="12" cy="13" r="8"/>
<path d="M12 13l3-3"/>
<path d="M9 2h6"/>
<path d="M12 2v3"/>`),
  },
  {
    id: "homeconnect_display_brightness",
    json: {
      type: "number",
      title: { en: "Display brightness", nl: "Display-helderheid" },
      units: { en: "%" },
      decimals: 0,
      min: 0,
      max: 100,
      step: 25,
      getable: true,
      setable: true,
      uiComponent: "slider",
    },
    svg: svg(`<circle cx="12" cy="12" r="4"/>
<path d="M12 2v3"/>
<path d="M12 19v3"/>
<path d="M2 12h3"/>
<path d="M19 12h3"/>
<path d="M5 5l2 2"/>
<path d="M17 17l2 2"/>
<path d="M5 19l2-2"/>
<path d="M17 7l2-2"/>`),
  },
  {
    id: "homeconnect_button_tones",
    json: {
      type: "boolean",
      title: { en: "Button tones", nl: "Toetstonen" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M3 10v4h4l5 4V6L7 10z"/>
<path d="M16 8a4 4 0 0 1 0 8"/>`),
  },
  {
    id: "homeconnect_signal_duration",
    json: {
      type: "enum",
      title: { en: "Signal duration", nl: "Signaalduur" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "Short", title: { en: "Short", nl: "Kort" } },
        { id: "Medium", title: { en: "Medium", nl: "Gemiddeld" } },
        { id: "Long", title: { en: "Long", nl: "Lang" } },
        { id: "OnlyOneTime", title: { en: "Once", nl: "Eénmalig" } },
      ],
    },
    svg: svg(`<path d="M3 10v4h4l5 4V6L7 10z"/>
<path d="M16 9a3 3 0 0 1 0 6"/>
<path d="M19 7a6 6 0 0 1 0 10"/>`),
  },
  // ===== Dishwasher =====
  {
    id: "homeconnect_eco_dry_active",
    json: {
      type: "boolean",
      title: { en: "Eco-dry active", nl: "Eco-drogen actief" },
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M5 12c3-8 11-8 14 0-3 8-11 8-14 0z"/>
<path d="M5 12c4-2 10-2 14 0"/>`),
  },
  {
    id: "homeconnect_machine_care_runs_left",
    json: {
      type: "number",
      title: { en: "Programs until machine care", nl: "Programma's tot machineverzorging" },
      decimals: 0,
      min: 0,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<circle cx="12" cy="12" r="3"/>
<path d="M12 4v2"/>
<path d="M12 18v2"/>
<path d="M4 12h2"/>
<path d="M18 12h2"/>
<path d="M6.3 6.3l1.4 1.4"/>
<path d="M16.3 16.3l1.4 1.4"/>
<path d="M6.3 17.7l1.4-1.4"/>
<path d="M16.3 7.7l1.4-1.4"/>`),
  },
  {
    id: "homeconnect_silence_remaining",
    json: {
      type: "number",
      title: { en: "Silence time remaining", nl: "Stiltemodus resterend" },
      units: { en: "min" },
      decimals: 0,
      min: 0,
      getable: true,
      setable: false,
      uiComponent: "sensor",
    },
    svg: svg(`<path d="M3 10v4h4l5 4V6L7 10z"/>
<path d="M17 9l4 6"/>
<path d="M21 9l-4 6"/>`),
  },
  {
    id: "homeconnect_half_load",
    json: {
      type: "boolean",
      title: { en: "Half load", nl: "Halve belading" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<circle cx="12" cy="12" r="9"/>
<path d="M12 3v18"/>
<path d="M12 12L21 12a9 9 0 0 1-9 9z" fill="currentColor"/>`),
  },
  {
    id: "homeconnect_silence_on_demand",
    json: {
      type: "boolean",
      title: { en: "Silence on demand", nl: "Stiltemodus" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M3 10v4h4l5 4V6L7 10z"/>
<path d="M17 9l4 6"/>
<path d="M21 9l-4 6"/>`),
  },
  {
    id: "homeconnect_intensiv_zone",
    json: {
      type: "boolean",
      title: { en: "IntensiveZone", nl: "IntensiefZone" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<circle cx="12" cy="12" r="9"/>
<circle cx="12" cy="12" r="5"/>
<circle cx="12" cy="12" r="1.5" fill="currentColor"/>`),
  },
  {
    id: "homeconnect_vario_speed_plus",
    json: {
      type: "boolean",
      title: { en: "VarioSpeed+", nl: "VarioSpeed+" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M3 12a9 9 0 0 1 18 0"/>
<path d="M12 12l5-3"/>
<circle cx="12" cy="12" r="1.5" fill="currentColor"/>`),
  },
  {
    id: "homeconnect_hygiene_plus",
    json: {
      type: "boolean",
      title: { en: "HygienePlus", nl: "HygiënePlus" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>
<path d="M9 12l2 2 4-4"/>`),
  },
  {
    id: "homeconnect_brilliance_dry",
    json: {
      type: "boolean",
      title: { en: "Brilliance dry", nl: "Glansdrogen" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<path d="M12 3l1.5 4 4 1.5-4 1.5L12 14l-1.5-4-4-1.5 4-1.5z"/>
<path d="M18 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>`),
  },
  {
    id: "homeconnect_extra_dry",
    json: {
      type: "boolean",
      title: { en: "Extra drying", nl: "Extra drogen" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<circle cx="12" cy="12" r="4"/>
<path d="M12 2v3"/>
<path d="M12 19v3"/>
<path d="M2 12h3"/>
<path d="M19 12h3"/>
<path d="M5 5l2 2"/>
<path d="M17 17l2 2"/>
<path d="M5 19l2-2"/>
<path d="M17 7l2-2"/>`),
  },
  {
    id: "homeconnect_eco_as_default",
    json: {
      type: "enum",
      title: { en: "Default program", nl: "Standaardprogramma" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "LastProgram", title: { en: "Last used", nl: "Laatst gebruikt" } },
        { id: "EcoAsDefault", title: { en: "Eco", nl: "Eco" } },
      ],
    },
    svg: svg(`<path d="M12 3c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11z"/>
<path d="M9 14c1 1 2 2 3 2"/>`),
  },
  {
    id: "homeconnect_drying_assistant",
    json: {
      type: "enum",
      title: { en: "Drying assistant", nl: "Droogassistent" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "Off", title: { en: "Off", nl: "Uit" } },
        { id: "AllPrograms", title: { en: "All programs", nl: "Alle programma's" } },
        { id: "EcoAsDefault", title: { en: "Eco programs", nl: "Eco-programma's" } },
      ],
    },
    svg: svg(`<circle cx="12" cy="8" r="3"/>
<path d="M5 21a7 7 0 0 1 14 0"/>
<path d="M18 14l1.5 1.5"/>
<path d="M19.5 13l-1 4"/>`),
  },
  {
    id: "homeconnect_gap_illumination",
    json: {
      type: "boolean",
      title: { en: "Gap illumination", nl: "Voegverlichting" },
      getable: true,
      setable: true,
      uiComponent: "toggle",
    },
    svg: svg(`<rect x="4" y="5" width="16" height="14" rx="2"/>
<path d="M4 17h16"/>
<path d="M9 19l-1 2"/>
<path d="M15 19l1 2"/>`),
  },
  {
    id: "homeconnect_rinse_aid_level",
    json: {
      type: "enum",
      title: { en: "Rinse aid level", nl: "Glansspoelmiddel" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "Off", title: { en: "Off", nl: "Uit" } },
        { id: "R01", title: { en: "Level 1", nl: "Niveau 1" } },
        { id: "R02", title: { en: "Level 2", nl: "Niveau 2" } },
        { id: "R03", title: { en: "Level 3", nl: "Niveau 3" } },
        { id: "R04", title: { en: "Level 4", nl: "Niveau 4" } },
        { id: "R05", title: { en: "Level 5", nl: "Niveau 5" } },
        { id: "R06", title: { en: "Level 6", nl: "Niveau 6" } },
      ],
    },
    svg: svg(`<path d="M12 3C7 10 6 14 6 16a6 6 0 0 0 12 0c0-2-1-6-6-13z"/>
<path d="M12 14l.7 2 2 .7-2 .7L12 19l-.7-1.6-2-.7 2-.7z"/>`),
  },
  {
    id: "homeconnect_water_hardness",
    json: {
      type: "enum",
      title: { en: "Water hardness", nl: "Waterhardheid" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "H00", title: { en: "Off", nl: "Uit" } },
        { id: "H01", title: { en: "Level 1", nl: "Niveau 1" } },
        { id: "H02", title: { en: "Level 2", nl: "Niveau 2" } },
        { id: "H03", title: { en: "Level 3", nl: "Niveau 3" } },
        { id: "H04", title: { en: "Level 4", nl: "Niveau 4" } },
        { id: "H05", title: { en: "Level 5", nl: "Niveau 5" } },
        { id: "H06", title: { en: "Level 6", nl: "Niveau 6" } },
        { id: "H07", title: { en: "Level 7", nl: "Niveau 7" } },
      ],
    },
    svg: svg(`<path d="M9 3l-3 7a4 4 0 0 0 8 0z"/>
<path d="M14 13l-2 4a3 3 0 0 0 6 0z"/>`),
  },
  {
    id: "homeconnect_hot_water_connection",
    json: {
      type: "enum",
      title: { en: "Water connection", nl: "Wateraansluiting" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "ColdWater", title: { en: "Cold water", nl: "Koud water" } },
        { id: "HotWater", title: { en: "Hot water", nl: "Warm water" } },
      ],
    },
    svg: svg(`<path d="M12 3C7 10 6 14 6 16a6 6 0 0 0 12 0c0-2-1-6-6-13z"/>
<path d="M9 14c0 2 1 4 3 4"/>`),
  },
  {
    id: "homeconnect_sensitivity_turbidity",
    json: {
      type: "enum",
      title: { en: "Turbidity sensitivity", nl: "Vervuilingsgevoeligheid" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "Standard", title: { en: "Standard", nl: "Standaard" } },
        { id: "Sensitive", title: { en: "Sensitive", nl: "Gevoelig" } },
        { id: "VerySensitive", title: { en: "Very sensitive", nl: "Zeer gevoelig" } },
      ],
    },
    svg: svg(`<circle cx="12" cy="12" r="4"/>
<circle cx="12" cy="12" r="9"/>
<path d="M12 3v4"/>
<path d="M12 17v4"/>`),
  },
  {
    id: "homeconnect_sound_level_signal",
    json: {
      type: "enum",
      title: { en: "Signal volume", nl: "Signaalvolume" },
      getable: true,
      setable: true,
      uiComponent: "picker",
      values: [
        { id: "Off", title: { en: "Off", nl: "Uit" } },
        { id: "Low", title: { en: "Low", nl: "Laag" } },
        { id: "Medium", title: { en: "Medium", nl: "Gemiddeld" } },
        { id: "High", title: { en: "High", nl: "Hoog" } },
      ],
    },
    svg: svg(`<path d="M3 10v4h4l5 4V6L7 10z"/>
<path d="M16 9a3 3 0 0 1 0 6"/>
<path d="M19 7a6 6 0 0 1 0 10"/>`),
  },
  {
    id: "homeconnect_silence_default_time",
    json: {
      type: "number",
      title: { en: "Silence default time", nl: "Standaardstilteduur" },
      units: { en: "min" },
      decimals: 0,
      min: 1,
      max: 30,
      step: 1,
      getable: true,
      setable: true,
      uiComponent: "slider",
    },
    svg: svg(`<circle cx="12" cy="13" r="8"/>
<path d="M12 9v4l2 1"/>
<path d="M16 18l3 3"/>
<path d="M19 18l-3 3"/>`),
  },
];

function writeFile(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

for (const cap of caps) {
  const iconPath = `/assets/capability/${cap.id}.svg`;
  const jsonPath = resolve(root, `${cap.id}.json`);
  const svgPath = resolve(assetsRoot, `${cap.id}.svg`);
  writeFile(svgPath, cap.svg);
  const body = { ...cap.json, icon: iconPath };
  writeFile(jsonPath, JSON.stringify(body, null, 2) + "\n");
}

console.log(`generated ${caps.length} capabilities`);
