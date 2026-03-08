/**
 * Download Gen 5 (Black/White) animated sprites from PokeAPI sprites repo.
 * Downloads front + back for all Gen 1 Pokemon (1-151).
 *
 * Usage: node assets/tools/download-animated-sprites.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';
const OUT_FRONT = 'assets/pokemon-animated/front';
const OUT_BACK  = 'assets/pokemon-animated/back';

// Gen 1 Pokedex: number → lowercase name
const NAMES = [
  '', 'bulbasaur','ivysaur','venusaur','charmander','charmeleon','charizard',
  'squirtle','wartortle','blastoise','caterpie','metapod','butterfree',
  'weedle','kakuna','beedrill','pidgey','pidgeotto','pidgeot',
  'rattata','raticate','spearow','fearow','ekans','arbok',
  'pikachu','raichu','sandshrew','sandslash','nidoran-f','nidorina',
  'nidoqueen','nidoran-m','nidorino','nidoking','clefairy','clefable',
  'vulpix','ninetales','jigglypuff','wigglytuff','zubat','golbat',
  'oddish','gloom','vileplume','paras','parasect','venonat','venomoth',
  'diglett','dugtrio','meowth','persian','psyduck','golduck',
  'mankey','primeape','growlithe','arcanine','poliwag','poliwhirl',
  'poliwrath','abra','kadabra','alakazam','machop','machoke','machamp',
  'bellsprout','weepinbell','victreebel','tentacool','tentacruel',
  'geodude','graveler','golem','ponyta','rapidash','slowpoke','slowbro',
  'magnemite','magneton','farfetchd','doduo','dodrio','seel','dewgong',
  'grimer','muk','shellder','cloyster','gastly','haunter','gengar',
  'onix','drowzee','hypno','krabby','kingler','voltorb','electrode',
  'exeggcute','exeggutor','cubone','marowak','hitmonlee','hitmonchan',
  'lickitung','koffing','weezing','rhyhorn','rhydon','chansey',
  'tangela','kangaskhan','horsea','seadra','goldeen','seaking',
  'staryu','starmie','mr-mime','scyther','jynx','electabuzz',
  'magmar','pinsir','tauros','magikarp','gyarados','lapras',
  'ditto','eevee','vaporeon','jolteon','flareon','porygon',
  'omanyte','omastar','kabuto','kabutops','aerodactyl','snorlax',
  'articuno','zapdos','moltres','dratini','dragonair','dragonite',
  'mewtwo','mew',
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_FRONT, { recursive: true });
  fs.mkdirSync(OUT_BACK, { recursive: true });

  let ok = 0, fail = 0;

  for (let i = 1; i <= 151; i++) {
    const name = NAMES[i];
    const frontUrl = `${BASE}/${i}.gif`;
    const backUrl  = `${BASE}/back/${i}.gif`;
    const frontDest = path.join(OUT_FRONT, `${name}.gif`);
    const backDest  = path.join(OUT_BACK, `${name}.gif`);

    try {
      if (!fs.existsSync(frontDest)) {
        await download(frontUrl, frontDest);
        process.stdout.write(`✓ ${name} front  `);
      }
      if (!fs.existsSync(backDest)) {
        await download(backUrl, backDest);
        process.stdout.write(`✓ ${name} back\n`);
      } else {
        process.stdout.write(`· ${name} (exists)\n`);
      }
      ok++;
    } catch (err) {
      process.stdout.write(`✗ ${name}: ${err.message}\n`);
      fail++;
    }
  }

  console.log(`\nDone! ${ok} success, ${fail} failed`);
  console.log(`Front sprites: ${OUT_FRONT}/`);
  console.log(`Back sprites:  ${OUT_BACK}/`);
}

main();
