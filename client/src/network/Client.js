import { WS_PORT, MSG } from '@pokemon-mmo/shared';

export class Client {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.playerId = null;
    this.token = null;       // JWT token for authenticated sessions
  }

  /**
   * Connect to the game server.
   * @param {string} name - Display name
   * @param {string} [token] - JWT token (omit for unauthenticated/legacy)
   */
  connect(name = 'Trainer', token = null) {
    this.token = token;
    const host = window.location.hostname || 'localhost';
    const url = `ws://${host}:${WS_PORT}`;

    console.log(`[Network] Connecting to ${url}...`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[Network] Connected');
      this.connected = true;
      const joinMsg = { type: MSG.JOIN, name };
      if (this.token) joinMsg.token = this.token;
      this.send(joinMsg);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.dispatch(msg);
      } catch (err) {
        console.error('[Network] Bad message:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('[Network] Disconnected');
      this.connected = false;
    };

    this.ws.onerror = (err) => {
      console.error('[Network] Error:', err);
    };
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(handler);
  }

  dispatch(msg) {
    const handlers = this.handlers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
