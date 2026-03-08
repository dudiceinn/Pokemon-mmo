/**
 * ChatSystem
 *
 * Global chat with whisper support, player count, and system announcements.
 * Press Enter to open input, Enter to send, Escape to close.
 * Whisper: /w PlayerName message
 */

import { MSG } from '@pokemon-mmo/shared';

const MAX_MESSAGES = 100;
const MAX_LENGTH = 120;

// Emoji palette for the picker
const EMOJI_LIST = [
  '😊', '😄', '😂', '😢', '😭', '😡', '😛', '😉', '😮', '😎',
  '😴', '🤔', '😅', '🥳', '🤣', '💀', '👀',
  '❤️', '🔥', '⭐', '🎉', '👍', '👎', '👋', '👏',
  '🔴', '⚔️', '🛡️', '🏃', '💪', '🎮', '🏆', '💎',
  '⚡', '🌊', '🍃', '❄️', '🐉', '👻', '🧪', '💤',
];

export class ChatSystem {
  constructor() {
    this._open = false;
    this._messages = [];
    this._client = null;
    this._playerName = 'Trainer';
    this._lastWhisperFrom = null;

    this._injectCSS();
    this._buildDOM();
    this._bindKeys();
  }

  /** Bind to network client and start receiving messages. */
  bind(client, playerName) {
    this._client = client;
    this._playerName = playerName;

    client.on(MSG.CHAT_MESSAGE, (msg) => {
      this._addChatMsg(msg.name, msg.text);
    });

    client.on(MSG.CHAT_WHISPER, (msg) => {
      if (msg.from) {
        // Incoming whisper
        this._lastWhisperFrom = msg.from;
        this._addWhisperMsg(msg.from, msg.text, 'from');
      } else if (msg.to) {
        // Outgoing whisper confirmation
        this._addWhisperMsg(msg.to, msg.text, 'to');
      }
    });

    client.on(MSG.SYSTEM_MSG, (msg) => {
      this._addSystemMsg(msg.text);
      // GM broadcasts get a big overworld banner
      if (msg.text.startsWith('[GM]')) {
        this._showOverworldBanner(msg.text.replace('[GM] ', ''));
      }
    });

    client.on(MSG.PLAYER_COUNT, (msg) => {
      this._updatePlayerCount(msg.count);
    });
  }

  /** Is the chat input focused? Used to block movement. */
  isOpen() {
    return this._open;
  }

  // ── Message rendering ────────────────────────────────────────────────────────

  _addChatMsg(name, text) {
    const el = document.createElement('div');
    el.className = 'chat-msg';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = name + ':';

    el.appendChild(nameSpan);
    el.appendChild(document.createTextNode(' ' + text));
    this._appendToLog(el);

    // Show emoji bubble above player sprite
    const emoji = this._extractEmoji(text);
    if (emoji) {
      this._showEmojiBubble(name, emoji);
    }
  }

  /** Extract the first emoji from text (if any). */
  _extractEmoji(text) {
    const match = text.match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    return match ? match[0] : null;
  }

  /** Find the player by name and show the emoji above them. */
  _showEmojiBubble(name, emoji) {
    const ow = window.overworldScene;
    if (!ow) return;

    // Local player
    if (name === this._playerName && ow.player) {
      ow.player.showEmoji(emoji);
      return;
    }

    // Remote players
    for (const [, remote] of ow.remotePlayers) {
      if (remote.name === name) {
        remote.showEmoji(emoji);
        return;
      }
    }
  }

  _addWhisperMsg(otherName, text, direction) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-whisper';

    const prefix = direction === 'from'
      ? `[${otherName} \u2192 you]`
      : `[you \u2192 ${otherName}]`;

    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'chat-whisper-name';
    prefixSpan.textContent = prefix;

    el.appendChild(prefixSpan);
    el.appendChild(document.createTextNode(' ' + text));
    this._appendToLog(el);
  }

  _addSystemMsg(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-system';
    el.textContent = text;
    this._appendToLog(el);
  }

  _appendToLog(el) {
    this._log.appendChild(el);

    while (this._log.children.length > MAX_MESSAGES) {
      this._log.removeChild(this._log.firstChild);
    }

    this._log.scrollTop = this._log.scrollHeight;
  }

  _updatePlayerCount(count) {
    window.__onlineCount = count;
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────

  _injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      #chat-container {
        position: fixed;
        bottom: 8px;
        left: 8px;
        z-index: 50;
        width: 340px;
        pointer-events: none;
        font-family: 'Segoe UI', Arial, sans-serif;
      }

      #chat-log {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 160px;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 6px 8px;
        background: rgba(0, 0, 0, 0.45);
        border-radius: 6px;
        pointer-events: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,215,0,0.3) transparent;
      }
      #chat-log::-webkit-scrollbar { width: 4px; }
      #chat-log::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.3); border-radius: 2px; }
      #chat-log::-webkit-scrollbar-track { background: transparent; }

      /* When chat is closed, shrink log and hide scrollbar */
      #chat-container:not(.active) #chat-log {
        max-height: 80px;
        overflow: hidden;
        background: transparent;
        pointer-events: none;
      }
      #chat-container:not(.active) .chat-msg {
        opacity: 0.7;
      }

      .chat-msg {
        color: #fff;
        font-size: 13px;
        text-shadow: 1px 1px 2px #000, -1px -1px 2px #000;
        padding: 1px 0;
        line-height: 1.3;
        word-wrap: break-word;
        flex-shrink: 0;
      }

      .chat-msg .chat-name {
        color: #ffd700;
        font-weight: bold;
        margin-right: 4px;
      }

      .chat-msg.chat-system {
        color: #aaa;
        font-style: italic;
        font-size: 12px;
      }

      .chat-msg.chat-whisper {
        color: #da70d6;
      }
      .chat-msg .chat-whisper-name {
        color: #da70d6;
        font-weight: bold;
        margin-right: 4px;
      }

      #chat-input-row {
        display: none;
        align-items: center;
        margin-top: 4px;
        pointer-events: auto;
      }
      #chat-input-row.open { display: flex; }

      #chat-input {
        flex: 1;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(255, 215, 0, 0.6);
        border-radius: 4px;
        color: #fff;
        font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif;
        padding: 5px 8px;
        outline: none;
      }
      #chat-input::placeholder { color: rgba(255, 255, 255, 0.4); }
      #chat-input:focus { border-color: #ffd700; }

      #chat-hint {
        position: fixed;
        bottom: 8px;
        left: 8px;
        color: rgba(255, 255, 255, 0.3);
        font-size: 11px;
        font-family: 'Segoe UI', Arial, sans-serif;
        pointer-events: none;
        z-index: 49;
        text-shadow: 1px 1px 2px #000;
      }

      #chat-emoji-btn {
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid rgba(255, 215, 0, 0.6);
        border-radius: 4px;
        color: #fff;
        font-size: 16px;
        padding: 3px 7px;
        margin-left: 4px;
        cursor: pointer;
        line-height: 1;
      }
      #chat-emoji-btn:hover { border-color: #ffd700; background: rgba(255,215,0,0.15); }

      #chat-emoji-picker {
        display: none;
        position: absolute;
        bottom: 36px;
        left: 0;
        width: 280px;
        background: rgba(0, 0, 0, 0.85);
        border: 2px solid rgba(255, 215, 0, 0.6);
        border-radius: 6px;
        padding: 6px;
        pointer-events: auto;
        flex-wrap: wrap;
        gap: 2px;
      }
      #chat-emoji-picker.open { display: flex; }

      .emoji-cell {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        cursor: pointer;
        border-radius: 4px;
        border: none;
        background: none;
        padding: 0;
      }
      .emoji-cell:hover { background: rgba(255, 215, 0, 0.25); }

      #gm-banner {
        position: fixed;
        top: 130px;
        left: 0;
        width: 100%;
        z-index: 200;
        display: flex;
        justify-content: center;
        pointer-events: none;
      }
      #gm-banner .gm-banner-inner {
        background: rgba(0, 0, 0, 0.75);
        border-bottom: 2px solid #ffd700;
        color: #ffd700;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 18px;
        font-weight: bold;
        text-align: center;
        padding: 12px 40px;
        text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
        letter-spacing: 0.5px;
        animation: gm-slide-in 0.3s ease-out;
      }
      @keyframes gm-slide-in {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes gm-fade-out {
        from { opacity: 1; }
        to { opacity: 0; transform: translateY(-20px); }
      }

      .emoji-bubble {
        position: fixed;
        font-size: 32px;
        pointer-events: none;
        z-index: 60;
        transform: translate(-50%, -100%);
        text-shadow: 1px 1px 3px rgba(0,0,0,0.5);
        filter: drop-shadow(0 0 2px rgba(0,0,0,0.4));
      }

    `;
    document.head.appendChild(style);
  }

  _buildDOM() {
    // Chat container
    this._container = document.createElement('div');
    this._container.id = 'chat-container';

    // Message log
    this._log = document.createElement('div');
    this._log.id = 'chat-log';
    this._container.appendChild(this._log);

    // Input row
    this._inputRow = document.createElement('div');
    this._inputRow.id = 'chat-input-row';

    this._input = document.createElement('input');
    this._input.id = 'chat-input';
    this._input.type = 'text';
    this._input.maxLength = MAX_LENGTH;
    this._input.placeholder = 'Chat... /w name, /loc, :emoji:';
    this._input.autocomplete = 'off';

    // Emoji button
    this._emojiBtn = document.createElement('button');
    this._emojiBtn.id = 'chat-emoji-btn';
    this._emojiBtn.textContent = '😊';
    this._emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._emojiPicker.classList.toggle('open');
    });

    // Emoji picker grid
    this._emojiPicker = document.createElement('div');
    this._emojiPicker.id = 'chat-emoji-picker';
    for (const emoji of EMOJI_LIST) {
      const btn = document.createElement('button');
      btn.className = 'emoji-cell';
      btn.textContent = emoji;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._input.value += emoji;
        this._emojiPicker.classList.remove('open');
        this._input.focus();
      });
      this._emojiPicker.appendChild(btn);
    }

    this._inputRow.appendChild(this._input);
    this._inputRow.appendChild(this._emojiBtn);
    this._inputRow.appendChild(this._emojiPicker);
    this._container.appendChild(this._inputRow);

    document.body.appendChild(this._container);

    // Hint text
    this._hint = document.createElement('div');
    this._hint.id = 'chat-hint';
    this._hint.textContent = 'Press Enter to chat';
    document.body.appendChild(this._hint);

    // GM banner container
    this._banner = document.createElement('div');
    this._banner.id = 'gm-banner';
    document.body.appendChild(this._banner);

    // Player count
    this._counter = null; // count displayed by UIScene HUD instead

    // Input events
    this._input.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (e.key === 'Enter') {
        e.preventDefault();
        this._sendMessage();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this._closeInput();
      }
      // /r shortcut — reply to last whisper
      if (e.key === 'r' && this._input.value === '/' && this._lastWhisperFrom) {
        e.preventDefault();
        this._input.value = `/w ${this._lastWhisperFrom} `;
      }
    });
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

      if (e.key === 'Enter' && !this._open) {
        e.preventDefault();
        this._openInput();
      }
    });
  }

  _openInput() {
    this._open = true;
    this._container.classList.add('active');
    this._inputRow.classList.add('open');
    this._hint.style.display = 'none';
    this._input.value = '';
    this._input.focus();
    this._log.scrollTop = this._log.scrollHeight;
  }

  _closeInput() {
    this._open = false;
    this._container.classList.remove('active');
    this._inputRow.classList.remove('open');
    this._emojiPicker.classList.remove('open');
    this._hint.style.display = '';
    this._input.blur();
  }

  _sendMessage() {
    let text = this._input.value.trim();
    if (!text) {
      this._closeInput();
      return;
    }

    // /loc — share current location
    if (text === '/loc') {
      const ow = window.overworldScene;
      if (ow?.player) {
        text = `📍 ${ow.currentMapKey} (${ow.player.tileX}, ${ow.player.tileY})`;
      } else {
        text = '📍 Location unknown';
      }
    }

    if (this._client?.connected) {
      this._client.send({ type: MSG.CHAT_SEND, text });
    }

    this._closeInput();
  }

  _showOverworldBanner(text) {
    const inner = document.createElement('div');
    inner.className = 'gm-banner-inner';
    inner.textContent = text;
    this._banner.appendChild(inner);

    // Fade out after 4 seconds, then remove
    setTimeout(() => {
      inner.style.animation = 'gm-fade-out 0.5s ease-in forwards';
      setTimeout(() => inner.remove(), 500);
    }, 4000);
  }

}
