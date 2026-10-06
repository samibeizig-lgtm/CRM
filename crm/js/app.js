/* Nexstay CRM — démarrage, connexion, navigation */
'use strict';

const App = {
  route: 'dashboard',

  init() {
    Store.load();
    this.applyTheme();
    if (localStorage.getItem('nexstay_crm_sidebar') === 'collapsed') $('#app').classList.add('collapsed');
    UI.enhancePasswords();
    this.bind();
    Sync.watch();
    if (Auth.restore()) this.start(); else this.showLogin();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non disponible */ });
    }
  },

  showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-form').reset();
    setTimeout(() => $('#login-form').login.focus(), 30);
  },

  async start() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    this.buildNav();
    this.route = this.parseRoute();
    if (Auth.user.mustChange) this.route = 'compte';
    this.render();
    await Sync.startup();
  },

  parseRoute() {
    const r = location.hash.replace('#', '');
    return VIEWS[r] ? r : 'dashboard';
  },

  go(route) {
    if (location.hash === '#' + route) this.render();
    else location.hash = route;
  },

  buildNav() {
    $('#nav').innerHTML = Object.entries(VIEWS)
      .filter(([, v]) => !v.admin || Auth.isAdmin)
      .map(([k, v]) => `<a class="nav-item" href="#${k}" data-route="${k}" title="${v.title}">${icon(v.icon)}<span>${v.title}</span></a>`).join('');
    $('#whoami').textContent = `Connecté : ${Auth.user.login}${Auth.isAdmin ? ' (admin)' : ''}`;
  },

  render() {
    if (!Auth.user) return;
    let view = VIEWS[this.route];
    if (!view || (view.admin && !Auth.isAdmin)) { this.route = 'dashboard'; view = VIEWS.dashboard; }
    $$('#nav .nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === this.route));
    $('#page-title').textContent = view.title;
    document.title = view.title + ' · Nexstay CRM';
    const actions = $('#page-actions');
    actions.innerHTML = view.actions || '';
    $$('[data-act]', actions).forEach(b => b.onclick = () => view.onAction(b.dataset.act));
    const el = $('#view');
    try {
      view.render(el);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="alert err">${icon('alert')}<div>Erreur d'affichage : ${U.esc(e.message)}</div></div>`;
    }
    UI.enhancePasswords(el);
    $('#app').classList.remove('mobile-open');
  },

  /* Après un import, une restauration ou une récupération cloud */
  afterDataReplace() {
    this.applyTheme();
    const login = Auth.user && Auth.user.login;
    const same = login && Store.data.users.find(u => u.login.toLowerCase() === login.toLowerCase());
    if (!Auth.restore() && same) { Auth.user = same; localStorage.setItem(Auth.KEY, same.id); }
    if (!Auth.user) { UI.toast('Votre compte n\'existe pas dans les données importées : reconnectez-vous.', 'warn'); this.showLogin(); return; }
    this.buildNav();
    this.render();
  },

  applyTheme() {
    const t = localStorage.getItem('nexstay_crm_theme') || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    $('#theme-btn').innerHTML = `${icon(dark ? 'sun' : 'moon')}<span>${dark ? 'Thème clair' : 'Thème sombre'}</span>`;
  },

  bind() {
    $('#login-form').onsubmit = e => {
      e.preventDefault();
      const f = e.target;
      if (Auth.login(f.login.value, f.password.value)) {
        $('#login-error').hidden = true;
        this.start();
        UI.toast('Bienvenue ' + Auth.user.login);
      } else {
        $('#login-error').textContent = 'Identifiant ou mot de passe incorrect.';
        $('#login-error').hidden = false;
        f.password.select();
      }
    };
    $('#logout-btn').onclick = () => { Auth.logout(); $('#modal-root').innerHTML = ''; this.showLogin(); };
    $('#collapse-btn').onclick = () => {
      const c = $('#app').classList.toggle('collapsed');
      localStorage.setItem('nexstay_crm_sidebar', c ? 'collapsed' : '');
    };
    $('#menu-btn').onclick = () => $('#app').classList.toggle('mobile-open');
    $('#view').addEventListener('click', () => $('#app').classList.remove('mobile-open'));
    $('#theme-btn').onclick = () => {
      const dark = document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      localStorage.setItem('nexstay_crm_theme', dark ? 'light' : 'dark');
      this.applyTheme();
    };
    $('#search-btn').onclick = () => Auth.user && Search.open();
    window.addEventListener('hashchange', () => {
      if (!Auth.user) return;
      if (Auth.user.mustChange && this.parseRoute() !== 'compte') UI.toast('Changez d\'abord votre mot de passe', 'warn');
      this.route = this.parseRoute();
      $('#modal-root').innerHTML = '';
      this.render();
      window.scrollTo(0, 0);
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && Auth.user) { e.preventDefault(); Search.open(); }
    });
    // Données modifiées dans un autre onglet
    window.addEventListener('storage', e => {
      if (e.key !== DB_KEY || !e.newValue) return;
      Store.data = Store.normalize(JSON.parse(e.newValue));
      if (Auth.user) { Auth.user = Store.get('users', Auth.user.id) || null; Auth.user ? this.render() : this.showLogin(); }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
