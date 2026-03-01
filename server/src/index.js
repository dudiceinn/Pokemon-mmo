import { WS_PORT } from '@pokemon-mmo/shared';
import { GameServer } from './GameServer.js';

const server = new GameServer(WS_PORT);
server.start();

console.log(`[Server] Pokemon MMO server started`);
console.log(`[Server] WebSocket on ws://localhost:${WS_PORT}`);
