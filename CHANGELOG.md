# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Ovens**:
  - Real-time monitoring capability for operation state, door state, remaining program time, program progress, cavity & meat probe temperatures.
  - Active microwave power level, current program name, and active physical interior lighting status.
  - Warning sensors for safety events like cavity temperature too high (`homeconnect_oven_temp_too_high`) or software updates available (`homeconnect_software_update_available`).
  - Read-only target temperature sensor (`homeconnect_oven_target_temperature`) mapped directly to `SetpointTemperature` with automatic state reconciliation.
  - Flow triggers for when preheating has completed (regular and fast preheat).
  - Program control and temperature setting where allowed by the appliance.
- **Dishwashers**:
  - Real-time monitoring capability for operation state, door state, remaining time (including estimated remaining time), program progress.
  - Active options tracking (half load, intensive zone, vario speed, etc.).
  - Maintenance & alert sensors: salt low status (`homeconnect_salt_lack`), rinse aid low status (`homeconnect_rinse_aid_lack`), remaining runs until Machine Care recommendation, filter cleaning checks, and drain pump blockages.
  - Software updates available alert sensor (`homeconnect_software_update_available`).
  - Program start, pause, resume, stop, and settings control.
- **Flow cards**:
  - Complete trigger, condition, and action cards for ovens and dishwashers to automate all available states, events, and settings.
  - Full German translation support (`"de"`) for all flow card manifests.

### Fixed
- Consolidated oven program name capability updates to prevent raw vs. friendly name flickering.
- Excluded temporary local runtime files (`devices_check.json`) from repository tracking via `.gitignore`.
