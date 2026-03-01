import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Sanitize NPC name to a safe filename
function npcFilename(npc, index) {
  const name = (npc.name || 'npc').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return name || `npc_${index}`;
}

export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {},
  },
  publicDir: path.resolve(__dirname, '../assets'),
  build: {
    target: 'esnext',
  },
  plugins: [{
    name: 'map-save-api',
    configureServer(server) {
      // Serve combined NPC array from folder: GET /npcs/<mapname>.json
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/npcs\/([a-z0-9_]+)\.json$/);
        if (!match || req.method !== 'GET') return next();

        const mapKey = match[1];
        const npcDir = path.resolve(__dirname, '..', 'assets', 'npcs', mapKey);

        if (!fs.existsSync(npcDir) || !fs.statSync(npcDir).isDirectory()) {
          res.setHeader('Content-Type', 'application/json');
          res.end('[]');
          return;
        }

        const files = fs.readdirSync(npcDir).filter(f => f.endsWith('.json')).sort();
        const npcs = files.map(f => {
          const data = JSON.parse(fs.readFileSync(path.join(npcDir, f), 'utf-8'));
          data._filename = f.replace('.json', '');
          return data;
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(npcs));
      });

      // Save map data
      server.middlewares.use('/api/save-map', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { mapKey, data, npcs } = JSON.parse(body);
            const mapPath = path.resolve(__dirname, '..', 'assets', 'maps', `${mapKey}.json`);
            fs.writeFileSync(mapPath, JSON.stringify(data, null, 2));

            // Save NPCs: one file per NPC in assets/npcs/<mapKey>/
            if (npcs !== undefined) {
              const npcDir = path.resolve(__dirname, '..', 'assets', 'npcs', mapKey);
              if (!fs.existsSync(npcDir)) fs.mkdirSync(npcDir, { recursive: true });

              // Track which files we write so we can clean up deleted NPCs
              const writtenFiles = new Set();
              const usedNames = new Map();

              npcs.forEach((npc, i) => {
                // Use existing _filename if present, otherwise generate from name
                let filename = npc._filename || npcFilename(npc, i);

                // Handle duplicate names: append _2, _3, etc.
                const count = (usedNames.get(filename) || 0) + 1;
                usedNames.set(filename, count);
                if (count > 1) filename = `${filename}_${count}`;

                // Strip _filename before saving
                const npcData = { ...npc };
                delete npcData._filename;

                const filePath = path.join(npcDir, `${filename}.json`);
                fs.writeFileSync(filePath, JSON.stringify(npcData, null, 2) + '\n');
                writtenFiles.add(`${filename}.json`);
              });

              // Remove old NPC files that are no longer in the list
              const existing = fs.readdirSync(npcDir).filter(f => f.endsWith('.json'));
              for (const f of existing) {
                if (!writtenFiles.has(f)) {
                  fs.unlinkSync(path.join(npcDir, f));
                  console.log(`[Editor] Deleted npcs/${mapKey}/${f}`);
                }
              }

              console.log(`[Editor] Saved ${mapKey}.json + ${writtenFiles.size} NPC files in npcs/${mapKey}/`);
            } else {
              console.log(`[Editor] Saved ${mapKey}.json`);
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: mapPath }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  }],
});
