/**
 * BattleTestChooser.js
 * src/client/systems/BattleTestChooser.js
 *
 * Development helper: shows a small overlay so you can choose
 *   1. Which Pokémon in your party to use as the lead fighter
 *   2. Which wild Pokémon to fight (species + level)
 *
 * Called automatically when you talk to the Battle-Test NPC
 * (see NPC script: `battle:` with no arguments).
 *
 * Usage from ScriptRunner:
 *   showBattleTestChooser(scene, (speciesId, level) => launchBattle(...), onCancel)
 */

const COMMON_TEST_POKEMON = [
  'bulbasaur','charmander','squirtle','pikachu','eevee',
  'mewtwo','gengar','snorlax','dragonite','alakazam',
  'machamp','starmie','lapras','vaporeon','jolteon',
  'flareon','arcanine','gyarados','rhydon','exeggutor',
];

const CSS = `
#bt-chooser-overlay {
  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.72);
  font-family: 'Segoe UI', sans-serif;
}
#bt-chooser-box {
  background: #1a1a2e;
  border: 2px solid #4fc3f7;
  border-radius: 12px;
  padding: 24px 28px;
  color: #e0f7fa;
  width: 480px;
  max-width: 96vw;
  box-shadow: 0 0 40px rgba(79,195,247,0.25);
}
#bt-chooser-box h2 {
  margin: 0 0 6px;
  font-size: 18px;
  color: #4fc3f7;
  letter-spacing: 1px;
  text-transform: uppercase;
}
#bt-chooser-box p.subtitle {
  margin: 0 0 16px;
  font-size: 12px;
  color: #888;
}
.bt-section { margin-bottom: 18px; }
.bt-section label {
  display: block;
  font-size: 12px;
  color: #4fc3f7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}
.bt-section select, .bt-section input[type=number], .bt-section input[type=text] {
  width: 100%;
  background: #0d0d1a;
  border: 1px solid #4fc3f7;
  border-radius: 6px;
  color: #e0f7fa;
  padding: 7px 10px;
  font-size: 14px;
  box-sizing: border-box;
}
.bt-row { display: flex; gap: 10px; }
.bt-row .bt-section { flex: 1; }
.bt-buttons { display: flex; gap: 10px; margin-top: 20px; }
.bt-btn {
  flex: 1; padding: 10px;
  border: none; border-radius: 8px;
  font-size: 14px; font-weight: 700;
  cursor: pointer; letter-spacing: 0.5px;
  transition: opacity 0.15s;
}
.bt-btn:hover { opacity: 0.85; }
.bt-btn-start { background: #4fc3f7; color: #0d0d1a; }
.bt-btn-cancel { background: #333; color: #aaa; }
#bt-party-list {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;
}
.bt-party-card {
  display: flex; align-items: center; gap: 6px;
  background: #0d0d1a; border: 2px solid #333;
  border-radius: 8px; padding: 6px 10px;
  cursor: pointer; min-width: 110px;
  transition: border-color 0.15s;
  font-size: 13px;
}
.bt-party-card.selected { border-color: #4fc3f7; background: #112233; }
.bt-party-card img { width: 32px; height: 32px; image-rendering: pixelated; }
.bt-party-card .bt-pkname { font-weight: 600; text-transform: capitalize; }
.bt-party-card .bt-pklvl { font-size: 11px; color: #888; }
`;

/**
 * Show the battle test chooser.
 *
 * @param {Phaser.Scene} scene      - Active OverworldScene
 * @param {Function} onStart        - (speciesId:string, level:number) => void
 * @param {Function} onCancel       - () => void  — called if player cancels
 */
export function showBattleTestChooser(scene, onStart, onCancel) {
  // Inject CSS once
  if (!document.getElementById('bt-chooser-style')) {
    const s = document.createElement('style');
    s.id = 'bt-chooser-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const pm = scene.partyManager || window.partyManager;
  const party = pm ? pm.getParty().filter(p => !p.isFainted) : [];

  // ── Build overlay ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'bt-chooser-overlay';

  const box = document.createElement('div');
  box.id = 'bt-chooser-box';
  box.innerHTML = `
    <h2>🧪 Battle Test Setup</h2>
    <p class="subtitle">Dev tool — choose your fighter and the enemy.</p>
  `;

  // ── Party picker (player's lead Pokémon) ───────────────────────────────────
  let selectedPartyIdx = 0;

  const partySection = document.createElement('div');
  partySection.className = 'bt-section';
  partySection.innerHTML = `<label>Your Lead Pokémon</label>`;

  const partyList = document.createElement('div');
  partyList.id = 'bt-party-list';

  if (party.length === 0) {
    partyList.innerHTML = `<span style="color:#f88;font-size:13px">No healthy Pokémon in party!</span>`;
  } else {
    party.forEach((pk, i) => {
      const card = document.createElement('div');
      card.className = 'bt-party-card' + (i === 0 ? ' selected' : '');
      card.innerHTML = `
        <img src="/assets/pokemon/Icons/${pk.speciesId.toUpperCase()}.png"
             onerror="this.style.display='none'">
        <div>
          <div class="bt-pkname">${pk.name}</div>
          <div class="bt-pklvl">Lv ${pk.level} · ${pk.hp}/${pk.maxHp} HP</div>
        </div>
      `;
      card.addEventListener('click', () => {
        partyList.querySelectorAll('.bt-party-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedPartyIdx = i;
      });
      partyList.appendChild(card);
    });
  }

  partySection.appendChild(partyList);
  box.appendChild(partySection);

  // ── Enemy picker ───────────────────────────────────────────────────────────
  const enemyRow = document.createElement('div');
  enemyRow.className = 'bt-row';

  // Species
  const speciesSection = document.createElement('div');
  speciesSection.className = 'bt-section';
  speciesSection.innerHTML = `<label>Enemy Pokémon</label>`;

  const speciesInput = document.createElement('input');
  speciesInput.type = 'text';
  speciesInput.placeholder = 'e.g. pikachu, mewtwo…';
  speciesInput.value = 'pikachu';
  speciesInput.setAttribute('list', 'bt-species-list');

  // Datalist of suggestions
  const dataList = document.createElement('datalist');
  dataList.id = 'bt-species-list';
  COMMON_TEST_POKEMON.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    dataList.appendChild(opt);
  });
  speciesSection.appendChild(speciesInput);
  speciesSection.appendChild(dataList);

  // Level
  const levelSection = document.createElement('div');
  levelSection.className = 'bt-section';
  levelSection.style.maxWidth = '120px';
  levelSection.innerHTML = `<label>Level</label>`;

  const levelInput = document.createElement('input');
  levelInput.type = 'number';
  levelInput.min = 1;
  levelInput.max = 100;
  levelInput.value = 10;
  levelSection.appendChild(levelInput);

  enemyRow.appendChild(speciesSection);
  enemyRow.appendChild(levelSection);
  box.appendChild(enemyRow);

  // ── Buttons ────────────────────────────────────────────────────────────────
  const buttons = document.createElement('div');
  buttons.className = 'bt-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'bt-btn bt-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });

  const startBtn = document.createElement('button');
  startBtn.className = 'bt-btn bt-btn-start';
  startBtn.textContent = '⚔️  Start Battle';
  startBtn.addEventListener('click', () => {
    const sid = speciesInput.value.trim().toLowerCase().replace(/\s+/g, '_');
    const lvl = Math.max(1, Math.min(100, parseInt(levelInput.value, 10) || 5));

    if (!sid) {
      speciesInput.style.borderColor = '#f88';
      speciesInput.focus();
      return;
    }

    // Swap the selected party member to slot 0 so BattleState picks them up
    if (pm && party.length > 1 && selectedPartyIdx !== 0) {
      const fullParty = pm.getParty();
      const chosenIdx = fullParty.indexOf(party[selectedPartyIdx]);
      if (chosenIdx > 0) {
        // Swap with slot 0
        [fullParty[0], fullParty[chosenIdx]] = [fullParty[chosenIdx], fullParty[0]];
        pm.save?.();
      }
    }

    overlay.remove();
    onStart(sid, lvl);
  });

  buttons.appendChild(cancelBtn);
  buttons.appendChild(startBtn);
  box.appendChild(buttons);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Focus species input for quick keyboard entry
  setTimeout(() => speciesInput.focus(), 50);
}
