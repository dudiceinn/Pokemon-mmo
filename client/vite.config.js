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
    fs: {
      strict: false,
      allow: ['..']
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    }
  },
  publicDir: path.resolve(__dirname, '../assets'),
  assetsInclude: ['**/*.mp3', '**/*.ogg', '**/*.wav'],
  build: {
    target: 'esnext',
  },
  plugins: [
    {
      name: 'serve-static-files',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Strip query string for file lookup
          const urlPath = req.url.split('?')[0];

          // Handle JSON files
          if (urlPath.endsWith('.json')) {
            const filePath = path.resolve(__dirname, '../assets', urlPath.slice(1));
            console.log('Attempting to serve JSON:', filePath);
            
            if (fs.existsSync(filePath)) {
              try {
                const content = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Length', Buffer.byteLength(content, 'utf-8'));
                res.statusCode = 200;
                res.end(content);
                console.log('✅ Served JSON:', urlPath);
                return;
              } catch (err) {
                console.error('Error serving JSON:', err);
              }
            } else {
              console.log('❌ JSON file not found:', filePath);
            }
          }
          
          // Audio files — serve WITHOUT extension to bypass IDM interception
          // Request: /audio/bgm/wild_battle → serves assets/audio/bgm/wild_battle.mp3
          if (urlPath.startsWith('/audio/')) {
            const hasExt = urlPath.match(/\.(mp3|ogg|wav)$/i);
            const basePath = urlPath.slice(1); // strip leading /
            const tryExts = hasExt ? [''] : ['.mp3', '.ogg', '.wav'];
            const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };
            for (const ext of tryExts) {
              const filePath = path.resolve(__dirname, '../assets', basePath + ext);
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath);
                const resolvedExt = ext ? ext.slice(1) : hasExt[0].slice(1);
                res.setHeader('Content-Type', MIME[resolvedExt] || 'application/octet-stream');
                res.setHeader('Content-Disposition', 'inline');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('Content-Length', data.length);
                res.statusCode = 200;
                res.end(data);
                console.log(`[audio] ✅ ${urlPath} → ${filePath}`);
                return;
              }
            }
            // Not found — don't block, let Vite handle it
            console.log(`[audio] ❌ ${urlPath} — no file found`);
            next();
            return;
          }

          // Intercept all static image paths (pokemon, items)
          if (urlPath.match(/\.png$/i) && (
            urlPath.startsWith('/pokemon/followers/') ||
            urlPath.startsWith('/pokemon/Front/') ||
            urlPath.startsWith('/pokemon/Back/') ||
            urlPath.startsWith('/pokemon/Icons/') ||
            urlPath.startsWith('/items/')
          )) {
            const filePath = path.resolve(__dirname, '../assets', urlPath.slice(1));
            if (fs.existsSync(filePath)) {
              const data = fs.readFileSync(filePath);
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Content-Length', data.length);
              res.statusCode = 200;
              res.end(data);
              return;
            }
            // File not found — return clean 404, not SPA html
            res.statusCode = 404;
            res.end(`Not found: ${urlPath}`);
            return;
          }

          next();
        });
      }
    },
    {
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
              const { mapKey, data, npcs, spawns } = JSON.parse(body);
              const mapPath = path.resolve(__dirname, '..', 'assets', 'maps', `${mapKey}.json`);
              fs.writeFileSync(mapPath, JSON.stringify(data, null, 2));

              // Save spawns → assets/spawns/<mapKey>.json
              if (spawns !== undefined) {
                const spawnsDir = path.resolve(__dirname, '..', 'assets', 'spawns');
                if (!fs.existsSync(spawnsDir)) fs.mkdirSync(spawnsDir, { recursive: true });
                const spawnsPath = path.join(spawnsDir, `${mapKey}.json`);
                fs.writeFileSync(spawnsPath, JSON.stringify(spawns, null, 2) + '\n');
                console.log(`[Editor] Saved ${spawns.length} spawn tile(s) to spawns/${mapKey}.json`);
              }

              // Save NPCs: one file per NPC in assets/npcs/<mapKey>/
              if (npcs !== undefined) {
                const npcDir = path.resolve(__dirname, '..', 'assets', 'npcs', mapKey);
                if (!fs.existsSync(npcDir)) fs.mkdirSync(npcDir, { recursive: true });

                const writtenFiles = new Set();
                const usedNames = new Map();

                npcs.forEach((npc, i) => {
                  let filename = npc._filename || npcFilename(npc, i);
                  const count = (usedNames.get(filename) || 0) + 1;
                  usedNames.set(filename, count);
                  if (count > 1) filename = `${filename}_${count}`;

                  const npcData = { ...npc };
                  delete npcData._filename;

                  const filePath = path.join(npcDir, `${filename}.json`);
                  fs.writeFileSync(filePath, JSON.stringify(npcData, null, 2) + '\n');
                  writtenFiles.add(`${filename}.json`);
                });

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
      }
    }
  ]
});
