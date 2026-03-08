# Unimplemented Moves Report

**Total moves in moves.json:** 395 (all learnset move IDs covered)
**Last updated:** After `_pv` flag session

---

## ✅ Completed sessions

- **Priority 1** — stat-boosting, stat-dropping, pure status moves
- **Priority 2** — recovery, multi-hit, fixed damage, OHKO, screens (Mist fully implemented)
- **Priority 3 partial** — weather, protect, leech seed, trapping, toxic, variable power, tailwind
- **moves.json** — all 395 learnset move IDs covered
- **Trivial effects** — 30 one-liner effect strings (recharge, crash, always_crit, variable power, self-lowering stats, splash, etc.)
- **`_pv` flag effects** — aqua_ring, ingrain, endure, nightmare, uproar, flee (teleport), lock_2to3turns_confuse (thrash/outrage/petal dance)

---

## Effect String Status

### ✅ Handled (132 effect strings)

`always_crit`, `aqua_ring`, `badly_poison`, `badly_poison_50pct`, `belly_drum`, `burn`, `burn_100pct`, `burn_10pct`, `burn_30pct`, `bypass_protect`, `confuse`, `confuse_10pct`, `confuse_20pct`, `confuse_30pct`, `crash_if_miss`, `disable_last_move`, `double_if_asleep`, `double_if_half_hp`, `double_if_hurt`, `double_if_slower`, `double_if_statused`, `double_spd_4turns`, `drain_half`, `drain_half_if_asleep`, `endure`, `final_gambit`, `fixed_20dmg`, `fixed_40dmg`, `flee`, `flinch_10pct`, `flinch_20pct`, `flinch_30pct`, `freeze_10pct`, `hail_weather`, `halve_hp`, `halve_special_dmg`, `heal_half_hp`, `heal_party_status`, `heal_pulse`, `high_crit`, `hit_2to5`, `hit_twice`, `hit_twice_poison_20pct`, `ingrain`, `leave_1hp`, `leech_seed`, `level_damage`, `lock_2to3turns_confuse`, `lower_acc`, `lower_atk`, `lower_atk2`, `lower_atk_def`, `lower_atk_def_self`, `lower_def`, `lower_def2`, `lower_def_spdef_self`, `lower_eva`, `lower_spatk2`, `lower_spatk2_self`, `lower_spatk_30pct`, `lower_spd2`, `lower_spdef2`, `match_hp`, `mist_screen`, `never_miss`, `nightmare`, `ohko`, `pain_split`, `paralyze`, `paralyze_10pct`, `paralyze_30pct`, `pay_day`, `poison`, `poison_30pct`, `power_by_pp`, `power_by_spd_ratio`, `power_by_stat_boosts`, `power_by_weight`, `prevent_status_5turns`, `priority1`, `protect`, `psych_up`, `psywave`, `rain_weather`, `raise_all_stats_10pct`, `raise_atk`, `raise_atk2`, `raise_atk3_on_ko`, `raise_atk_confuse`, `raise_atk_def_acc`, `raise_atk_on_hit`, `raise_atk_spatk`, `raise_atk_spd`, `raise_crit_rate`, `raise_def`, `raise_def2`, `raise_def_spdef`, `raise_eva`, `raise_eva2`, `raise_random_stat2`, `raise_spatk2`, `raise_spatk_confuse`, `raise_spatk_spdef`, `raise_spatk_spdef_spd`, `raise_spd2`, `raise_spdef`, `raise_spdef2`, `random_power`, `recharge_turn`, `recoil_25pct`, `recoil_33pct`, `recoil_33pct_burn_10pct`, `reflect_screen`, `reset_stat_changes`, `reset_target_stages`, `sand_weather`, `self_cure_status`, `shell_smash`, `sleep`, `sleep_full_heal`, `spd_down_10pct`, `spd_down_self`, `spdef_down_10pct`, `spdef_down_20pct`, `splash`, `sun_weather`, `trap`, `trap_4to5turns`, `two_turn`, `uproar`, `user_faints`, `wring_out`

---

### 🔧 Unhandled (64 effect strings)

#### Complex / needs design (18)
| Effect | Move(s) | What to do |
|---|---|---|
| `substitute` | substitute | `_pv.substituteHp = floor(maxHp/4)`; attacks hit sub first |
| `counter` | counter | return 2× `_pv.lastPhysicalDamageTaken`; track per turn |
| `mirror_coat` | mirror_coat | return 2× `_pv.lastSpecialDamageTaken` |
| `reversal` | reversal, flail | tiered power inverse to HP ratio (200/150/100/80/40/20) |
| `punishment` | punishment | power = 60 + 20 per positive stage on foe, cap 200 |
| `synchronoise` | synchronoise | only deals damage if target shares a type with user |
| `retaliate` | retaliate | double power if ally fainted last turn |
| `perish_song` | perish_song | both `_pv.perishCount = 3`; faint when it hits 0 |
| `destiny_bond` | destiny_bond | `_pv.destinyBond`; if user faints this turn, foe also faints |
| `curse` | curse | Ghost: pay 50% HP, inflict 1/4 EOT chip on foe; else +1 ATK/DEF −1 Spd |
| `baton_pass` | baton_pass | switch while copying `_stages` + select `_pv` flags |
| `stockpile` / `power_by_stockpile` / `heal_by_stockpile` | stockpile, spit_up, swallow | 3-charge system on `_pv.stockpile` |
| `force_switch` | roar, whirlwind, dragon_tail | end wild battle without EXP; force switch in trainer battles |
| `force_repeat` | encore | `_pv.encoreTurns`, `_pv.encoreMove`; lock foe move selection |
| `random_move` | metronome | pick random move from moveDefs, call `_applyMove` |
| `transform` | transform | copy foe species/types/stats/moves into attacker |
| `tri_attack` | tri_attack | 20% chance burn/freeze/paralysis (random pick) |
| `memento` | memento | −2 ATK/SpAtk on foe, then user faints |
| `healing_wish` | healing_wish | user faints; next ally fully healed on switch-in |
| `use_def_not_spdef` | psystrike | use target's Defense instead of Sp. Def in damage calc |

#### Niche / low priority (46)
| Effect | Move(s) | Notes |
|---|---|---|
| `charge_first_turn` / `charge_raise_def` | solar_beam, solarbeam, skull_bash | two-turn moves |
| `double_each_turn` | fury_cutter | power doubles each consecutive use |
| `double_each_turn_5` | rollout | power doubles for 5 turns |
| `double_if_switching` | pursuit | double power if target is switching |
| `double_if_last_failed` | stomping_tantrum | double if user's last move failed |
| `priority1_if_attacking` | sucker_punch | priority only if foe chose a damaging move |
| `set_stealth_rock` | stealth_rock | entry hazard |
| `set_toxic_spikes` | toxic_spikes | entry hazard |
| `remove_hazards` | rapid_spin | clear entry hazards |
| `heal_party_status` | aromatherapy, heal_bell | cure all party status |
| `block_crits` | lucky_chant | `_screens[side].noCrits = 5` |
| `block_shared_moves` | imprison | prevent foe using shared moves |
| `boost_ally` | helping_hand | doubles-only; skip |
| `draw_attacks` | follow_me, rage_powder | doubles-only; skip |
| `ignore_evasion` | foresight | ignore evasion; Normal/Fighting hit Ghost |
| `ignore_defense_boosts` | chip_away | use base def ignoring positive stages |
| `copy_last_move` | copycat, mimic | execute foe's last used move |
| `copy_opponent_move` | mirror_move | execute move just used against attacker |
| `grassy_terrain` | grassy_terrain | terrain system not scaffolded |
| `gravity` | gravity | 5-turn gravity field |
| `magic_coat` | magic_coat | reflect status moves back at attacker |
| `magnet_rise` | magnet_rise | immune to Ground moves for 5 turns |
| `miracle_eye` | miracle_eye, odor_sleuth | Normal/Fighting hit Ghost; ignore evasion |
| `mud_sport` | mud_sport | weaken Electric moves 5 turns |
| `water_sport` | water_sport | weaken Fire moves 5 turns |
| `smack_down` | smack_down | ground Flying types |
| `spite` | spite | reduce foe's last-used move PP by 4 |
| `role_play` | role_play | copy foe's ability |
| `suppress_ability` | gastro_acid | nullify foe's ability |
| `steal_item` | covet | take foe's held item |
| `steal_berry` | pluck | eat foe's berry |
| `knock_off_item` | knock_off | remove foe's held item |
| `change_type_to_move` | conversion | change user type to type of first move |
| `change_type_resist` | conversion2 | change type to resist foe's last move |
| `change_type_water` | soak | change foe's type to Water |
| `power_by_berry` | natural_gift | power/type from held berry |
| `fling` | fling | power from held item |
| `recycle` | recycle | restore last consumed item |
| `last_resort` | last_resort | usable only after all other moves used |
| `me_first` | me_first | use foe's selected move at 1.5× power |
| `trick` | trick | swap held items |
| `sleep_talk` | sleep_talk | use random move while asleep |

---

## Summary

| Status | Count |
|---|---|
| ✅ moves.json entries | 395 / 395 |
| ✅ Effect strings handled | 132 |
| 🔧 Complex / needs design | 20 |
| ⏭️ Niche / low priority | ~46 |
