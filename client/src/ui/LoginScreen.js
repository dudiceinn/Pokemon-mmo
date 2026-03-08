/**
 * LoginScreen.js — HTML/CSS login & register overlay.
 * Shown before the game starts. Removed on successful auth.
 */

import { WS_PORT } from '@pokemon-mmo/shared';

export class LoginScreen {
  /**
   * @param {function} onSuccess - Called with { token, displayName, state }
   */
  constructor(onSuccess) {
    this.onSuccess = onSuccess;
    this.overlay = null;
    this._mode = 'login'; // 'login' | 'register'

    const host = window.location.hostname || 'localhost';
    this.apiUrl = `http://${host}:${WS_PORT}`;
  }

  show() {
    // Remove if already showing
    this.hide();

    this.overlay = document.createElement('div');
    this.overlay.id = 'login-screen';
    this.overlay.innerHTML = this._buildHTML();
    document.body.appendChild(this.overlay);

    // Wire up events
    this._el('tab-login').addEventListener('click', () => this._switchMode('login'));
    this._el('tab-register').addEventListener('click', () => this._switchMode('register'));
    this._el('auth-form').addEventListener('submit', (e) => this._onSubmit(e));

    this._switchMode('login');
  }

  hide() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  _el(id) { return this.overlay.querySelector(`#${id}`); }

  _switchMode(mode) {
    this._mode = mode;
    const isReg = mode === 'register';

    this._el('tab-login').classList.toggle('active', !isReg);
    this._el('tab-register').classList.toggle('active', isReg);
    this._el('display-name-group').style.display = isReg ? 'block' : 'none';
    this._el('auth-submit').textContent = isReg ? 'Create Account' : 'Log In';
    this._el('auth-error').textContent = '';
  }

  async _onSubmit(e) {
    e.preventDefault();

    const username = this._el('auth-username').value.trim();
    const password = this._el('auth-password').value;
    const displayName = this._el('auth-display-name')?.value.trim();

    const btn = this._el('auth-submit');
    btn.disabled = true;
    btn.textContent = 'Please wait...';
    this._el('auth-error').textContent = '';

    try {
      const endpoint = this._mode === 'register' ? '/api/register' : '/api/login';
      const body = { username, password };
      if (this._mode === 'register') body.displayName = displayName;

      const res = await fetch(this.apiUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Unknown error');
      }

      // Success — pass auth data up and remove overlay
      this.hide();
      this.onSuccess({
        token: data.token,
        displayName: data.displayName,
        state: data.state,
      });
    } catch (err) {
      this._el('auth-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = this._mode === 'register' ? 'Create Account' : 'Log In';
    }
  }

  _buildHTML() {
    return `
      <style>
        #login-screen {
          position: fixed; inset: 0; z-index: 200000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.95);
          font-family: 'Press Start 2P', monospace;
          image-rendering: pixelated;
        }

        .login-card {
          background: #1a1a2e;
          border: 4px solid #ffd700;
          border-radius: 16px;
          padding: 32px 36px;
          width: 340px;
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.2);
        }

        .login-title {
          text-align: center;
          color: #ffd700;
          font-size: 18px;
          margin-bottom: 24px;
          text-shadow: 2px 2px 0 #333;
          letter-spacing: 2px;
        }

        .login-tabs {
          display: flex; gap: 0;
          margin-bottom: 20px;
        }

        .login-tab {
          flex: 1;
          padding: 10px 0;
          text-align: center;
          font-family: inherit;
          font-size: 11px;
          color: #666;
          background: transparent;
          border: 2px solid #333;
          cursor: pointer;
          transition: all 0.15s;
          letter-spacing: 1px;
        }
        .login-tab:first-child { border-radius: 8px 0 0 8px; }
        .login-tab:last-child  { border-radius: 0 8px 8px 0; }
        .login-tab.active {
          color: #ffd700;
          border-color: #ffd700;
          background: rgba(255, 215, 0, 0.08);
        }

        .login-group {
          margin-bottom: 14px;
        }

        .login-label {
          display: block;
          color: #aaa;
          font-size: 10px;
          margin-bottom: 6px;
          letter-spacing: 1px;
        }

        .login-input {
          width: 100%;
          padding: 10px 12px;
          font-family: monospace;
          font-size: 14px;
          color: #fff;
          background: #0d0d1a;
          border: 2px solid #333;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .login-input:focus {
          border-color: #ffd700;
        }

        .login-submit {
          width: 100%;
          padding: 12px;
          margin-top: 8px;
          font-family: inherit;
          font-size: 12px;
          color: #1a1a2e;
          background: #ffd700;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          letter-spacing: 1px;
          transition: background 0.15s, transform 0.1s;
        }
        .login-submit:hover:not(:disabled) {
          background: #ffe44d;
          transform: translateY(-1px);
        }
        .login-submit:disabled {
          opacity: 0.5;
          cursor: wait;
        }

        .login-error {
          color: #ff4444;
          font-size: 10px;
          margin-top: 10px;
          text-align: center;
          min-height: 14px;
          line-height: 1.4;
        }
      </style>

      <div class="login-card">
        <div class="login-title">POKEMON MMO</div>

        <div class="login-tabs">
          <button class="login-tab" id="tab-login">LOG IN</button>
          <button class="login-tab" id="tab-register">REGISTER</button>
        </div>

        <form id="auth-form" autocomplete="off">
          <div class="login-group">
            <label class="login-label">USERNAME</label>
            <input class="login-input" id="auth-username" type="text"
                   minlength="3" maxlength="20" required autocomplete="username">
          </div>

          <div class="login-group">
            <label class="login-label">PASSWORD</label>
            <input class="login-input" id="auth-password" type="password"
                   minlength="8" required autocomplete="current-password">
          </div>

          <div class="login-group" id="display-name-group" style="display:none">
            <label class="login-label">DISPLAY NAME</label>
            <input class="login-input" id="auth-display-name" type="text"
                   maxlength="16" placeholder="Your in-game name" autocomplete="off">
          </div>

          <button class="login-submit" id="auth-submit" type="submit">Log In</button>
          <div class="login-error" id="auth-error"></div>
        </form>
      </div>
    `;
  }
}
