/* Nexstay CRM — synchronisation multi-postes via un Gist GitHub privé.
   Le jeton reste sur ce poste (localStorage) et n'est jamais inclus dans les exports. */
'use strict';

const Sync = {
  KEY: 'nexstay_crm_sync',
  FILE: 'nexstay_crm.json',
  busy: false,

  cfg() {
    try { return Object.assign({ token: '', gistId: '', auto: false, lastSync: '' }, JSON.parse(localStorage.getItem(this.KEY) || '{}')); }
    catch (e) { return { token: '', gistId: '', auto: false, lastSync: '' }; }
  },
  setCfg(patch) { localStorage.setItem(this.KEY, JSON.stringify(Object.assign(this.cfg(), patch))); },
  get enabled() { const c = this.cfg(); return !!(c.token && c.gistId); },

  async api(path, opts = {}) {
    const c = this.cfg();
    const res = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) {
      const msg = res.status === 401 ? 'Jeton GitHub invalide ou expiré' : res.status === 404 ? 'Gist introuvable' : 'Erreur GitHub ' + res.status;
      throw new Error(msg);
    }
    return res.json();
  },

  async push() {
    const c = this.cfg();
    if (!c.token) throw new Error('Aucun jeton GitHub configuré');
    const files = { [this.FILE]: { content: JSON.stringify(Store.exportJSON()) } };
    let gist;
    if (c.gistId) gist = await this.api('/gists/' + c.gistId, { method: 'PATCH', body: JSON.stringify({ files }) });
    else gist = await this.api('/gists', { method: 'POST', body: JSON.stringify({ description: 'Nexstay CRM — données synchronisées', public: false, files }) });
    this.setCfg({ gistId: gist.id, lastSync: new Date().toISOString() });
    return gist;
  },

  async remote() {
    const c = this.cfg();
    const gist = await this.api('/gists/' + c.gistId);
    const f = gist.files[this.FILE];
    if (!f) throw new Error('Le Gist ne contient pas ' + this.FILE);
    const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    return JSON.parse(text);
  },

  async pull() {
    const data = await this.remote();
    Store.importJSON(data);
    this.setCfg({ lastSync: new Date().toISOString() });
    return data;
  },

  /* Au démarrage : récupère la version distante si elle est plus récente que la version locale */
  async startup() {
    if (!this.enabled || !this.cfg().auto) return;
    try {
      const data = await this.remote();
      if (data.updatedAt && data.updatedAt > (Store.data.updatedAt || '')) {
        Store.importJSON(data);
        this.setCfg({ lastSync: new Date().toISOString() });
        UI.toast('Données mises à jour depuis le cloud');
        App.afterDataReplace();
      }
    } catch (e) { UI.toast('Synchronisation : ' + e.message, 'warn'); }
  },

  /* Envoi automatique quelques secondes après chaque modification */
  watch() {
    const later = U.debounce(async () => {
      if (!this.enabled || !this.cfg().auto || this.busy) return;
      this.busy = true;
      try { await this.push(); } catch (e) { UI.toast('Synchronisation : ' + e.message, 'warn'); }
      this.busy = false;
    }, 4000);
    Store.onChange(later);
  },
};
