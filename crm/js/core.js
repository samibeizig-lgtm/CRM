/* Nexstay CRM — noyau : utilitaires, stockage, authentification, composants d'interface */
'use strict';

/* ───────────────────────── Utilitaires ───────────────────────── */
const U = {
  uid() {
    return Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 13);
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  num(v, def = 0) {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : def;
  },
  round2(n) { return Math.round(n * 100) / 100; },
  money(n) {
    const cur = (Store.data && Store.data.settings.devise) || 'DT';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0).replace(/[\u202f\u00a0]/g, ' ') + ' ' + cur;
  },
  pct(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('fr-FR') + ' %'; },

  /* Dates : chaînes ISO « AAAA-MM-JJ », calculs en jours UTC pour éviter les décalages d'heure d'été */
  dn(iso) {
    if (!iso) return NaN;
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 864e5);
  },
  iso(dn) { return new Date(dn * 864e5).toISOString().slice(0, 10); },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  addDays(iso, n) { return U.iso(U.dn(iso) + n); },
  fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },
  fmtDateLong(iso) {
    if (!iso) return '';
    return new Date(U.dn(iso) * 864e5).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  },
  monthStart(iso) { return iso.slice(0, 8) + '01'; },
  monthEnd(iso) {
    const [y, m] = iso.split('-').map(Number);
    return U.iso(Math.round(Date.UTC(y, m, 0) / 864e5));
  },
  addMonths(iso, n) {
    const [y, m] = iso.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 10);
  },
  monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  },
  MONTHS: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  DAYS: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],

  debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  },
  download(name, content, type = 'application/json') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  csv(rows) {
    const cell = v => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  },
  norm(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); },
  sortBy(arr, key) {
    return [...arr].sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'fr', { sensitivity: 'base', numeric: true }));
  },
  formData(form) {
    const o = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        if (el.dataset.multi !== undefined) { (o[el.name] = o[el.name] || []); if (el.checked) o[el.name].push(el.value); }
        else o[el.name] = el.checked;
      } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.multiple) o[el.name] = [...el.selectedOptions].map(x => x.value);
      else o[el.name] = el.value.trim();
    }
    return o;
  },
};

/* SHA-256 en JavaScript pur (fonctionne aussi en file://, où WebCrypto peut être absent) */
U.sha256 = (function () {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  return function (str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const words = new Uint32Array((((len + 9 + 63) >> 6) << 4));
    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    words[words.length - 1] = len * 8;
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < words.length; o += 16) {
      for (let t = 0; t < 64; t++) {
        if (t < 16) W[t] = words[o + t];
        else {
          const s0 = r(W[t - 15], 7) ^ r(W[t - 15], 18) ^ (W[t - 15] >>> 3);
          const s1 = r(W[t - 2], 17) ^ r(W[t - 2], 19) ^ (W[t - 2] >>> 10);
          W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
  };
})();

/* ───────────────────────── Données ───────────────────────── */
const COLLECTIONS = ['proprietaires', 'logements', 'locataires', 'paiements', 'equipements', 'modeles', 'users', 'charges'];
const STATUTS = ['confirmé', 'en cours', 'terminé', 'annulé'];
const SOURCES = ['Direct', 'Airbnb', 'Booking', 'Expedia', 'Tunrooms', 'Autre'];
const MODES_PAIEMENT = ['Espèces', 'Virement', 'Carte', 'Chèque', 'Plateforme'];
const DEFAULT_EQUIPEMENTS = ['WiFi', 'Climatisation', 'Chauffage', 'Lave-linge', 'Sèche-linge', 'Parking', 'Piscine', 'Jardin', 'Balcon', 'Ascenseur',
  'Micro-ondes', 'Bouilloire', 'Ustensiles de cuisine', 'Machine à café', 'Fer à repasser', 'Four', 'TV', 'Réfrigérateur', 'Sèche-cheveux'];
const NATIONALITES = ['Tunisienne', 'Algérienne', 'Marocaine', 'Libyenne', 'Égyptienne', 'Française', 'Italienne', 'Allemande', 'Espagnole', 'Belge',
  'Suisse', 'Britannique', 'Néerlandaise', 'Portugaise', 'Polonaise', 'Russe', 'Ukrainienne', 'Turque', 'Américaine', 'Canadienne', 'Saoudienne',
  'Émiratie', 'Qatarie', 'Koweïtienne', 'Libanaise', 'Jordanienne', 'Sénégalaise', 'Ivoirienne', 'Camerounaise', 'Malienne', 'Chinoise', 'Japonaise',
  'Coréenne', 'Indienne', 'Brésilienne', 'Suédoise', 'Norvégienne', 'Danoise', 'Autrichienne', 'Grecque', 'Roumaine', 'Tchèque', 'Hongroise',
  'Irlandaise', 'Australienne', 'Autre'];

const DEFAULT_ADMIN = { login: 'admin', password: 'admin@nexstay.tn' };
const DB_KEY = 'nexstay_crm_v2';
const SNAP_KEY = 'nexstay_crm_snapshots';

const DEFAULT_TEMPLATE = `<p style="text-align:center"><b>CONTRAT DE LOCATION SAISONNIÈRE — LOGEMENT MEUBLÉ</b></p><p><br></p>
<p>Entre les soussignés : <b>{{societe}}</b>, ci-après dénommée « la Société de Gestion », et :</p><p><br></p>
<p>Nom et prénom : <b>{{prenom}} {{nom}}</b></p>
<p>Pièce d'identité : {{identite}} — délivrée le {{dateEmissionIdentite}}</p>
<p>Nationalité : {{nationalite}}</p>
<p>Téléphone : {{telephone}}</p>
<p>Nombre d'occupants : {{personnes}}</p>
<p>ci-après dénommé(e) « le Locataire ».</p><p><br></p>
<p><b>1. Objet</b></p>
<p>Location de courte durée du logement meublé « {{logementNom}} », situé {{logementAdresse}}, {{logementCodePostal}} {{logementVille}}, comprenant {{logementChambres}} chambre(s), {{logementSDB}} salle(s) de bain et {{logementLits}} lit(s).</p>
<p>Équipements : {{logementEquipements}}.</p><p><br></p>
<p><b>2. Durée</b></p>
<p>Du {{dateArrivee}} au {{dateDepart}}, soit {{nbNuits}} nuit(s). Le logement doit être libéré avant 11h00 le jour du départ.</p><p><br></p>
<p><b>3. Prix</b></p>
<p>Le loyer total est fixé à <b>{{prixTotal}}</b>, charges (eau, électricité, internet) comprises.</p><p><br></p>
<p><b>4. Obligations du Locataire</b></p>
<p>Le Locataire s'engage à occuper paisiblement les lieux, à ne pas sous-louer et à restituer le logement en bon état.</p><p><br></p>
<p>Fait à Tunis, le {{dateDuJour}}, en deux exemplaires.</p><p><br></p>
<p>La Société de Gestion&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Le Locataire</p>`;

const Store = {
  data: null,
  listeners: [],

  empty() {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      proprietaires: [], logements: [], locataires: [], paiements: {}, charges: [],
      equipements: [...DEFAULT_EQUIPEMENTS],
      modeles: [{ id: U.uid(), nom: 'Contrat standard', html: DEFAULT_TEMPLATE }],
      users: [],
      settings: {
        societe: 'Nexstay', adresse: '', telephone: '', email: '', devise: 'DT',
        chargesSurReversement: true, theme: 'auto',
      },
    };
  },

  /* Normalise des données provenant du stockage local ou d'un fichier importé (y compris l'ancien format) */
  normalize(raw) {
    const d = Object.assign(this.empty(), raw || {});
    for (const k of ['proprietaires', 'logements', 'locataires', 'modeles', 'users', 'charges', 'equipements']) if (!Array.isArray(d[k])) d[k] = [];
    if (!d.paiements || typeof d.paiements !== 'object' || Array.isArray(d.paiements)) d.paiements = {};
    d.settings = Object.assign(this.empty().settings, raw && raw.settings);
    if (!d.modeles.length) d.modeles = this.empty().modeles;

    d.proprietaires.forEach(p => { p.id ||= U.uid(); p.commission = U.num(p.commission); });
    d.logements.forEach(l => {
      l.id ||= U.uid();
      for (const k of ['chambres', 'sdb', 'lits', 'capacite']) l[k] = U.num(l[k]);
      l.equipements = Array.isArray(l.equipements) ? l.equipements : [];
    });
    d.locataires.forEach(t => {
      t.id ||= U.uid();
      t.prix = U.num(t.prix);
      t.personnes = U.num(t.personnes, 1);
      if (!STATUTS.includes(t.statut)) t.statut = 'confirmé';
    });
    d.users.forEach(u => {
      u.id ||= U.uid();
      // Ancien format : mot de passe en clair → empreinte salée immédiatement
      if (!u.hash && typeof u.password === 'string') { u.salt = U.uid(); u.hash = U.sha256(u.salt + ':' + u.password); }
      delete u.password;
    });
    d.charges.forEach(c => {
      c.id ||= U.uid();
      c.montant = U.num(c.montant);
      c.type = c.type === 'mensuel' ? 'mensuel' : 'reservation';
      c.logementIds = Array.isArray(c.logementIds) ? c.logementIds : [];
    });
    for (const [id, p] of Object.entries(d.paiements)) {
      if (!Array.isArray(p.historique)) {
        const paye = U.num(p.paye);
        p.historique = paye > 0 ? [{ id: U.uid(), date: '', montant: paye, mode: '—', note: 'Montant repris' }] : [];
      }
      p.paye = U.round2(p.historique.reduce((s, h) => s + U.num(h.montant), 0));
      if (!d.locataires.some(t => t.id === id)) delete d.paiements[id];
    }
    d.version = 2;
    return d;
  },

  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw) raw = this.legacy();
    this.data = this.normalize(raw);
    if (!this.data.users.length) {
      const salt = U.uid();
      this.data.users.push({ id: U.uid(), login: DEFAULT_ADMIN.login, salt, hash: U.sha256(salt + ':' + DEFAULT_ADMIN.password), isAdmin: true, mustChange: true });
    }
    this.persist(false);
  },

  /* Reprise d'une ancienne installation qui stockait chaque collection sous sa propre clé */
  legacy() {
    const found = {};
    let any = false;
    for (const k of COLLECTIONS) {
      try {
        const v = JSON.parse(localStorage.getItem(k) || localStorage.getItem('nexstay_' + k) || 'null');
        if (v) { found[k] = v; any = true; }
      } catch (e) { /* clé illisible : ignorée */ }
    }
    return any ? found : null;
  },

  persist(touch = true) {
    if (touch) this.data.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.data));
    } catch (e) {
      UI.toast('Stockage local plein : exportez vos données.', 'error');
    }
  },

  save() {
    this.persist(true);
    this.snapshot();
    this.listeners.forEach(fn => fn());
  },

  onChange(fn) { this.listeners.push(fn); },

  /* Points de restauration automatiques : un par jour, 7 conservés */
  snapshot(force = false) {
    let snaps = [];
    try { snaps = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch (e) { snaps = []; }
    const day = U.today();
    if (!force && snaps.length && snaps[0].day === day) return;
    snaps.unshift({ day, at: new Date().toISOString(), data: this.data });
    snaps = snaps.slice(0, 7);
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); }
    catch (e) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps.slice(0, 2))); } catch (e2) { /* plein */ } }
  },
  snapshots() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch (e) { return []; }
  },

  exportJSON() {
    const out = {};
    for (const k of COLLECTIONS) out[k] = this.data[k];
    out.settings = this.data.settings;
    out.version = this.data.version;
    out.updatedAt = this.data.updatedAt;
    out.exportedAt = new Date().toISOString();
    return out;
  },

  importJSON(obj) {
    if (!obj || typeof obj !== 'object' || !COLLECTIONS.some(k => k in obj)) throw new Error('Fichier non reconnu');
    this.snapshot(true);
    const keepUsers = !Array.isArray(obj.users) || !obj.users.length;
    const users = this.data.users;
    this.data = this.normalize(obj);
    if (keepUsers) this.data.users = users;
    this.save();
  },

  /* Accès pratiques */
  get(coll, id) { return this.data[coll].find(x => x.id === id); },
  upsert(coll, obj) {
    const arr = this.data[coll];
    const i = arr.findIndex(x => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    this.save();
  },
  remove(coll, id) {
    this.data[coll] = this.data[coll].filter(x => x.id !== id);
    if (coll === 'locataires') delete this.data.paiements[id];
    this.save();
  },
  ownerOf(logement) { return logement && this.get('proprietaires', logement.proprietaireId); },
  ownerName(p) { return p ? [p.prenom, p.nom].filter(Boolean).join(' ') : '—'; },
  guestName(t) { return t ? [t.prenom, t.nom].filter(Boolean).join(' ') : '—'; },
};

/* ───────────────────────── Authentification ───────────────────────── */
const Auth = {
  KEY: 'nexstay_crm_session',
  user: null,

  hash(user, pw) { return U.sha256(user.salt + ':' + pw); },
  setPassword(user, pw) {
    user.salt = U.uid();
    user.hash = this.hash(user, pw);
    delete user.password;
  },
  check(user, pw) {
    return !!user.hash && this.hash(user, pw) === user.hash;
  },
  login(login, pw) {
    const u = Store.data.users.find(x => x.login.toLowerCase() === login.trim().toLowerCase());
    if (!u || !this.check(u, pw)) return false;
    this.user = u;
    localStorage.setItem(this.KEY, u.id);
    return true;
  },
  restore() {
    const id = localStorage.getItem(this.KEY);
    this.user = id ? Store.get('users', id) || null : null;
    return !!this.user;
  },
  logout() {
    localStorage.removeItem(this.KEY);
    this.user = null;
  },
  get isAdmin() { return !!(this.user && this.user.isAdmin); },
};

/* ───────────────────────── Interface ───────────────────────── */
const UI = {
  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },
  icon(name) { return `<svg><use href="#i-${name}"/></svg>`; },

  toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    UI.$('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  },

  /* Fenêtre modale générique. Renvoie { el, close }. */
  modal({ title = '', body = '', foot = '', size = '', onClose } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">
      ${title ? `<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Fermer">${UI.icon('x')}</button></div>` : ''}
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
    const close = () => {
      back.remove();
      document.removeEventListener('keydown', onKey);
      onClose && onClose();
    };
    const onKey = e => { if (e.key === 'Escape' && back === UI.$('#modal-root').lastElementChild) close(); };
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    back.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    UI.$('#modal-root').appendChild(back);
    UI.enhancePasswords(back);
    const first = back.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: back, close };
  },

  confirm(message, { ok = 'Supprimer', danger = true } = {}) {
    return new Promise(resolve => {
      let done = false;
      const m = UI.modal({
        title: 'Confirmation', size: 'small',
        body: `<p style="margin:0;line-height:1.5">${message}</p>`,
        foot: `<button class="btn" data-close>Annuler</button><button class="btn ${danger ? 'btn-primary' : 'btn-primary'}" data-ok>${ok}</button>`,
        onClose: () => { if (!done) resolve(false); },
      });
      m.el.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
    });
  },

  options(list, selected, { empty } = {}) {
    return (empty !== undefined ? `<option value="">${U.esc(empty)}</option>` : '') +
      list.map(o => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return `<option value="${U.esc(v)}"${String(v) === String(selected ?? '') ? ' selected' : ''}>${U.esc(l)}</option>`;
      }).join('');
  },

  statusBadge(s) {
    const cls = { 'confirmé': 'st-confirme', 'en cours': 'st-encours', 'terminé': 'st-termine', 'annulé': 'st-annule' }[s] || '';
    return `<span class="badge ${cls}">${U.esc(s)}</span>`;
  },

  ring(p) {
    const v = Math.max(0, Math.min(100, Math.round(p)));
    return `<span class="ring" style="--p:${v}" data-v="${v}%"></span>`;
  },

  /* Mots de passe : visibles le temps de la frappe, puis masqués ; bouton œil pour afficher */
  enhancePasswords(root = document) {
    root.querySelectorAll('input[data-reveal]:not([data-enh])').forEach(inp => {
      inp.dataset.enh = '1';
      const wrap = document.createElement('span');
      wrap.className = 'pw-wrap';
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.title = 'Afficher / masquer';
      btn.innerHTML = UI.icon('eye');
      wrap.appendChild(btn);
      let pinned = false, t;
      btn.onclick = () => { pinned = !pinned; inp.type = pinned ? 'text' : 'password'; };
      inp.addEventListener('input', () => {
        if (pinned) return;
        inp.type = 'text';
        clearTimeout(t);
        t = setTimeout(() => { if (!pinned) inp.type = 'password'; }, 900);
      });
      inp.addEventListener('blur', () => { if (!pinned) inp.type = 'password'; });
    });
  },

  /* Tri des tableaux par clic sur les en-têtes (th[data-sort]) */
  sortable(table) {
    table.querySelectorAll('th[data-sort]').forEach((th, _, all) => {
      th.addEventListener('click', () => {
        const idx = [...th.parentNode.children].indexOf(th);
        const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        all.forEach(x => { delete x.dataset.dir; x.textContent = x.textContent.replace(/ [▲▼]$/, ''); });
        th.dataset.dir = dir;
        th.textContent += dir === 'asc' ? ' ▲' : ' ▼';
        const tbody = table.tBodies[0];
        const rows = [...tbody.rows].filter(r => r.cells.length > 1);
        const val = r => r.cells[idx].dataset.v ?? r.cells[idx].textContent.trim();
        rows.sort((a, b) => {
          const x = val(a), y = val(b);
          const nx = parseFloat(x), ny = parseFloat(y);
          const c = (!isNaN(nx) && !isNaN(ny) && th.dataset.sort === 'num') ? nx - ny : String(x).localeCompare(String(y), 'fr', { numeric: true });
          return dir === 'asc' ? c : -c;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  },
};
