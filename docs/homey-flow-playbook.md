# Homey Flow Playbook for Home Connect Local

This document maps the current oven and dishwasher drivers to practical Homey Flows.
It only uses cards that exist in this app's driver compose files, plus normal Homey cards such as time, presence, push notifications, speech, lights, smart plugs, or water valves.

## Driver Coverage

### Oven device

Declared capabilities:

- Power: `onoff`.
- State: `homeconnect_operation_state`, `homeconnect_door_state`, `homeconnect_program`, `homeconnect_selected_program`, `homeconnect_program_progress`, `homeconnect_remaining_time`, `homeconnect_elapsed_time`, `homeconnect_start_in_relative`.
- Remote/local control: `homeconnect_remote_start`, `homeconnect_remote_control_active`, `homeconnect_local_control_active`.
- Counters and locks: `homeconnect_program_count_started`, `homeconnect_child_lock`.
- Temperature: `measure_temperature`, `homeconnect_program_duration`, `homeconnect_meat_probe_plugged`, `homeconnect_meat_probe_temp`, `homeconnect_meat_probe_target`.
- Controls/settings: `homeconnect_cavity_light`, `homeconnect_fast_preheat`, `homeconnect_alarm_clock`, `homeconnect_pyrolysis_level`, `homeconnect_count_up_timer`, `homeconnect_display_brightness`, `homeconnect_button_tones`, `homeconnect_signal_duration`.

Custom triggers:

- `oven_program_finished`: A program finished.
- `oven_program_started`: A program started.
- `oven_program_aborted`: A program was aborted.
- `oven_door_changed`: The door state changed. Token: `door_state`.
- `oven_door_opened`: The door was opened.
- `oven_door_closed`: The door was closed.
- `oven_operation_state_changed`: The operation state changed. Token: `operation_state`.
- `oven_program_progress_changed`: The program progress changed. Token: `progress`.
- `oven_remaining_time_changed`: Remaining time changed. Token: `minutes`.
- `oven_elapsed_time_changed`: Elapsed time changed. Token: `minutes`.
- `oven_remote_start_allowed_changed`: Remote start allowed changed. Token: `allowed`.
- `oven_remote_control_active_changed`: Remote control active changed. Token: `active`.
- `oven_local_control_changed`: Local control changed. Token: `active`.
- `oven_child_lock_changed`: Child lock changed. Token: `enabled`.
- `oven_error_occurred`: An error occurred. Token: `error_code`.
- `oven_aqua_stop_occurred`: AquaStop occurred.
- `oven_low_water_pressure`: Low water pressure.
- `oven_software_update_available`: A software update is available.
- `oven_preheat_finished`: Preheat finished. Token: `mode`.
- `oven_alarm_clock_elapsed`: Kitchen timer elapsed.
- `oven_meat_probe_temp_reached`: Meat probe target reached.
- `oven_meat_probe_attention`: Meat probe needs attention. Token: `kind`.
- `oven_insert_food`: Insert food. Token: `when`.
- `oven_turn_food`: Turn food. Token: `when`.
- `oven_door_attention`: Door needs attention. Token: `kind`.
- `oven_cavity_temp_too_high`: Cavity temperature too high.
- `oven_easy_clean_required`: EasyClean required.
- `oven_pyrolysis_remove_tank`: Remove pyrolysis tank.
- `oven_subsequent_cooking_request`: Subsequent cooking suggested.
- `oven_operating_time_limit_reached`: Operating time limit reached.
- `oven_cooling_lock_active`: Door locked while cooling.

Custom conditions:

- `oven_is_running`: Is running.
- `oven_is_finished`: Is finished.
- `oven_is_paused`: Is paused.
- `oven_is_inactive`: Is idle.
- `oven_is_in_delayed_start`: Delayed start is active.
- `oven_has_error`: There is an error.
- `oven_door_is_open`: The door is open.
- `oven_remote_start_allowed`: Remote start is allowed.
- `oven_remote_control_is_active`: Remote control is active.
- `oven_local_control_is_active`: Local control is active.
- `oven_child_lock_is_on`: The child lock is on.
- `oven_remaining_time_below`: Remaining time is below minutes.
- `oven_program_progress_above`: Program progress is above percent.
- `oven_current_program_is`: The active program is selected program.
- `oven_selected_program_is`: The selected program is selected program.
- `oven_meat_probe_is_plugged`: Meat probe is plugged in.
- `oven_cavity_temperature_above`: Cavity temperature is above deg C.
- `oven_meat_probe_temperature_above`: Meat probe temperature is above deg C.
- `oven_target_temperature_above`: Target temperature is above deg C.
- `oven_fast_preheat_is_on`: Fast preheat is on.
- `oven_cavity_light_is_on`: Oven light is on.

Custom actions:

- `oven_start_program`: Start a program at temperature and duration.
- `oven_select_program`: Select a program.
- `oven_start_program_delayed`: Start a program with a delay.
- `oven_stop_program`: Stop the program.
- `oven_pause_program`: Pause the program.
- `oven_resume_program`: Resume the program.
- `oven_set_child_lock`: Set child lock.
- `oven_acknowledge_event`: Acknowledge event.
- `oven_power_off`: Turn off standby.
- `oven_set_target_temperature`: Set target temperature.
- `oven_set_meat_probe_target`: Set meat probe target.
- `oven_set_alarm_clock`: Set kitchen timer.
- `oven_set_cavity_light`: Set oven light.
- `oven_set_fast_preheat`: Set fast preheat.

### Dishwasher device

Declared capabilities:

- Power: `onoff`.
- State: `homeconnect_operation_state`, `homeconnect_door_state`, `homeconnect_program`, `homeconnect_selected_program`, `homeconnect_program_progress`, `homeconnect_remaining_time`, `homeconnect_elapsed_time`, `homeconnect_start_in_relative`, `homeconnect_program_phase`.
- Remote/local control: `homeconnect_remote_start`, `homeconnect_remote_control_active`, `homeconnect_local_control_active`.
- Counters and locks: `homeconnect_program_count_started`, `homeconnect_child_lock`.
- Forecast/status: `homeconnect_energy_forecast`, `homeconnect_water_forecast`, `homeconnect_eco_dry_active`, `homeconnect_machine_care_runs_left`, `homeconnect_silence_remaining`.
- Program options/settings: `homeconnect_half_load`, `homeconnect_silence_on_demand`, `homeconnect_intensiv_zone`, `homeconnect_vario_speed_plus`, `homeconnect_hygiene_plus`, `homeconnect_brilliance_dry`, `homeconnect_extra_dry`, `homeconnect_eco_as_default`, `homeconnect_drying_assistant`, `homeconnect_gap_illumination`, `homeconnect_rinse_aid_level`, `homeconnect_water_hardness`, `homeconnect_hot_water_connection`, `homeconnect_sensitivity_turbidity`, `homeconnect_sound_level_signal`, `homeconnect_silence_default_time`.

Custom triggers:

- `dishwasher_program_finished`: A program finished.
- `dishwasher_program_started`: A program started.
- `dishwasher_program_aborted`: A program was aborted.
- `dishwasher_door_changed`: The door state changed. Token: `door_state`.
- `dishwasher_door_opened`: The door was opened.
- `dishwasher_door_closed`: The door was closed.
- `dishwasher_operation_state_changed`: The operation state changed. Token: `operation_state`.
- `dishwasher_program_progress_changed`: The program progress changed. Token: `progress`.
- `dishwasher_remaining_time_changed`: Remaining time changed. Token: `minutes`.
- `dishwasher_elapsed_time_changed`: Elapsed time changed. Token: `minutes`.
- `dishwasher_remote_start_allowed_changed`: Remote start allowed changed. Token: `allowed`.
- `dishwasher_remote_control_active_changed`: Remote control active changed. Token: `active`.
- `dishwasher_local_control_changed`: Local control changed. Token: `active`.
- `dishwasher_child_lock_changed`: Child lock changed. Token: `enabled`.
- `dishwasher_error_occurred`: An error occurred. Token: `error_code`.
- `dishwasher_aqua_stop_occurred`: AquaStop occurred.
- `dishwasher_low_water_pressure`: Low water pressure.
- `dishwasher_software_update_available`: A software update is available.
- `dishwasher_program_phase_changed`: The program phase changed. Token: `phase`.
- `dishwasher_salt_low`: Salt is low. Token: `severity`.
- `dishwasher_rinse_aid_low`: Rinse aid is low. Token: `severity`.
- `dishwasher_filter_check_required`: Filter check required.
- `dishwasher_machine_care_reminder`: Machine care reminder.
- `dishwasher_draining_issue`: Draining problem. Token: `kind`.
- `dishwasher_low_voltage`: Low voltage.
- `dishwasher_water_heater_calcified`: Water heater scaled up.
- `dishwasher_internal_error`: Internal error.

Custom conditions:

- `dishwasher_is_running`: Is running.
- `dishwasher_is_finished`: Is finished.
- `dishwasher_is_paused`: Is paused.
- `dishwasher_is_inactive`: Is idle.
- `dishwasher_is_in_delayed_start`: Delayed start is active.
- `dishwasher_has_error`: There is an error.
- `dishwasher_door_is_open`: The door is open.
- `dishwasher_remote_start_allowed`: Remote start is allowed.
- `dishwasher_remote_control_is_active`: Remote control is active.
- `dishwasher_local_control_is_active`: Local control is active.
- `dishwasher_child_lock_is_on`: The child lock is on.
- `dishwasher_remaining_time_below`: Remaining time is below minutes.
- `dishwasher_program_progress_above`: Program progress is above percent.
- `dishwasher_current_program_is`: The active program is selected program.
- `dishwasher_selected_program_is`: The selected program is selected program.
- `dishwasher_program_phase_is`: Program phase is one of `None`, `PreRinse`, `MainWash`, `FinalRinse`, `Drying`.
- `dishwasher_eco_dry_is_active`: Eco-dry is active.
- `dishwasher_half_load_is_on`: Half load is on.
- `dishwasher_silence_on_demand_is_active`: Silence is active.

Custom actions:

- `dishwasher_start_program`: Start a program.
- `dishwasher_select_program`: Select a program.
- `dishwasher_start_program_delayed`: Start a program with a delay.
- `dishwasher_stop_program`: Stop the program.
- `dishwasher_pause_program`: Pause the program.
- `dishwasher_resume_program`: Resume the program.
- `dishwasher_set_child_lock`: Set child lock.
- `dishwasher_acknowledge_event`: Acknowledge event.
- `dishwasher_power_off`: Turn off standby.

## Cross-Appliance Automations

### Critical appliance fault escalation

Intent: Make water, voltage, and appliance faults visible immediately.

Flow A, dishwasher water safety:

- When: `dishwasher_aqua_stop_occurred` or `dishwasher_draining_issue`.
- And: none.
- Then: Send urgent push notification to all adults, turn kitchen lights red, optionally close a smart water valve, optionally turn off dishwasher using `dishwasher_power_off`.

Flow B, oven/dishwasher generic faults:

- When: `oven_error_occurred`, `dishwasher_error_occurred`, `dishwasher_internal_error`, `oven_low_water_pressure`, `dishwasher_low_water_pressure`, `dishwasher_low_voltage`, or `dishwasher_water_heater_calcified`.
- And: none.
- Then: Send push notification including the available token, flash kitchen lights, optionally create a task/reminder.

### Remote-start readiness reminder

Intent: Avoid automations silently failing because remote start was disabled at the appliance.

Flow:

- When: `oven_remote_start_allowed_changed` or `dishwasher_remote_start_allowed_changed`.
- And: token `allowed` is false, if using Homey logic/token conditions.
- Then: Notify: "Remote start is no longer allowed for the appliance. Enable it on the appliance before scheduled flows can start programs."

### Night safety shutdown

Intent: Do not leave finished appliances awake overnight.

Flow:

- When: Time is 23:30.
- And: `oven_is_finished` or `dishwasher_is_finished`.
- And: door is not open, using the inverted `door_is_open` condition.
- Then: `oven_power_off` or `dishwasher_power_off`.

## Oven Flow Recipes

### Oven preheated, start cooking prompt

Intent: Notify only when the oven is actively being prepared.

Flow:

- When: `oven_preheat_finished`.
- And: `oven_is_running`.
- Then: Send push notification: "Oven is preheated. Put the food in now." Include token `mode` if useful.
- Then: `oven_set_cavity_light` enabled.
- Then: Turn kitchen/worktop lights to cooking scene for 10 minutes.

### Insert food and turn food assistant

Intent: Convert appliance prompts into Homey notifications.

Flow A:

- When: `oven_insert_food`.
- And: `oven_is_running`.
- Then: Announce on kitchen speaker and send push notification: "Insert food in the oven." Include token `when`.
- Then: `oven_set_cavity_light` enabled.

Flow B:

- When: `oven_turn_food`.
- And: `oven_is_running`.
- Then: Announce: "Turn the food in the oven." Include token `when`.
- Then: Flash kitchen lights briefly.

### Meat probe cooking done

Intent: Treat meat-probe completion as a high-confidence "food is done" event.

Flow:

- When: `oven_meat_probe_temp_reached`.
- And: `oven_meat_probe_is_plugged`.
- Then: Send push notification: "Meat probe target reached. Check the oven."
- Then: `oven_set_cavity_light` enabled.
- Optional Then: `oven_pause_program` if your cooking style expects the oven to stop holding heat.

### Meat probe attention

Intent: Surface probe mistakes before a cooking session is ruined.

Flow:

- When: `oven_meat_probe_attention`.
- And: `oven_is_running`.
- Then: Send push notification including token `kind`.
- Then: Announce on kitchen speaker.

### Oven almost done

Intent: Give an early warning before the finish event.

Flow:

- When: `oven_remaining_time_changed`.
- And: `oven_remaining_time_below` 5.
- And: `oven_is_running`.
- Then: Notify: "Oven finishes in about 5 minutes."
- Then: Turn kitchen lights to a warm prep scene if someone is home.

### Oven finished, guided cooldown

Intent: Notify, light the cavity, and safely power off later.

Flow A:

- When: `oven_program_finished`.
- And: none.
- Then: Notify: "Oven program finished."
- Then: `oven_set_cavity_light` enabled.
- Then: Start a Homey timer named `oven_finished_grace` for 10 minutes.

Flow B:

- When: Homey timer `oven_finished_grace` finished.
- And: `oven_is_finished`.
- And: door is not open, using the inverted `oven_door_is_open` condition.
- Then: `oven_power_off`.
- Then: `oven_set_cavity_light` disabled.

### Oven door open while running

Intent: Catch accidental heat loss.

Flow A:

- When: `oven_door_opened`.
- And: `oven_is_running`.
- Then: Start a Homey timer named `oven_door_open_warning` for 2 minutes.

Flow B:

- When: Homey timer `oven_door_open_warning` finished.
- And: `oven_is_running`.
- And: `oven_door_is_open`.
- Then: Send push notification: "Oven door is still open while running."
- Optional Then: `oven_pause_program`.

### High heat safety warning

Intent: Warn when the oven remains hot or reports excessive cavity temperature.

Flow A:

- When: `oven_cavity_temp_too_high`.
- And: none.
- Then: Send urgent push notification: "Oven cavity temperature too high."
- Then: Turn kitchen lights red.

Flow B:

- When: `oven_operation_state_changed`.
- And: `oven_is_inactive`.
- And: `oven_cavity_temperature_above` 80.
- Then: Notify: "Oven is off but still hot."

### Scheduled oven start with safety gates

Intent: Start a program only if the appliance is actually ready.

Flow:

- When: Time is 17:30 or a meal-prep virtual button is pressed.
- And: `oven_remote_start_allowed`.
- And: `oven_remote_control_is_active`.
- And: `oven_is_inactive`.
- And: door is not open, using the inverted `oven_door_is_open` condition.
- Then: `oven_set_fast_preheat` enabled.
- Then: `oven_start_program` with the chosen program, temperature, and duration.
- Then: Notify: "Oven program started."

### Oven cleaning and service reminders

Intent: Turn maintenance events into actionable reminders.

Flow A:

- When: `oven_easy_clean_required`.
- Then: Send notification: "Oven EasyClean is recommended."

Flow B:

- When: `oven_pyrolysis_remove_tank`.
- Then: Send urgent notification: "Remove the tank before pyrolysis."

Flow C:

- When: `oven_operating_time_limit_reached` or `oven_cooling_lock_active`.
- Then: Notify with clear action text.

## Dishwasher Flow Recipes

### Cheap-rate dishwasher start

Intent: Run the dishwasher during off-peak hours without starting when unsafe.

Flow:

- When: Time is 23:00.
- And: `dishwasher_remote_start_allowed`.
- And: `dishwasher_remote_control_is_active`.
- And: `dishwasher_is_inactive`.
- And: door is not open, using the inverted `dishwasher_door_is_open` condition.
- Then: `dishwasher_start_program` with your preferred Eco/Auto program from autocomplete.
- Then: `dishwasher_set_child_lock` enabled if desired.

### Delayed dishwasher start after loading

Intent: Let a manual loading action queue a later wash.

Flow:

- When: A scene/virtual button "Dishwasher loaded" is pressed.
- And: `dishwasher_remote_start_allowed`.
- And: door is not open, using the inverted `dishwasher_door_is_open` condition.
- Then: `dishwasher_start_program_delayed` with your preferred program and delay, for example 180 minutes.
- Then: Notify: "Dishwasher scheduled."

### Dishwasher drying phase notification

Intent: Let the household know not to unload too early.

Flow:

- When: `dishwasher_program_phase_changed`.
- And: `dishwasher_program_phase_is` Drying.
- Then: Notify: "Dishwasher is drying. Leave it closed for better results."
- Optional And: `dishwasher_eco_dry_is_active` if you only want this for Eco-dry.

### Dishwasher almost done

Intent: Notify shortly before completion.

Flow:

- When: `dishwasher_remaining_time_changed`.
- And: `dishwasher_remaining_time_below` 10.
- And: `dishwasher_is_running`.
- Then: Notify: "Dishwasher finishes in about 10 minutes."

### Dishwasher finished and unload reminder

Intent: Avoid forgotten clean dishes.

Flow A:

- When: `dishwasher_program_finished`.
- Then: Notify: "Dishwasher finished. Open the door when convenient."
- Then: Start a Homey timer named `dishwasher_unload_reminder` for 2 hours.

Flow B:

- When: `dishwasher_door_opened`.
- And: `dishwasher_is_finished`.
- Then: Stop timer `dishwasher_unload_reminder` if your timer app supports it.
- Then: `dishwasher_power_off`.

Flow C:

- When: Homey timer `dishwasher_unload_reminder` finished.
- And: `dishwasher_is_finished`.
- And: door is not open, using the inverted `dishwasher_door_is_open` condition.
- Then: Notify: "Clean dishwasher has not been opened yet."

### Dishwasher consumables and maintenance

Intent: Make maintenance events impossible to miss.

Flow A:

- When: `dishwasher_salt_low`.
- Then: Notify: "Dishwasher salt is low." Include token `severity`.
- Then: Optionally add a shopping-list item.

Flow B:

- When: `dishwasher_rinse_aid_low`.
- Then: Notify: "Dishwasher rinse aid is low." Include token `severity`.
- Then: Optionally add a shopping-list item.

Flow C:

- When: `dishwasher_filter_check_required`.
- Then: Notify: "Check dishwasher filter."

Flow D:

- When: `dishwasher_machine_care_reminder`.
- Then: Notify: "Run dishwasher Machine Care."

### Dishwasher door open while running

Intent: Catch accidental interruption.

Flow A:

- When: `dishwasher_door_opened`.
- And: `dishwasher_is_running`.
- Then: Start a Homey timer named `dishwasher_door_open_warning` for 3 minutes.

Flow B:

- When: Homey timer `dishwasher_door_open_warning` finished.
- And: `dishwasher_is_running`.
- And: `dishwasher_door_is_open`.
- Then: Notify: "Dishwasher door is still open while running."

### Quiet-hours dishwasher guard

Intent: Alert when the dishwasher is running without silence mode at night.

Flow:

- When: `dishwasher_program_started`.
- And: Time is between 22:00 and 07:00.
- And: `dishwasher_silence_on_demand_is_active` is false.
- Then: Notify: "Dishwasher started during quiet hours without silence mode."

Note: This app exposes `homeconnect_silence_on_demand` as a writable capability, but there is no dedicated custom Flow action for it yet. If Homey exposes a generated capability action for your device, use that. Otherwise add a custom action card in the app before automating this.

## Recommended App Improvements

These would make the above flows easier to build directly from this app:

- Add dishwasher action cards for the writable program options: half load, silence on demand, intensive zone, VarioSpeedPlus, HygienePlus, BrillianceDry, ExtraDry, gap illumination, signal volume, and silence default time.
- Add trigger cards for writable option changes where they matter in automations, especially dishwasher silence mode and oven cavity light.
- Add a dedicated condition for door closed to avoid relying on the inverted `door_is_open` condition.
- Add tokenized program names to `program_started`, `program_finished`, and `program_aborted` if Homey supports retrieving the active program at trigger time.
- Add a `remaining_time_equals_or_below` condition or debounce logic if repeated remaining-time updates cause duplicate notifications.
