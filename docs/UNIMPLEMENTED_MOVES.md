# Unimplemented Moves Report

**Total moves referenced in learnsets:** 395
**Last updated:** After Priority 2 complete (excl. moonlight/synthesis)

---

## ✅ Priority 1 — COMPLETE (54 moves)

All stat-boosting, stat-dropping, and pure status moves. See previous session for full list.

---

## ✅ Priority 2 — COMPLETE (36 moves)

### Recovery
| Move | Effect |
|---|---|
| recover, softboiled, slack_off, roost | `heal_half_hp` — restore 50% max HP |
| rest | `sleep_full_heal` — full heal + sleep 2 turns |
| heal_pulse | `heal_pulse` — heal the target 50% |

### Multi-hit
| Move | Effect | Hits |
|---|---|---|
| bullet_seed, pin_missile, icicle_spear, rock_blast, barrage, comet_punch, fury_swipes, fury_attack, double_slap, doubleslap, spike_cannon | `hit_2to5` | 2–5 (35/35/15/15% distribution) |
| twineedle | `hit_twice_poison_20pct` | 2 hits + 20% poison |
| bonemerang, double_kick, double_hit | `hit_twice` | exactly 2 |

### Fixed / special damage
| Move | Effect | What it does |
|---|---|---|
| sonicboom | `fixed_20dmg` | always 20 damage |
| dragon_rage | `fixed_40dmg` | always 40 damage |
| night_shade, seismic_toss | `level_damage` | damage = attacker's level |
| psywave | `psywave` | damage = 50–150% of attacker's level |
| super_fang | `halve_hp` | half of target's current HP |
| final_gambit | `final_gambit` | damage = user's current HP, user faints |

### OHKO
| Move | Effect | Notes |
|---|---|---|
| fissure, guillotine, horn_drill, sheer_cold | `ohko` | fails if attacker level < defender; accuracy = level diff + 30 |

### Screens (5-turn field effects)
| Move | Effect | What it does |
|---|---|---|
| reflect | `reflect_screen` | halve physical damage (stored in `_screens`) |
| light_screen | `halve_special_dmg` | halve special damage |
| safeguard | `prevent_status_5turns` | block all external status moves |
| mist | `mist_screen` | block stat drops (Mist flag stored, needs `modifyStage` guard — see note below) |

> **Note on Mist:** The `_screens[side].mist` flag is stored and ticks down each turn, but `modifyStage` doesn't yet check it. To fully implement, add a check in `modifyStage` inside `PokemonInstance.js`: if the defending side has `mist > 0`, block negative stage changes from external sources.

> **Skipped (deferred):** moonlight, synthesis — weather-dependent healing, P3 territory.

---

## 🔧 Priority 3 — Persistent battle state required (~30 moves)

These need new fields on `BattleState` that survive across turns.

### Trapping
`wrap`, `bind`, `clamp`, `fire_spin`, `whirlpool`, `sand_tomb` — `trap_4to5turns` effect string exists in moves.json.
Needs: `_trapTurns` counter on defender, end-of-turn 1/8 chip damage, escape blocked.

### Phasing
`whirlwind`, `roar`, `dragon_tail` — `force_switch` effect string exists.
Needs: end wild battle without exp/victory, or force party switch in trainer battles.

### Weather
`sunny_day`, `rain_dance`, `sandstorm`, `hail` — effect strings exist.
Needs: `_weather` field on BattleState, damage multipliers in calc, end-of-turn chip for sand/hail, moonlight/synthesis healing variation.

### Entry hazards
`stealth_rock`, `toxic_spikes` — low priority until trainer battles exist.

### Complex mechanics
| Move | Effect string | What's needed |
|---|---|---|
| `leech_seed` | `leech_seed` | `_leeched` flag + end-of-turn drain to attacker |
| `substitute` | — | `_substituteHp` decoy, absorbs hits |
| `protect` / `detect` | `protect` | `_protecting` flag blocks all moves this turn |
| `encore` | `force_repeat` | `_encoreTurns` + `_encoreMove` locks foe's move |
| `baton_pass` | — | switch while passing `_stages` |
| `pain_split` | — | set both Pokémon HP to average |
| `endeavor` | `match_hp` | set foe HP to match user's |
| `perish_song` | — | `_perishCount`, both faint after 3 turns |
| `destiny_bond` | — | if user faints next turn, foe also faints |
| `counter` | — | return 2× last physical damage received |
| `mirror_coat` | — | return 2× last special damage received |
| `psych_up` | — | copy foe's `_stages` |
| `stockpile` / `spit_up` / `swallow` | `stockpile` / `power_by_stockpile` / `heal_by_stockpile` | 3-charge system |
| `transform` | — | copy foe's species, stats, moves |
| `metronome` | `random_move` | pick random move and execute |
| `belly_drum` | — | set HP to 50%, ATK stage to +6 |
| `shell_smash` | — | −1 DEF/SpDef, +2 ATK/SpAtk/Spd |
| `reversal` / `flail` | — | power scales inversely with user HP ratio |
| `gyro_ball` / `electro_ball` | `power_by_spd_ratio` | power scales with speed ratio |
| `stored_power` | `power_by_stat_boosts` | power scales with user's positive stages |
| `payback` | `double_if_slower` | power doubles if user moves second |
| `assurance` | — | power doubles if foe already took damage this turn |
| `punishment` | — | power scales with foe's positive stages |
| `retaliate` | — | power doubles if ally fainted last turn |
| `synchronoise` | — | only damages Pokémon sharing a type with user |
| `aqua_ring` / `ingrain` | — | heal 1/16 max HP per turn (end-of-turn hook needed) |

---

## Summary

| Status | Count |
|---|---|
| ✅ Fully implemented | ~90 moves |
| 🏗️ Needs persistent battle state | ~30 moves |
| ❓ Damage moves without moves.json entries yet | remaining of 395 |
