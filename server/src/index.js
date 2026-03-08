import readline from 'readline';
import { WS_PORT } from '@pokemon-mmo/shared';
import { initDB } from './db.js';
import { GameServer } from './GameServer.js';

// Initialize database, then start server
const db = await initDB();

const server = new GameServer(WS_PORT);
server.start();

console.log(`[Server] Pokemon MMO server started`);
console.log(`[Server] WebSocket on ws://localhost:${WS_PORT}`);
console.log(`[Server] Auth API on http://localhost:${WS_PORT}/api/register & /api/login`);
console.log(`[Server] Terminal commands: say, players, kick, help`);

// ─── Server Terminal ─────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  const [cmd, ...args] = trimmed.split(/\s+/);
  const rest = args.join(' ');

  switch (cmd.toLowerCase()) {
    case 'say':
      if (!rest) return console.log('[CMD] Usage: say <message>');
      server.broadcastSystemMsg(`[GM] ${rest}`);
      console.log(`[CMD] Broadcast: ${rest}`);
      break;

    case 'players': {
      const list = [];
      for (const [, player] of server.players) {
        list.push(`  ${player.name} — ${player.map} (${player.x}, ${player.y})`);
      }
      console.log(`[CMD] Online: ${server.players.size}`);
      if (list.length) console.log(list.join('\n'));
      break;
    }

    case 'kick': {
      if (!rest) return console.log('[CMD] Usage: kick <playerName>');
      let found = false;
      for (const [ws, player] of server.players) {
        if (player.name.toLowerCase() === rest.toLowerCase()) {
          server.broadcastSystemMsg(`${player.name} was kicked by the server.`);
          ws.close();
          found = true;
          console.log(`[CMD] Kicked ${player.name}`);
          break;
        }
      }
      if (!found) console.log(`[CMD] Player "${rest}" not found`);
      break;
    }

    case 'help':
      console.log(`[CMD] Available commands:`);
      console.log(`  say <message>     — broadcast a server message to all players`);
      console.log(`  players           — list all online players and their locations`);
      console.log(`  kick <name>       — kick a player by name`);
      console.log(`  help              — show this list`);
      break;

    default:
      console.log(`[CMD] Unknown command: ${cmd}. Type "help" for commands.`);
  }
});
