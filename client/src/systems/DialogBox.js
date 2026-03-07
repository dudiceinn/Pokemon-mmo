export class DialogBox {
  constructor() {
    this.el = document.getElementById('dialog-box');
    this.elName = document.getElementById('dialog-name');
    this.elText = document.getElementById('dialog-text');
    this.elPrompt = document.getElementById('dialog-prompt');

    this.lines = [];
    this.lineIndex = 0;
    this.onClose = null;
    this._keyHandler = null;
    this._open = false;
    this._playerName = 'Trainer';
  }

  setPlayerName(name) {
    this._playerName = name || 'Trainer';
  }

  isOpen() {
    return this._open;
  }

  open(name, lines, onClose) {
    this.lines = lines;
    this.lineIndex = 0;
    this.onClose = onClose || null;

    this.elName.textContent = name || '';
    this.elName.style.display = name ? 'block' : 'none';
    this.showCurrentLine();
    this._open = true;
    this.el.style.display = 'block';

    // Always remove any existing key listener before adding a new one.
    // Without this, rapid open() calls stack up multiple listeners and
    // every keypress fires advance() multiple times, causing onClose to
    // be called with a null callback (already consumed by the extra call).
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    // Key listener
    this._keyHandler = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.advance();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  showCurrentLine() {
    const raw = this.lines[this.lineIndex] || '';
    this.elText.textContent = raw.replace(/\{player\}/gi, this._playerName);
    const isLast = this.lineIndex >= this.lines.length - 1;
    this.elPrompt.textContent = isLast ? '[Space to close]' : '[Space ▼]';
  }

  advance() {
    this._playClick();
    this.lineIndex++;
    if (this.lineIndex >= this.lines.length) {
      this.close();
    } else {
      this.showCurrentLine();
    }
  }

  _playClick() {
    window.overworldScene?.playSfx?.('click');
  }

  close() {
    this._open = false;
    this.el.style.display = 'none';
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this.onClose) {
      const cb = this.onClose;
      this.onClose = null;
      cb();
    }
  }
}
