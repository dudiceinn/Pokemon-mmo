const STORAGE_KEY = 'pokemon-mmo-flags';

export class FlagManager {
  constructor() {
    this.flags = {};
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.flags = JSON.parse(raw);
    } catch {
      this.flags = {};
    }
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.flags));
  }

  getFlag(name) {
    return !!this.flags[name];
  }

  hasFlag(name) {
    return this.getFlag(name);
  }

  setFlag(name) {
    this.flags[name] = true;
    this._save();
  }

  clearFlag(name) {
    delete this.flags[name];
    this._save();
  }

  clearAll() {
    this.flags = {};
    localStorage.removeItem(STORAGE_KEY);
  }
}
