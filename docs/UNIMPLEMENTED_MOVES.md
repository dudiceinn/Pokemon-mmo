# Unimplemented Moves Report

**Total moves in moves.json:** 395 (all learnset move IDs covered)
**Last updated:** After complex effects session

---

## ✅ Completed sessions

- **Priority 1** — stat-boosting, stat-dropping, pure status moves
- **Priority 2** — recovery, multi-hit, fixed damage, OHKO, screens (Mist fully implemented)
- **Priority 3 partial** — weather, protect, leech seed, trapping, toxic, variable power, tailwind
- **moves.json** — all 395 learnset move IDs covered
- **Trivial effects** — recharge, crash_if_miss, always_crit, variable power tiers, self-lowering stats, splash, etc.
- **`_pv` flag effects** — aqua_ring, ingrain, endure, nightmare, uproar, flee, lock_2to3turns_confuse
- **Complex effects** — substitute, counter, mirror_coat, reversal, punishment, synchronoise, retaliate, perish_song, destiny_bond, curse, baton_pass, stockpile system, force_switch, force_repeat (encore), metronome, transform, tri_attack, memento, healing_wish, psystrike

---

## Effect String Status

### ✅ Handled (154 effect strings)

`always_crit`, `aqua_ring`, `badly_poison`, `badly_poison_50pct`, `baton_pass`, `belly_drum`, `burn`, `burn_100pct`, `burn_10pct`, `burn_30pct`, `bypass_protect`, `confuse`, `confuse_10pct`, `confuse_20pct`, `confuse_30pct`, `counter`, `crash_if_miss`, `curse`, `destiny_bond`, `disable_last_move`, `double_if_asleep`, `double_if_half_hp`, `double_if_hurt`, `double_if_slower`, `double_if_statused`, `double_spd_4turns`, `drain_half`, `drain_half_if_asleep`, `endure`, `final_gambit`, `fixed_20dmg`, `fixed_40dmg`, `flee`, `flinch_10pct`, `flinch_20pct`, `flinch_30pct`, `force_repeat`, `force_switch`, `freeze_10pct`, `hail_weather`, `halve_hp`, `halve_special_dmg`, `heal_by_stockpile`, `heal_half_hp`, `heal_party_status`, `heal_pulse`, `healing_wish`, `high_crit`, `hit_2to5`, `hit_twice`, `hit_twice_poison_20pct`, `ingrain`, `leave_1hp`, `leech_seed`, `level_damage`, `lock_2to3turns_confuse`, `lower_acc`, `lower_atk`, `lower_atk2`, `lower_atk_def`, `lower_atk_def_self`, `lower_def`, `lower_def2`, `lower_def_spdef_self`, `lower_eva`, `lower_spatk2`, `lower_spatk2_self`, `lower_spatk_30pct`, `lower_spd2`, `lower_spdef2`, `match_hp`, `memento`, `mirror_coat`, `mist_screen`, `never_miss`, `nightmare`, `ohko`, `pain_split`, `paralyze`, `paralyze_10pct`, `paralyze_30pct`, `pay_day`, `perish_song`, `poison`, `poison_30pct`, `power_by_pp`, `power_by_spd_ratio`, `power_by_stat_boosts`, `power_by_stockpile`, `power_by_weight`, `prevent_status_5turns`, `priority1`, `protect`, `psych_up`, `psywave`, `punishment`, `rain_weather`, `raise_all_stats_10pct`, `raise_atk`, `raise_atk2`, `raise_atk3_on_ko`, `raise_atk_confuse`, `raise_atk_def_acc`, `raise_atk_on_hit`, `raise_atk_spatk`, `raise_atk_spd`, `raise_crit_rate`, `raise_def`, `raise_def2`, `raise_def_spdef`, `raise_eva`, `raise_eva2`, `raise_random_stat2`, `raise_spatk2`, `raise_spatk_confuse`, `raise_spatk_spdef`, `raise_spatk_spdef_spd`, `raise_spd2`, `raise_spdef`, `raise_spdef2`, `random_move`, `random_power`, `recharge_turn`, `recoil_25pct`, `recoil_33pct`, `recoil_33pct_burn_10pct`, `reflect_screen`, `reset_stat_changes`, `reset_target_stages`, `retaliate`, `reversal`, `sand_weather`, `self_cure_status`, `shell_smash`, `sleep`, `sleep_full_heal`, `spd_down_10pct`, `spd_down_self`, `spdef_down_10pct`, `spdef_down_20pct`, `splash`, `stockpile`, `substitute`, `sun_weather`, `synchronoise`, `transform`, `trap`, `trap_4to5turns`, `tri_attack`, `two_turn`, `uproar`, `use_def_not_spdef`, `user_faints`, `wring_out`

---

### ⏭️ Remaining (42 effect strings — all niche / low priority)

| Effect | Move(s) | Notes |
|---|---|---|
| `charge_first_turn` | solar_beam, solarbeam | Two-turn move; skip turn, then fire |
| `charge_raise_def` | skull_bash | Two-turn move; +1 Def on charge turn |
| `double_each_turn` | fury_cutter | Power doubles each consecutive use (2→4→8…) |
| `double_each_turn_5` | rollout | Power doubles for 5 turns |
| `double_if_switching` | pursuit | Double power if target is switching out |
| `double_if_last_failed` | stomping_tantrum | Double power if user's last move failed |
| `priority1_if_attacking` | sucker_punch | Priority only if foe chose a damaging move |
| `set_stealth_rock` | stealth_rock | Entry hazard on switch-in |
| `set_toxic_spikes` | toxic_spikes | Entry hazard; poison on switch-in |
| `remove_hazards` | rapid_spin | Clear all entry hazards |
| `block_crits` | lucky_chant | `_screens[side].noCrits = 5` |
| `block_shared_moves` | imprison | Prevent foe using moves in common with user |
| `boost_ally` | helping_hand | Doubles-only; skip |
| `draw_attacks` | follow_me, rage_powder | Doubles-only; skip |
| `ignore_evasion` | foresight | Ignore evasion; Normal/Fighting hit Ghost |
| `ignore_defense_boosts` | chip_away | Ignore positive Def/SpDef stages |
| `copy_last_move` | copycat, mimic | Execute foe's last used move |
| `copy_opponent_move` | mirror_move | Execute the move just used against user |
| `grassy_terrain` | grassy_terrain | Terrain system not scaffolded |
| `gravity` | gravity | 5-turn gravity; grounds all Pokémon |
| `magic_coat` | magic_coat | Reflect status moves back at attacker |
| `magnet_rise` | magnet_rise | Immune to Ground moves for 5 turns |
| `miracle_eye` | miracle_eye, odor_sleuth | Normal/Fighting hit Ghost; ignore evasion |
| `mud_sport` | mud_sport | Weaken Electric moves 5 turns |
| `water_sport` | water_sport | Weaken Fire moves 5 turns |
| `smack_down` | smack_down | Remove Flying immunity to Ground |
| `spite` | spite | Reduce foe's last-used move PP by 4 |
| `role_play` | role_play | Copy foe's ability |
| `suppress_ability` | gastro_acid | Nullify foe's ability |
| `steal_item` | covet | Take foe's held item |
| `steal_berry` | pluck | Eat foe's held berry |
| `knock_off_item` | knock_off | Remove foe's held item |
| `change_type_to_move` | conversion | Change user type to type of first move |
| `change_type_resist` | conversion2 | Change type to resist foe's last move |
| `change_type_water` | soak | Change foe's type to Water |
| `power_by_berry` | natural_gift | Power/type derived from held berry |
| `fling` | fling | Power derived from held item |
| `recycle` | recycle | Restore last consumed item |
| `last_resort` | last_resort | Usable only after all other moves used once |
| `me_first` | me_first | Use foe's selected move at 1.5× power |
| `trick` | trick | Swap held items with foe |
| `sleep_talk` | sleep_talk | Use a random move while asleep |

---

## Summary

| Status | Count |
|---|---|
| ✅ moves.json entries | 395 / 395 |
| ✅ Effect strings handled | 154 |
| ⏭️ Niche / low priority remaining | 42 |
