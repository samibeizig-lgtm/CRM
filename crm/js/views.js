/* Nexstay CRM — écrans de l'application */
'use strict';

const { $, $$, icon } = UI;
const esc = U.esc;

/* État conservé entre deux affichages d'un même écran */
const S = {
  dash: { start: U.monthStart(U.today()), end: U.monthEnd(U.today()), logementId: '', proprietaireId: '' },
  loc: { q: '', statut: '', logementId: '', quand: 'tous' },
  cal: { month: U.monthStart(U.today()), mode: 'barres' },
  pay: { q: '', filtre: 'impayes' },
  charges: { month: U.monthStart(U.today()) },
  rapports: { months: [U.today().slice(0, 7)] },
};

function emptyRow(cols, msg) { return `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>`; }
function logOptions(sel, empty = 'Tous les logements') {
  return UI.options(U.sortBy(Store.data.logements, l => l.nom).map(l => [l.id, l.nom]), sel, { empty });
}
function ownerOptions(sel, empty = 'Tous les propriétaires') {
  return UI.options(U.sortBy(Store.data.proprietaires, p => p.nom).map(p => [p.id, Store.ownerName(p)]), sel, { empty });
}
function actionBtns(id, extra = '') {
  return `<td class="actions">${extra}<button class="icon-btn" data-edit="${id}" title="Modifier">${icon('edit')}</button><button class="icon-btn danger" data-del="${id}" title="Supprimer">${icon('trash')}</button></td>`;
}

/* ═════════════════════════ TABLEAU DE BORD ═════════════════════════ */
const Dashboard = {
  title: 'Tableau de bord', icon: 'dashboard',
  render(v) {
    const f = S.dash;
    const st = Calc.period({ start: f.start, end: f.end, logementIds: f.logementId ? [f.logementId] : null, proprietaireId: f.proprietaireId });
    const T = st.tot;
    const today = U.today(), td = U.dn(today);
    const conflicts = Calc.conflicts();
    const active = Store.data.locataires.filter(Calc.active);
    const unpaid = active.filter(t => Calc.balance(t) > 0.009 && U.dn(t.dateArrivee) <= td + 7);
    const unpaidSum = unpaid.reduce((s, t) => s + Calc.balance(t), 0);
    const moves = [];
    for (const t of active) {
      const a = U.dn(t.dateArrivee), d = U.dn(t.dateDepart);
      if (a >= td && a <= td + 7) moves.push({ t, kind: 'in', day: a });
      if (d >= td && d <= td + 7) moves.push({ t, kind: 'out', day: d });
    }
    moves.sort((x, y) => x.day - y.day || (x.kind === 'out' ? -1 : 1));
    const series = Calc.monthlySeries(12, { logementIds: f.logementId ? [f.logementId] : null, proprietaireId: f.proprietaireId });

    v.innerHTML = `
      <div class="card"><div class="toolbar">
        <label>Du<input type="date" id="d-start" value="${f.start}"></label>
        <label>Au<input type="date" id="d-end" value="${f.end}"></label>
        <label>Logement<select id="d-log">${logOptions(f.logementId)}</select></label>
        <label>Propriétaire<select id="d-own">${ownerOptions(f.proprietaireId)}</select></label>
        <div class="row">
          <button class="btn btn-sm" data-quick="month">Ce mois</button>
          <button class="btn btn-sm" data-quick="prev">Mois dernier</button>
          <button class="btn btn-sm" data-quick="year">Cette année</button>
        </div>
      </div></div>

      ${conflicts.size ? `<div class="alert err">${icon('alert')}<div><b>${conflicts.size} réservations se chevauchent.</b> Vérifiez le <a href="#calendrier">calendrier</a> : les séjours en conflit apparaissent en rouge.</div></div>` : ''}
      ${Auth.user.mustChange ? `<div class="alert">${icon('shield')}<div>Vous utilisez le mot de passe par défaut. <a href="#compte">Changez-le maintenant</a>.</div></div>` : ''}

      <div class="kpis">
        <div class="kpi"><div class="lbl">Réservations</div><div class="val">${T.resa}</div><div class="sub">${T.voyageurs} voyageur(s) · ${T.nights} nuit(s)</div></div>
        <div class="kpi accent"><div class="lbl">Chiffre d'affaires</div><div class="val">${U.money(T.ca)}</div><div class="sub">Prix moyen / nuit : ${U.money(T.adr)}</div></div>
        <div class="kpi"><div class="lbl">Commissions</div><div class="val">${U.money(T.commission)}</div><div class="sub">${T.ca ? U.pct(T.commission / T.ca * 100) + ' du CA' : '—'}</div></div>
        <div class="kpi"><div class="lbl">Taux d'occupation</div><div class="val">${U.pct(T.occupancy)}</div><div class="sub">RevPAR : ${U.money(T.revpar)}</div></div>
        <div class="kpi"><div class="lbl">Charges</div><div class="val">${U.money(T.charges)}</div><div class="sub">Reversement : ${U.money(T.reversement)}</div></div>
        <div class="kpi"><div class="lbl">À encaisser (J+7)</div><div class="val">${U.money(unpaidSum)}</div><div class="sub"><a href="#paiements">${unpaid.length} séjour(s) non soldé(s)</a></div></div>
      </div>

      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Chiffre d'affaires — 12 derniers mois</h2></div><div class="chart">${this.chart(series)}</div></div>
        <div class="card"><div class="card-head"><h2>Arrivées & départs — 7 prochains jours</h2></div>
          <div class="agenda">${moves.length ? moves.slice(0, 8).map(m => {
            const l = Store.get('logements', m.t.logementId);
            const when = m.day === td ? "Aujourd'hui" : m.day === td + 1 ? 'Demain' : U.fmtDate(U.iso(m.day));
            return `<div class="agenda-item" data-open="${m.t.id}"><span class="ico ${m.kind}">${icon(m.kind)}</span>
              <div><div><b>${esc(Store.guestName(m.t))}</b></div><div class="meta">${m.kind === 'in' ? 'Arrivée' : 'Départ'} · ${esc(l ? l.nom : '—')} · ${m.t.personnes} pers.</div></div>
              <div class="when">${when}${m.kind === 'in' && Calc.balance(m.t) > 0 ? `<br><span class="badge b-warn">Reste ${U.money(Calc.balance(m.t))}</span>` : ''}</div></div>`;
          }).join('') : '<p class="muted">Aucun mouvement prévu.</p>'}</div>
        </div>
      </div>

      <div class="card"><div class="card-head"><h2>Taux d'occupation par logement</h2><span class="muted">${st.days} jour(s)</span></div>
        <div class="table-wrap"><table id="t-occ"><thead><tr>
          <th data-sort>Logement</th><th data-sort>Propriétaire</th><th data-sort="num" class="right">Réservations</th><th data-sort="num" class="right">Nuits</th>
          <th data-sort="num" class="right">CA</th><th data-sort="num">Occupation</th></tr></thead><tbody>
          ${st.rows.length ? st.rows.map(r => `<tr>
            <td><b>${esc(r.logement.nom)}</b></td><td>${esc(Store.ownerName(r.owner))}</td>
            <td class="right">${r.resa}</td><td class="right">${r.nights}</td>
            <td class="right nowrap" data-v="${r.ca}">${U.money(r.ca)}</td>
            <td data-v="${r.occupancy}"><div class="progress-cell">${UI.ring(r.occupancy)}<div class="bar" style="flex:1"><i style="width:${Math.min(100, r.occupancy)}%"></i></div></div></td>
          </tr>`).join('') : emptyRow(6, 'Aucun logement. <a href="#logements">Ajoutez votre premier logement</a>.')}
        </tbody></table></div></div>

      <div class="card"><div class="card-head"><h2>Résumé financier par propriétaire</h2></div>
        <div class="table-wrap"><table id="t-own"><thead><tr>
          <th data-sort>Propriétaire</th><th data-sort="num" class="right">Commission</th><th data-sort="num" class="right">CA brut</th>
          <th data-sort="num" class="right">Commission</th><th data-sort="num" class="right">Charges</th><th data-sort="num" class="right">Reversement</th></tr></thead><tbody>
          ${st.owners.length ? st.owners.map(o => `<tr>
            <td><b>${o.owner ? esc(Store.ownerName(o.owner)) : '<span class="muted">Sans propriétaire</span>'}</b></td>
            <td class="right">${o.owner ? o.owner.commission + ' %' : '—'}</td>
            <td class="right nowrap" data-v="${o.ca}">${U.money(o.ca)}</td><td class="right nowrap" data-v="${o.commission}">${U.money(o.commission)}</td>
            <td class="right nowrap" data-v="${o.charges}">${U.money(o.charges)}</td><td class="right nowrap" data-v="${o.reversement}"><b>${U.money(o.reversement)}</b></td>
          </tr>`).join('') : emptyRow(6, 'Aucune donnée.')}
        </tbody>${st.owners.length ? `<tfoot><tr><td>Total</td><td></td><td class="right nowrap">${U.money(T.ca)}</td><td class="right nowrap">${U.money(T.commission)}</td><td class="right nowrap">${U.money(T.charges)}</td><td class="right nowrap">${U.money(T.reversement)}</td></tr></tfoot>` : ''}</table></div>
        <p class="hint">Reversement = CA − commission${Store.data.settings.chargesSurReversement ? ' − charges' : ''}. Le CA d'un séjour à cheval sur deux périodes est réparti au prorata des nuits.</p>
      </div>`;

    const upd = () => App.render();
    $('#d-start', v).onchange = e => { f.start = e.target.value || f.start; upd(); };
    $('#d-end', v).onchange = e => { f.end = e.target.value || f.end; upd(); };
    $('#d-log', v).onchange = e => { f.logementId = e.target.value; upd(); };
    $('#d-own', v).onchange = e => { f.proprietaireId = e.target.value; upd(); };
    $$('[data-quick]', v).forEach(b => b.onclick = () => {
      const t = U.today();
      if (b.dataset.quick === 'month') { f.start = U.monthStart(t); f.end = U.monthEnd(t); }
      if (b.dataset.quick === 'prev') { const p = U.addMonths(U.monthStart(t), -1); f.start = p; f.end = U.monthEnd(p); }
      if (b.dataset.quick === 'year') { f.start = t.slice(0, 4) + '-01-01'; f.end = t.slice(0, 4) + '-12-31'; }
      upd();
    });
    $$('[data-open]', v).forEach(el => el.onclick = () => Locataires.form(Store.get('locataires', el.dataset.open)));
    UI.sortable($('#t-occ', v)); UI.sortable($('#t-own', v));
  },

  chart(series) {
    const W = 600, H = 220, P = { l: 52, r: 8, t: 12, b: 26 };
    const max = Math.max(1, ...series.map(s => s.ca));
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const bw = (W - P.l - P.r) / series.length;
    const y = val => P.t + (H - P.t - P.b) * (1 - val / top);
    const cur = U.today().slice(0, 7);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const val = top * i / 4;
      g += `<line class="g" x1="${P.l}" x2="${W - P.r}" y1="${y(val)}" y2="${y(val)}"/><text x="${P.l - 6}" y="${y(val) + 3}" text-anchor="end">${new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(val)}</text>`;
    }
    const bars = series.map((s, i) => {
      const x = P.l + i * bw + bw * 0.18, w = bw * 0.64, h = y(0) - y(s.ca);
      const [yy, mm] = s.ym.split('-');
      return `<g><title>${U.monthLabel(s.ym)} : ${U.money(s.ca)} · occupation ${U.pct(s.occupancy)}</title>
        <rect class="b${s.ym === cur ? ' cur' : ''}" x="${x}" y="${y(s.ca)}" width="${w}" height="${Math.max(0, h)}" rx="3"/>
        <text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${U.MONTHS[+mm - 1].slice(0, 3)}${mm === '01' ? ' ' + yy.slice(2) : ''}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Chiffre d'affaires mensuel">${g}${bars}</svg>`;
  },
};

/* ═════════════════════════ LOCATAIRES ═════════════════════════ */
const Locataires = {
  title: 'Locataires', icon: 'users',
  actions: `<button class="btn" data-act="csv">${icon('download')}<span>CSV</span></button>
            <button class="btn" data-act="auto">Statuts auto</button>
            <button class="btn btn-primary" data-act="new">${icon('plus')}<span>Nouveau locataire</span></button>`,
  onAction(a) {
    if (a === 'new') this.form();
    if (a === 'csv') this.csv();
    if (a === 'auto') {
      let n = 0;
      for (const t of Store.data.locataires) { const s = Calc.autoStatus(t); if (s !== t.statut) { t.statut = s; n++; } }
      Store.save(); App.render();
      UI.toast(n ? `${n} statut(s) mis à jour d'après les dates` : 'Tous les statuts sont à jour');
    }
  },
  list() {
    const f = S.loc, td = U.dn(U.today()), q = U.norm(f.q);
    return Store.data.locataires.filter(t => {
      if (f.statut && t.statut !== f.statut) return false;
      if (f.logementId && t.logementId !== f.logementId) return false;
      if (f.quand === 'avenir' && U.dn(t.dateArrivee) <= td) return false;
      if (f.quand === 'encours' && !(U.dn(t.dateArrivee) <= td && U.dn(t.dateDepart) > td)) return false;
      if (f.quand === 'passes' && U.dn(t.dateDepart) > td) return false;
      if (q) {
        const l = Store.get('logements', t.logementId);
        if (!U.norm([t.prenom, t.nom, t.identite, t.telephone, t.email, t.nationalite, l && l.nom].join(' ')).includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.dateArrivee || '').localeCompare(a.dateArrivee || ''));
  },
  render(v) {
    const f = S.loc;
    v.innerHTML = `<div class="card">
      <div class="toolbar" style="margin-bottom:14px">
        <label class="grow">Recherche<input id="l-q" placeholder="Nom, pièce d'identité, téléphone, logement…" value="${esc(f.q)}"></label>
        <label>Période<select id="l-quand">${UI.options([['tous', 'Toutes'], ['avenir', 'À venir'], ['encours', 'En cours'], ['passes', 'Passés']], f.quand)}</select></label>
        <label>Statut<select id="l-statut">${UI.options(STATUTS, f.statut, { empty: 'Tous les statuts' })}</select></label>
        <label>Logement<select id="l-log">${logOptions(f.logementId)}</select></label>
      </div>
      <div class="table-wrap"><table id="t-loc"><thead><tr>
        <th data-sort>Locataire</th><th data-sort>Logement</th><th data-sort>Arrivée</th><th data-sort>Départ</th>
        <th data-sort="num" class="right">Nuits</th><th data-sort="num" class="right">Pers.</th><th data-sort="num" class="right">Prix</th>
        <th data-sort="num" class="right">Solde</th><th data-sort>Statut</th><th></th></tr></thead><tbody id="l-body"></tbody></table></div>
    </div>`;
    this.fill(v);
    $('#l-q', v).oninput = U.debounce(e => { f.q = e.target.value; this.fill(v); }, 150);
    $('#l-quand', v).onchange = e => { f.quand = e.target.value; this.fill(v); };
    $('#l-statut', v).onchange = e => { f.statut = e.target.value; this.fill(v); };
    $('#l-log', v).onchange = e => { f.logementId = e.target.value; this.fill(v); };
    UI.sortable($('#t-loc', v));
  },
  fill(v) {
    const list = this.list();
    const conflicts = Calc.conflicts();
    const body = $('#l-body', v);
    body.innerHTML = list.length ? list.map(t => {
      const l = Store.get('logements', t.logementId);
      const bal = Calc.balance(t);
      return `<tr>
        <td><b>${esc(Store.guestName(t))}</b>${conflicts.has(t.id) ? ` <span class="badge b-err plain" title="Chevauche une autre réservation">conflit</span>` : ''}<div class="muted" style="font-size:12px">${esc(t.nationalite || '')}${t.source && t.source !== 'Direct' ? ' · ' + esc(t.source) : ''}</div></td>
        <td>${esc(l ? l.nom : '—')}</td>
        <td data-v="${t.dateArrivee}" class="nowrap">${U.fmtDate(t.dateArrivee)}</td><td data-v="${t.dateDepart}" class="nowrap">${U.fmtDate(t.dateDepart)}</td>
        <td class="right">${Calc.nights(t)}</td><td class="right">${t.personnes}</td>
        <td class="right nowrap" data-v="${t.prix}">${U.money(t.prix)}</td>
        <td class="right nowrap" data-v="${bal}">${t.statut === 'annulé' ? '—' : bal > 0.009 ? `<span class="badge b-warn plain">${U.money(bal)}</span>` : '<span class="badge b-ok plain">Soldé</span>'}</td>
        <td>${UI.statusBadge(t.statut)}</td>
        ${actionBtns(t.id, `<button class="icon-btn" data-contract="${t.id}" title="Contrat">${icon('file')}</button>`)}
      </tr>`;
    }).join('') : emptyRow(10, Store.data.locataires.length ? 'Aucun résultat.' : 'Aucun locataire pour le moment.');
    $$('[data-edit]', body).forEach(b => b.onclick = () => this.form(Store.get('locataires', b.dataset.edit)));
    $$('[data-contract]', body).forEach(b => b.onclick = () => this.contract(Store.get('locataires', b.dataset.contract)));
    $$('[data-del]', body).forEach(b => b.onclick = async () => {
      const t = Store.get('locataires', b.dataset.del);
      if (await UI.confirm(`Supprimer <b>${esc(Store.guestName(t))}</b> et ses paiements ?`)) { Store.remove('locataires', t.id); App.render(); UI.toast('Locataire supprimé'); }
    });
  },

  form(t = null, preset = {}) {
    const isNew = !t;
    t = t ? { ...t } : {
      id: U.uid(), prenom: '', nom: '', identite: '', dateEmissionIdentite: '', nationalite: 'Tunisienne', telephone: '', email: '',
      logementId: '', dateArrivee: U.today(), dateDepart: U.addDays(U.today(), 1), personnes: 1, prix: 0, statut: 'confirmé',
      source: 'Direct', notes: '', modeleId: (Store.data.modeles[0] || {}).id || '', ...preset,
    };
    const m = UI.modal({
      title: isNew ? 'Nouveau locataire' : 'Modifier le locataire', size: 'wide',
      body: `<form id="f-loc" class="form-grid">
        <label>Prénom *<input name="prenom" value="${esc(t.prenom)}" required></label>
        <label>Nom *<input name="nom" value="${esc(t.nom)}" required></label>
        <label>N° pièce d'identité<input name="identite" value="${esc(t.identite)}" placeholder="CIN / Passeport"></label>
        <label>Date d'émission<input type="date" name="dateEmissionIdentite" value="${esc(t.dateEmissionIdentite)}"></label>
        <label>Nationalité<select name="nationalite">${UI.options(NATIONALITES.includes(t.nationalite) || !t.nationalite ? NATIONALITES : [t.nationalite, ...NATIONALITES], t.nationalite)}</select></label>
        <label>Téléphone<input name="telephone" type="tel" value="${esc(t.telephone || '')}" placeholder="+216 …"></label>
        <label>E-mail<input name="email" type="email" value="${esc(t.email || '')}"></label>
        <label>Source<select name="source">${UI.options(SOURCES, t.source || 'Direct')}</select></label>
        <label class="full">Logement *<select name="logementId" required>${logOptions(t.logementId, '— Choisir un logement —')}</select></label>
        <label>Arrivée *<input type="date" name="dateArrivee" value="${esc(t.dateArrivee)}" required></label>
        <label>Départ *<input type="date" name="dateDepart" value="${esc(t.dateDepart)}" required></label>
        <label>Personnes<input type="number" min="1" name="personnes" value="${esc(t.personnes)}"></label>
        <label>Prix total (${esc(Store.data.settings.devise)})<input type="number" min="0" step="0.01" name="prix" value="${esc(t.prix)}"></label>
        <label>Statut<select name="statut">${UI.options(STATUTS, t.statut)}</select></label>
        <label>Modèle de contrat<select name="modeleId">${UI.options(Store.data.modeles.map(x => [x.id, x.nom]), t.modeleId)}</select></label>
        <div class="full" id="f-info"></div>
        <label class="full">Notes<textarea name="notes">${esc(t.notes)}</textarea></label>
      </form>`,
      foot: `${isNew ? '' : `<button class="btn left" data-contract>${icon('file')}Contrat</button><button class="btn" data-pay>${icon('wallet')}Paiement</button>`}
        <button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const form = $('#f-loc', m.el);
    const info = () => {
      const d = { ...t, ...U.formData(form) };
      d.prix = U.num(d.prix); d.personnes = U.num(d.personnes, 1);
      const n = Calc.nights(d), l = Store.get('logements', d.logementId);
      const out = [];
      if (d.dateArrivee && d.dateDepart && n <= 0) out.push(`<div class="alert err">${icon('alert')}La date de départ doit être postérieure à l'arrivée.</div>`);
      const c = Calc.conflictsFor(d);
      if (c.length) out.push(`<div class="alert err">${icon('alert')}<div>Ce logement est déjà réservé sur ces dates : ${c.map(o => `<b>${esc(Store.guestName(o))}</b> (${U.fmtDate(o.dateArrivee)} – ${U.fmtDate(o.dateDepart)})`).join(', ')}.</div></div>`);
      if (l && l.capacite && d.personnes > l.capacite) out.push(`<div class="alert">${icon('alert')}Capacité du logement dépassée (${l.capacite} pers. max).</div>`);
      const sug = l ? Calc.suggestedNightly(l.id) : 0;
      out.push(`<p class="hint">${n > 0 ? `<b>${n} nuit(s)</b>${d.prix ? ` · ${U.money(d.prix / n)} / nuit` : ''}` : ''}${sug && n > 0 ? ` · Tarif habituel de ce logement : ${U.money(sug)} / nuit — <a href="#" data-sug="${U.round2(sug * n)}">appliquer ${U.money(sug * n)}</a>` : ''}</p>`);
      $('#f-info', m.el).innerHTML = out.join('');
      const a = $('[data-sug]', m.el);
      if (a) a.onclick = e => { e.preventDefault(); form.prix.value = a.dataset.sug; info(); };
    };
    form.addEventListener('input', info);
    form.addEventListener('change', e => {
      if (e.target.name === 'dateArrivee' && form.dateDepart.value <= form.dateArrivee.value) form.dateDepart.value = U.addDays(form.dateArrivee.value, 1);
      info();
    });
    info();
    const collect = () => {
      if (!form.reportValidity()) return null;
      const d = U.formData(form);
      const out = { ...t, ...d, prix: U.round2(U.num(d.prix)), personnes: Math.max(1, U.num(d.personnes, 1)) };
      if (Calc.nights(out) <= 0) { UI.toast('Dates invalides', 'error'); return null; }
      return out;
    };
    const save = async () => {
      const out = collect();
      if (!out) return null;
      if (Calc.conflictsFor(out).length && !(await UI.confirm('Ce logement est déjà réservé sur ces dates. Enregistrer quand même ?', { ok: 'Enregistrer' }))) return null;
      Store.upsert('locataires', out);
      m.close(); App.render();
      UI.toast(isNew ? 'Locataire ajouté' : 'Locataire mis à jour');
      return out;
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
    const bc = $('[data-contract]', m.el);
    if (bc) bc.onclick = async () => { const o = await save(); if (o) this.contract(o); };
    const bp = $('[data-pay]', m.el);
    if (bp) bp.onclick = async () => { const o = await save(); if (o) Paiements.add(o); };
  },

  /* previewHtml : contenu d'un modèle en cours d'édition, affiché sans être enregistré */
  contract(t, previewHtml = null) {
    const m = UI.modal({
      title: (previewHtml ? 'Aperçu — ' : 'Contrat — ') + esc(Store.guestName(t)), size: 'wide',
      body: `${previewHtml ? '' : `<div class="row"><label style="flex:1">Modèle<select id="c-tpl">${UI.options(Store.data.modeles.map(x => [x.id, x.nom]), t.modeleId)}</select></label></div>`}
             <div style="overflow:auto;background:var(--surface2);padding:16px;border-radius:10px"><div class="contract-page" id="c-page">${Docs.renderContract(t, previewHtml)}</div></div>`,
      foot: `<button class="btn" data-close>Fermer</button><button class="btn" data-print>Imprimer</button><button class="btn btn-primary" data-pdf>${icon('download')}Télécharger le PDF</button>`,
    });
    if (!previewHtml) $('#c-tpl', m.el).onchange = e => {
      t.modeleId = e.target.value;
      const stored = Store.get('locataires', t.id);
      if (stored) { stored.modeleId = t.modeleId; Store.save(); }
      $('#c-page', m.el).innerHTML = Docs.renderContract(t);
    };
    $('[data-pdf]', m.el).onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.lastChild.textContent = 'Génération…';
      try { await Docs.contractPDF(t, previewHtml); UI.toast('Contrat téléchargé'); } catch (err) { UI.toast(err.message, 'error'); }
      b.disabled = false; b.lastChild.textContent = 'Télécharger le PDF';
    };
    $('[data-print]', m.el).onclick = () => {
      const w = window.open('', '_blank');
      if (!w) return UI.toast('Autorisez les fenêtres pop-up pour imprimer', 'warn');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Contrat</title><style>body{font-family:Georgia,serif;font-size:13.5px;line-height:1.6;margin:40px}p{margin:0}</style></head><body>${$('#c-page', m.el).innerHTML}</body></html>`);
      w.document.close(); w.focus(); w.print();
    };
  },

  csv() {
    const rows = [['Prénom', 'Nom', 'Pièce', 'Émission', 'Nationalité', 'Téléphone', 'E-mail', 'Logement', 'Arrivée', 'Départ', 'Nuits', 'Personnes', 'Prix', 'Payé', 'Solde', 'Statut', 'Source', 'Notes']];
    for (const t of this.list()) {
      const l = Store.get('logements', t.logementId);
      rows.push([t.prenom, t.nom, t.identite, t.dateEmissionIdentite, t.nationalite, t.telephone, t.email, l ? l.nom : '', t.dateArrivee, t.dateDepart,
        Calc.nights(t), t.personnes, t.prix, Calc.paid(t), Calc.balance(t), t.statut, t.source, t.notes]);
    }
    U.download('locataires.csv', U.csv(rows), 'text/csv;charset=utf-8');
  },
};

/* ═════════════════════════ LOGEMENTS ═════════════════════════ */
const Logements = {
  title: 'Logements', icon: 'home',
  actions: `<button class="btn btn-primary" data-act="new">${icon('plus')}<span>Nouveau logement</span></button>`,
  onAction(a) { if (a === 'new') this.form(); },
  render(v) {
    const list = U.sortBy(Store.data.logements, l => l.nom);
    const st = Calc.period({ start: U.monthStart(U.today()), end: U.monthEnd(U.today()) });
    const occ = Object.fromEntries(st.rows.map(r => [r.logement.id, r.occupancy]));
    v.innerHTML = `<div class="card"><div class="table-wrap"><table id="t-lg"><thead><tr>
      <th data-sort>Nom</th><th data-sort>Adresse</th><th data-sort>Ville</th><th data-sort="num" class="right">Ch.</th><th data-sort="num" class="right">SDB</th>
      <th data-sort="num" class="right">Lits</th><th data-sort="num" class="right">Capacité</th><th data-sort>Propriétaire</th><th data-sort="num">Occupation du mois</th><th></th></tr></thead><tbody>
      ${list.length ? list.map(l => `<tr>
        <td><b>${esc(l.nom)}</b></td><td>${esc(l.adresse)}</td><td>${esc([l.codePostal, l.ville].filter(Boolean).join(' '))}</td>
        <td class="right">${l.chambres}</td><td class="right">${l.sdb}</td><td class="right">${l.lits}</td><td class="right">${l.capacite}</td>
        <td>${esc(Store.ownerName(Store.ownerOf(l)))}</td>
        <td data-v="${occ[l.id] || 0}"><div class="progress-cell"><div class="bar" style="width:90px"><i style="width:${Math.min(100, occ[l.id] || 0)}%"></i></div><span class="muted">${U.pct(occ[l.id] || 0)}</span></div></td>
        ${actionBtns(l.id, `<button class="icon-btn" data-ics="${l.id}" title="Exporter le calendrier iCal (.ics)">${icon('calendar')}</button>`)}
      </tr>`).join('') : emptyRow(10, 'Aucun logement pour le moment.')}
    </tbody></table></div></div>`;
    UI.sortable($('#t-lg', v));
    $$('[data-edit]', v).forEach(b => b.onclick = () => this.form(Store.get('logements', b.dataset.edit)));
    $$('[data-ics]', v).forEach(b => b.onclick = () => { Docs.ics(b.dataset.ics); UI.toast('Calendrier exporté'); });
    $$('[data-del]', v).forEach(b => b.onclick = async () => {
      const l = Store.get('logements', b.dataset.del);
      const n = Store.data.locataires.filter(t => t.logementId === l.id).length;
      if (await UI.confirm(`Supprimer <b>${esc(l.nom)}</b> ?${n ? `<br><br>${n} locataire(s) y sont rattaché(s) : ils seront conservés mais sans logement.` : ''}`)) {
        Store.data.charges.forEach(c => { c.logementIds = c.logementIds.filter(id => id !== l.id); });
        Store.remove('logements', l.id); App.render(); UI.toast('Logement supprimé');
      }
    });
  },
  form(l = null) {
    const isNew = !l;
    l = l ? { ...l } : { id: U.uid(), nom: '', adresse: '', ville: '', codePostal: '', chambres: 1, sdb: 1, lits: 1, capacite: 2, equipements: [], proprietaireId: '' };
    const equips = [...new Set([...Store.data.equipements, ...l.equipements])];
    const m = UI.modal({
      title: isNew ? 'Nouveau logement' : 'Modifier le logement', size: 'wide',
      body: `<form id="f-lg" class="form-grid">
        <label class="full">Nom *<input name="nom" value="${esc(l.nom)}" required></label>
        <label class="full">Adresse<input name="adresse" value="${esc(l.adresse)}"></label>
        <label>Ville<input name="ville" value="${esc(l.ville)}"></label>
        <label>Code postal<input name="codePostal" value="${esc(l.codePostal)}"></label>
        <label>Propriétaire<select name="proprietaireId">${ownerOptions(l.proprietaireId, '— Aucun —')}</select></label>
        <label>Chambres<input type="number" min="0" name="chambres" value="${l.chambres}"></label>
        <label>Salles de bain<input type="number" min="0" name="sdb" value="${l.sdb}"></label>
        <label>Lits<input type="number" min="0" name="lits" value="${l.lits}"></label>
        <label>Capacité (pers.)<input type="number" min="1" name="capacite" value="${l.capacite}"></label>
        <div class="full"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3>Équipements</h3>
          <span class="row"><a href="#" data-all>Tout cocher</a><a href="#" data-none>Tout décocher</a></span></div>
          <div class="equip-grid">${equips.map(e => `<label class="check"><input type="checkbox" data-multi name="equipements" value="${esc(e)}"${l.equipements.includes(e) ? ' checked' : ''}>${esc(e)}</label>`).join('')}</div>
          <p class="hint">La liste des équipements se gère dans <a href="#parametrage">Paramétrage</a>.</p></div>
      </form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const form = $('#f-lg', m.el);
    $('[data-all]', m.el).onclick = e => { e.preventDefault(); $$('[name=equipements]', form).forEach(c => c.checked = true); };
    $('[data-none]', m.el).onclick = e => { e.preventDefault(); $$('[name=equipements]', form).forEach(c => c.checked = false); };
    const save = () => {
      if (!form.reportValidity()) return;
      const d = U.formData(form);
      for (const k of ['chambres', 'sdb', 'lits', 'capacite']) d[k] = U.num(d[k]);
      Store.upsert('logements', { ...l, ...d });
      m.close(); App.render(); UI.toast(isNew ? 'Logement ajouté' : 'Logement mis à jour');
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
  },
};

/* ═════════════════════════ PROPRIÉTAIRES ═════════════════════════ */
const Proprietaires = {
  title: 'Propriétaires', icon: 'key',
  actions: `<button class="btn btn-primary" data-act="new">${icon('plus')}<span>Nouveau propriétaire</span></button>`,
  onAction(a) { if (a === 'new') this.form(); },
  render(v) {
    const list = U.sortBy(Store.data.proprietaires, p => p.nom + ' ' + p.prenom);
    const st = Calc.period({ start: U.monthStart(U.today()), end: U.monthEnd(U.today()) });
    const byOwner = new Map(st.owners.map(o => [o.owner ? o.owner.id : '', o]));
    v.innerHTML = `<div class="card"><div class="table-wrap"><table id="t-pr"><thead><tr>
      <th data-sort>Nom</th><th data-sort>Prénom</th><th data-sort="num" class="right">Commission</th><th data-sort>E-mail</th><th data-sort>Téléphone</th>
      <th data-sort="num" class="right">Logements</th><th data-sort="num" class="right">CA du mois</th><th data-sort="num" class="right">Reversement du mois</th><th></th></tr></thead><tbody>
      ${list.length ? list.map(p => {
        const o = byOwner.get(p.id) || { ca: 0, reversement: 0 };
        const n = Store.data.logements.filter(l => l.proprietaireId === p.id);
        return `<tr><td><b>${esc(p.nom)}</b></td><td>${esc(p.prenom)}</td><td class="right" data-v="${p.commission}">${p.commission} %</td>
          <td>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '—'}</td><td>${esc(p.telephone || '—')}</td>
          <td class="right" title="${esc(n.map(l => l.nom).join(', '))}">${n.length}</td>
          <td class="right nowrap" data-v="${o.ca}">${U.money(o.ca)}</td><td class="right nowrap" data-v="${o.reversement}">${U.money(o.reversement)}</td>
          ${actionBtns(p.id)}</tr>`;
      }).join('') : emptyRow(9, 'Aucun propriétaire pour le moment.')}
    </tbody></table></div></div>`;
    UI.sortable($('#t-pr', v));
    $$('[data-edit]', v).forEach(b => b.onclick = () => this.form(Store.get('proprietaires', b.dataset.edit)));
    $$('[data-del]', v).forEach(b => b.onclick = async () => {
      const p = Store.get('proprietaires', b.dataset.del);
      if (await UI.confirm(`Supprimer <b>${esc(Store.ownerName(p))}</b> ? Ses logements seront conservés sans propriétaire.`)) {
        Store.data.logements.forEach(l => { if (l.proprietaireId === p.id) l.proprietaireId = ''; });
        Store.remove('proprietaires', p.id); App.render(); UI.toast('Propriétaire supprimé');
      }
    });
  },
  form(p = null) {
    const isNew = !p;
    p = p ? { ...p } : { id: U.uid(), nom: '', prenom: '', commission: 20, email: '', telephone: '' };
    const logs = U.sortBy(Store.data.logements, l => l.nom);
    const m = UI.modal({
      title: isNew ? 'Nouveau propriétaire' : 'Modifier le propriétaire',
      body: `<form id="f-pr" class="form-grid">
        <label>Nom *<input name="nom" value="${esc(p.nom)}" required></label>
        <label>Prénom<input name="prenom" value="${esc(p.prenom)}"></label>
        <label>Commission (%)<input type="number" min="0" max="100" step="0.5" name="commission" value="${p.commission}"></label>
        <label>E-mail<input type="email" name="email" value="${esc(p.email)}"></label>
        <label>Téléphone<input type="tel" name="telephone" value="${esc(p.telephone || '')}"></label>
        ${logs.length ? `<div class="full"><h3 style="margin-bottom:8px">Logements associés</h3><div class="equip-grid">
          ${logs.map(l => `<label class="check"><input type="checkbox" data-multi name="logs" value="${l.id}"${l.proprietaireId === p.id ? ' checked' : ''}>${esc(l.nom)}</label>`).join('')}</div></div>` : ''}
      </form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const form = $('#f-pr', m.el);
    const save = () => {
      if (!form.reportValidity()) return;
      const { logs: sel = [], ...d } = U.formData(form);
      d.commission = U.num(d.commission);
      for (const l of Store.data.logements) {
        if (sel.includes(l.id)) l.proprietaireId = p.id;
        else if (l.proprietaireId === p.id) l.proprietaireId = '';
      }
      Store.upsert('proprietaires', { ...p, ...d });
      m.close(); App.render(); UI.toast(isNew ? 'Propriétaire ajouté' : 'Propriétaire mis à jour');
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
  },
};

/* ═════════════════════════ CALENDRIER ═════════════════════════ */
const Calendrier = {
  title: 'Calendrier', icon: 'calendar',
  render(v) {
    const f = S.cal;
    const ms = U.dn(f.month), me = U.dn(U.monthEnd(f.month));
    const days = [];
    for (let d = ms; d <= me; d++) days.push(d);
    const td = U.dn(U.today());
    const logs = U.sortBy(Store.data.logements, l => l.nom);
    const conflicts = Calc.conflicts();
    const resa = Store.data.locataires.filter(t => Calc.active(t) && Calc.nights(t));
    const label = U.monthLabel(f.month);

    const head = days.map(d => {
      const dt = new Date(d * 864e5), w = dt.getUTCDay();
      return `<th class="${w === 0 || w === 6 ? 'we' : ''}${d === td ? ' today' : ''}" data-day="${d}">${U.DAYS[w]}<span class="d">${dt.getUTCDate()}</span></th>`;
    }).join('');

    const rows = logs.map(l => {
      const mine = resa.filter(t => t.logementId === l.id);
      let occ = 0;
      const cells = days.map(d => {
        const dt = new Date(d * 864e5), we = dt.getUTCDay() % 6 === 0 ? 'we' : '';
        const t = mine.find(x => U.dn(x.dateArrivee) <= d && U.dn(x.dateDepart) > d);
        if (!t) return `<td class="free ${we}" data-new="${l.id}" data-day="${d}"></td>`;
        occ++;
        if (f.mode === 'points') return `<td class="occ ${we}" data-id="${t.id}" title="${esc(Store.guestName(t))}"><span class="dot"></span></td>`;
        const a = U.dn(t.dateArrivee), dep = U.dn(t.dateDepart);
        const first = d === a || d === ms;
        const cls = ['stay', 's-' + U.norm(t.statut).replace(/\s/g, ''), conflicts.has(t.id) ? 'conflict' : '',
          d !== a ? 'cont-l' : '', d !== dep - 1 ? 'cont-r' : ''].join(' ');
        const showName = first;
        const span = Math.min(dep - 1, me) - d + 1;
        return `<td class="occ ${we}" data-id="${t.id}" title="${esc(Store.guestName(t))} · ${U.fmtDate(t.dateArrivee)} → ${U.fmtDate(t.dateDepart)}">
          <span class="${cls}"${showName ? ` style="z-index:2;${span > 1 ? `overflow:visible` : ''}"` : ''}>${showName ? esc(span > 1 ? Store.guestName(t) : (t.prenom || t.nom || '').slice(0, 1)) : ''}</span></td>`;
      }).join('');
      return `<tr><td class="lg" title="${esc(l.nom)}">${esc(l.nom)}<div class="muted" style="font-size:11px;font-weight:400">${Math.round(occ / days.length * 100)} % occupé</div></td>${cells}</tr>`;
    }).join('');

    v.innerHTML = `<div class="row" style="justify-content:space-between">
        <div class="cal-nav">
          <button class="btn btn-sm" id="c-prev" aria-label="Mois précédent">${icon('chevron-left')}</button>
          <span class="month">${label}</span>
          <button class="btn btn-sm" id="c-next" aria-label="Mois suivant">${icon('chevron-right')}</button>
          <button class="btn btn-sm" id="c-today">Aujourd'hui</button>
        </div>
        <div class="row">
          <div class="cal-legend"><span><i style="background:var(--info)"></i>Confirmé</span><span><i style="background:var(--t)"></i>En cours</span><span><i style="background:var(--ok)"></i>Terminé</span><span><i style="background:var(--err)"></i>Conflit</span></div>
          <div class="cal-mode"><button data-mode="barres" class="${f.mode === 'barres' ? 'on' : ''}">Barres</button><button data-mode="points" class="${f.mode === 'points' ? 'on' : ''}">Points</button></div>
        </div>
      </div>
      <div class="cal-scroll" id="c-scroll">${logs.length ? `<table class="cal"><thead><tr><th class="lg">Logement</th>${head}</tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty">Aucun logement. <a href="#logements">Ajoutez un logement</a> pour afficher le calendrier.</div>'}</div>
      <p class="hint">Cliquez sur une case libre pour créer une réservation à cette date, ou sur un séjour pour le modifier.</p>`;

    const go = n => {
      const sc = $('#c-scroll', v);
      const top = sc ? sc.scrollTop : 0;
      f.month = U.addMonths(f.month, n);
      this.render(v);
      const sc2 = $('#c-scroll', v);
      if (sc2) { sc2.scrollTop = top; sc2.scrollLeft = 0; }
    };
    $('#c-prev', v).onclick = () => go(-1);
    $('#c-next', v).onclick = () => go(1);
    $('#c-today', v).onclick = () => { f.month = U.monthStart(U.today()); this.render(v); this.scrollToday(v); };
    $$('[data-mode]', v).forEach(b => b.onclick = () => { f.mode = b.dataset.mode; this.render(v); });
    $$('td[data-id]', v).forEach(c => c.onclick = () => Locataires.form(Store.get('locataires', c.dataset.id)));
    $$('td[data-new]', v).forEach(c => c.onclick = () => {
      const d = U.iso(+c.dataset.day);
      const sug = Calc.suggestedNightly(c.dataset.new);
      Locataires.form(null, { logementId: c.dataset.new, dateArrivee: d, dateDepart: U.addDays(d, 1), prix: U.round2(sug) });
    });
    this.scrollToday(v);
  },
  scrollToday(v) {
    const th = $('th.today', v), sc = $('#c-scroll', v);
    if (th && sc) sc.scrollLeft = Math.max(0, th.offsetLeft - 190 - 38 * 2);
  },
};

/* ═════════════════════════ PAIEMENTS ═════════════════════════ */
const Paiements = {
  title: 'Paiements', icon: 'wallet',
  render(v) {
    const f = S.pay, q = U.norm(f.q);
    const list = Store.data.locataires.filter(t => {
      if (!Calc.active(t)) return false;
      if (f.filtre === 'impayes' && Calc.balance(t) <= 0.009) return false;
      if (f.filtre === 'soldes' && Calc.balance(t) > 0.009) return false;
      if (q) { const l = Store.get('logements', t.logementId); if (!U.norm(Store.guestName(t) + ' ' + (l ? l.nom : '')).includes(q)) return false; }
      return true;
    }).sort((a, b) => (a.dateArrivee || '').localeCompare(b.dateArrivee || ''));
    const tot = list.reduce((a, t) => ({ prix: a.prix + t.prix, paye: a.paye + Calc.paid(t) }), { prix: 0, paye: 0 });
    v.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="lbl">Total des séjours</div><div class="val">${U.money(tot.prix)}</div><div class="sub">${list.length} séjour(s) affiché(s)</div></div>
        <div class="kpi"><div class="lbl">Encaissé</div><div class="val">${U.money(tot.paye)}</div><div class="sub">${tot.prix ? U.pct(tot.paye / tot.prix * 100) : '—'}</div></div>
        <div class="kpi accent"><div class="lbl">Reste dû</div><div class="val">${U.money(tot.prix - tot.paye)}</div></div>
      </div>
      <div class="card">
        <div class="toolbar" style="margin-bottom:14px">
          <label class="grow">Recherche<input id="p-q" value="${esc(f.q)}" placeholder="Locataire ou logement"></label>
          <label>Afficher<select id="p-f">${UI.options([['impayes', 'Non soldés'], ['soldes', 'Soldés'], ['tous', 'Tous']], f.filtre)}</select></label>
        </div>
        <div class="table-wrap"><table id="t-pay"><thead><tr>
          <th data-sort>Locataire</th><th data-sort>Logement</th><th data-sort>Séjour</th><th data-sort="num" class="right">Total</th>
          <th data-sort="num" class="right">Payé</th><th data-sort="num" class="right">Solde</th><th>Progression</th><th></th></tr></thead><tbody>
          ${list.length ? list.map(t => {
            const l = Store.get('logements', t.logementId), paid = Calc.paid(t), bal = Calc.balance(t);
            const p = t.prix ? Math.min(100, paid / t.prix * 100) : 100;
            return `<tr><td><b>${esc(Store.guestName(t))}</b></td><td>${esc(l ? l.nom : '—')}</td>
              <td class="nowrap" data-v="${t.dateArrivee}">${U.fmtDate(t.dateArrivee)} – ${U.fmtDate(t.dateDepart)}</td>
              <td class="right nowrap" data-v="${t.prix}">${U.money(t.prix)}</td><td class="right nowrap" data-v="${paid}">${U.money(paid)}</td>
              <td class="right nowrap" data-v="${bal}">${bal > 0.009 ? `<b>${U.money(bal)}</b>` : bal < -0.009 ? `<span class="badge b-err plain">Trop-perçu ${U.money(-bal)}</span>` : '<span class="badge b-ok plain">Soldé</span>'}</td>
              <td><div class="bar"><i style="width:${p}%"></i></div></td>
              <td class="actions">
                ${t.telephone && bal > 0.009 ? `<a class="icon-btn" title="Relance WhatsApp" target="_blank" rel="noopener" href="${this.whatsapp(t)}">${icon('message')}</a>` : ''}
                <button class="icon-btn" data-hist="${t.id}" title="Historique">${icon('receipt')}</button>
                <button class="icon-btn" data-receipt="${t.id}" title="Reçu PDF">${icon('download')}</button>
                <button class="btn btn-sm" data-add="${t.id}">${icon('plus')}Paiement</button></td></tr>`;
          }).join('') : emptyRow(8, f.filtre === 'impayes' ? 'Tous les séjours sont soldés.' : 'Aucun séjour.')}
        </tbody>${list.length ? `<tfoot><tr><td colspan="3">Total</td><td class="right nowrap">${U.money(tot.prix)}</td><td class="right nowrap">${U.money(tot.paye)}</td><td class="right nowrap">${U.money(tot.prix - tot.paye)}</td><td colspan="2"></td></tr></tfoot>` : ''}</table></div>
      </div>`;
    UI.sortable($('#t-pay', v));
    $('#p-q', v).oninput = U.debounce(e => { f.q = e.target.value; this.render(v); const i = $('#p-q', v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
    $('#p-f', v).onchange = e => { f.filtre = e.target.value; this.render(v); };
    $$('[data-add]', v).forEach(b => b.onclick = () => this.add(Store.get('locataires', b.dataset.add)));
    $$('[data-hist]', v).forEach(b => b.onclick = () => this.history(Store.get('locataires', b.dataset.hist)));
    $$('[data-receipt]', v).forEach(b => b.onclick = () => { try { Docs.receiptPDF(Store.get('locataires', b.dataset.receipt)); } catch (e) { UI.toast(e.message, 'error'); } });
  },
  whatsapp(t) {
    const phone = String(t.telephone).replace(/[^\d]/g, '');
    const msg = `Bonjour ${t.prenom || ''}, nous vous rappelons qu'il reste ${U.money(Calc.balance(t))} à régler pour votre séjour du ${U.fmtDate(t.dateArrivee)} au ${U.fmtDate(t.dateDepart)}. Merci ! — ${Store.data.settings.societe}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  },
  add(t) {
    const bal = Math.max(0, Calc.balance(t));
    const m = UI.modal({
      title: 'Enregistrer un paiement', size: 'small',
      body: `<p class="muted" style="margin:0">${esc(Store.guestName(t))} · total ${U.money(t.prix)} · reste ${U.money(bal)}</p>
        <form id="f-pay" class="form-grid">
          <label>Montant *<input type="number" step="0.01" name="montant" value="${U.round2(bal)}" required></label>
          <label>Date<input type="date" name="date" value="${U.today()}"></label>
          <label>Mode<select name="mode">${UI.options(MODES_PAIEMENT, 'Espèces')}</select></label>
          <label>Note<input name="note" placeholder="Acompte, solde…"></label>
        </form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const form = $('#f-pay', m.el);
    const save = () => {
      if (!form.reportValidity()) return;
      const d = U.formData(form);
      const montant = U.round2(U.num(d.montant));
      if (!montant) return UI.toast('Montant invalide', 'error');
      const p = Store.data.paiements[t.id] || (Store.data.paiements[t.id] = { paye: 0, historique: [] });
      p.historique.push({ id: U.uid(), date: d.date, montant, mode: d.mode, note: d.note });
      p.paye = U.round2(p.historique.reduce((s, h) => s + h.montant, 0));
      Store.save(); m.close(); App.render();
      UI.toast(`Paiement de ${U.money(montant)} enregistré`);
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
  },
  history(t) {
    const p = Store.data.paiements[t.id] || { historique: [] };
    const m = UI.modal({
      title: 'Historique — ' + esc(Store.guestName(t)),
      body: `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Mode</th><th>Note</th><th class="right">Montant</th><th></th></tr></thead><tbody>
        ${p.historique.length ? p.historique.map(h => `<tr><td>${U.fmtDate(h.date)}</td><td>${esc(h.mode)}</td><td>${esc(h.note)}</td>
          <td class="right nowrap">${U.money(h.montant)}</td><td class="actions"><button class="icon-btn danger" data-rm="${h.id}">${icon('trash')}</button></td></tr>`).join('') : emptyRow(5, 'Aucun paiement.')}
        </tbody><tfoot><tr><td colspan="3">Payé / total</td><td class="right nowrap">${U.money(Calc.paid(t))} / ${U.money(t.prix)}</td><td></td></tr></tfoot></table></div>`,
      foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" data-new>${icon('plus')}Ajouter</button>`,
    });
    $('[data-new]', m.el).onclick = () => { m.close(); this.add(t); };
    $$('[data-rm]', m.el).forEach(b => b.onclick = async () => {
      if (!(await UI.confirm('Supprimer ce paiement ?'))) return;
      p.historique = p.historique.filter(h => h.id !== b.dataset.rm);
      p.paye = U.round2(p.historique.reduce((s, h) => s + h.montant, 0));
      Store.save(); m.close(); App.render(); this.history(t);
    });
  },
};

/* ═════════════════════════ MODÈLES DE CONTRAT ═════════════════════════ */
const Modeles = {
  title: 'Modèles contrat', icon: 'file',
  actions: `<button class="btn btn-primary" data-act="new">${icon('plus')}<span>Nouveau modèle</span></button>`,
  onAction(a) { if (a === 'new') this.edit(); },
  render(v) {
    v.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Nom</th><th class="right">Locataires associés</th><th class="right">Variables utilisées</th><th></th></tr></thead><tbody>
      ${Store.data.modeles.map(m => `<tr><td><b>${esc(m.nom)}</b></td>
        <td class="right">${Store.data.locataires.filter(t => t.modeleId === m.id).length}</td>
        <td class="right">${new Set((m.html.match(/\{\{\s*\w+\s*\}\}/g) || [])).size}</td>
        ${actionBtns(m.id, `<button class="icon-btn" data-dup="${m.id}" title="Dupliquer">${icon('copy')}</button>`)}</tr>`).join('') || emptyRow(4, 'Aucun modèle.')}
    </tbody></table></div></div>`;
    $$('[data-edit]', v).forEach(b => b.onclick = () => this.edit(Store.get('modeles', b.dataset.edit)));
    $$('[data-dup]', v).forEach(b => b.onclick = () => {
      const src = Store.get('modeles', b.dataset.dup);
      Store.upsert('modeles', { id: U.uid(), nom: src.nom + ' (copie)', html: src.html }); App.render(); UI.toast('Modèle dupliqué');
    });
    $$('[data-del]', v).forEach(b => b.onclick = async () => {
      if (Store.data.modeles.length <= 1) return UI.toast('Il faut conserver au moins un modèle', 'warn');
      const mo = Store.get('modeles', b.dataset.del);
      if (await UI.confirm(`Supprimer le modèle <b>${esc(mo.nom)}</b> ?`)) { Store.remove('modeles', mo.id); App.render(); UI.toast('Modèle supprimé'); }
    });
  },
  edit(mo = null) {
    const isNew = !mo;
    mo = mo ? { ...mo } : { id: U.uid(), nom: 'Nouveau modèle', html: DEFAULT_TEMPLATE };
    const tools = [['bold', '<b>B</b>', 'Gras'], ['italic', '<i>I</i>', 'Italique'], ['underline', '<u>U</u>', 'Souligné'], '|',
      ['justifyLeft', '⇤', 'Aligner à gauche'], ['justifyCenter', '↔', 'Centrer'], ['justifyRight', '⇥', 'Aligner à droite'], ['justifyFull', '☰', 'Justifier'], '|',
      ['insertUnorderedList', '•', 'Liste'], ['fontSize', 'A+', 'Plus grand'], ['removeFormat', '⌫', 'Effacer la mise en forme']];
    const m = UI.modal({
      title: isNew ? 'Nouveau modèle de contrat' : 'Modifier le modèle', size: 'wide',
      body: `<label>Nom du modèle<input id="m-nom" value="${esc(mo.nom)}"></label>
        <div class="editor-layout">
          <div><div class="editor-tools">${tools.map(t => t === '|' ? '<span class="sep"></span>' : `<button type="button" data-cmd="${t[0]}" title="${t[2]}">${t[1]}</button>`).join('')}</div>
            <div class="editor" id="m-ed" contenteditable="true" spellcheck="true">${mo.html}</div></div>
          <div><h3 style="margin-bottom:8px">Variables</h3><p class="hint" style="margin:0 0 8px">Glissez-déposez une variable dans le texte, ou cliquez pour l'insérer au curseur.</p>
            <div class="vars">${CONTRACT_VARS.map(([k, l]) => `<div class="var-chip" draggable="true" data-var="${k}">{{${k}}}<small>${l}</small></div>`).join('')}</div></div>
        </div>`,
      foot: `<label class="left" style="flex-direction:row;align-items:center;gap:8px">Aperçu avec<select id="m-prev" style="width:auto">${UI.options(Store.data.locataires.map(t => [t.id, Store.guestName(t)]), '', { empty: '— locataire —' })}</select></label>
        <button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const ed = $('#m-ed', m.el);
    let range = null;
    const keep = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
    ed.addEventListener('keyup', keep); ed.addEventListener('mouseup', keep); ed.addEventListener('input', keep);
    $$('[data-cmd]', m.el).forEach(b => {
      b.onmousedown = e => e.preventDefault();
      b.onclick = () => {
        ed.focus();
        if (b.dataset.cmd === 'fontSize') document.execCommand('fontSize', false, '4');
        else document.execCommand(b.dataset.cmd, false, null);
      };
    });
    $$('.var-chip', m.el).forEach(c => {
      c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', `{{${c.dataset.var}}}`); e.dataTransfer.effectAllowed = 'copy'; });
      c.onmousedown = e => e.preventDefault();
      c.onclick = () => {
        ed.focus();
        if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
        document.execCommand('insertText', false, `{{${c.dataset.var}}}`);
        keep();
      };
    });
    $('#m-prev', m.el).onchange = e => {
      const t = Store.get('locataires', e.target.value);
      if (t) Locataires.contract(t, ed.innerHTML);
      e.target.value = '';
    };
    $('[data-save]', m.el).onclick = () => {
      mo.nom = $('#m-nom', m.el).value.trim() || 'Sans nom';
      mo.html = ed.innerHTML;
      Store.upsert('modeles', mo); m.close(); App.render(); UI.toast('Modèle enregistré');
    };
  },
};

/* ═════════════════════════ PARAMÉTRAGE ═════════════════════════ */
const Parametrage = {
  title: 'Paramétrage', icon: 'settings',
  render(v) {
    const D = Store.data, st = D.settings;
    const usage = e => D.logements.filter(l => l.equipements.includes(e)).length;
    v.innerHTML = `
      <div class="card"><div class="card-head"><h2>Équipements</h2><span class="muted">${D.equipements.length} équipement(s)</span></div>
        <form id="e-add" class="row" style="margin-bottom:16px"><input name="e" placeholder="Nouvel équipement (ex. Lave-vaisselle)" style="max-width:340px" required>
          <button class="btn btn-primary">${icon('plus')}Ajouter</button></form>
        <div class="equip-cols">${D.equipements.map((e, i) => `<div class="equip-row"><span>${esc(e)} <span class="muted" style="font-size:11px">· ${usage(e)}</span></span>
          <button class="icon-btn danger" data-rm="${i}" title="Supprimer">${icon('x')}</button></div>`).join('')}</div>
        <p class="hint">Le chiffre indique le nombre de logements équipés. Les équipements sont proposés dans la fiche logement.</p>
      </div>
      <div class="card"><div class="card-head"><h2>Société</h2></div>
        <form id="s-form" class="form-grid">
          <label>Nom de la société<input name="societe" value="${esc(st.societe)}"></label>
          <label>Téléphone<input name="telephone" value="${esc(st.telephone)}"></label>
          <label>E-mail<input name="email" value="${esc(st.email)}"></label>
          <label>Devise<input name="devise" value="${esc(st.devise)}" maxlength="5"></label>
          <label class="full">Adresse<input name="adresse" value="${esc(st.adresse)}"></label>
          <label class="check full"><input type="checkbox" name="chargesSurReversement"${st.chargesSurReversement ? ' checked' : ''}>Déduire les charges du reversement aux propriétaires</label>
          <div class="full"><button class="btn btn-primary">Enregistrer</button></div>
        </form>
      </div>`;
    $('#e-add', v).onsubmit = e => {
      e.preventDefault();
      const val = e.target.e.value.trim();
      if (D.equipements.some(x => U.norm(x) === U.norm(val))) return UI.toast('Cet équipement existe déjà', 'warn');
      D.equipements.push(val); Store.save(); App.render(); UI.toast('Équipement ajouté');
    };
    $$('[data-rm]', v).forEach(b => b.onclick = async () => {
      const e = D.equipements[+b.dataset.rm];
      const n = usage(e);
      if (!(await UI.confirm(`Supprimer « ${esc(e)} » ?${n ? ` Il sera retiré de ${n} logement(s).` : ''}`))) return;
      D.equipements.splice(+b.dataset.rm, 1);
      D.logements.forEach(l => { l.equipements = l.equipements.filter(x => x !== e); });
      Store.save(); App.render();
    });
    $('#s-form', v).onsubmit = e => {
      e.preventDefault();
      Object.assign(st, U.formData(e.target));
      st.devise ||= 'DT';
      Store.save(); App.render(); UI.toast('Paramètres enregistrés');
    };
  },
};

/* ═════════════════════════ CHARGES ═════════════════════════ */
const Charges = {
  title: 'Charges', icon: 'receipt',
  actions: `<button class="btn btn-primary" data-act="new">${icon('plus')}<span>Nouvelle charge</span></button>`,
  onAction(a) { if (a === 'new') this.form(); },
  render(v) {
    const D = Store.data, f = S.charges;
    const st = Calc.period({ start: f.month, end: U.monthEnd(f.month) });
    const lname = id => (Store.get('logements', id) || {}).nom;
    v.innerHTML = `
      <div class="card"><div class="card-head"><h2>Charges fixes</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Charge</th><th>Type</th><th class="right">Montant</th><th>Logements</th><th></th></tr></thead><tbody>
          ${D.charges.length ? U.sortBy(D.charges, c => c.nom).map(c => `<tr><td><b>${esc(c.nom)}</b></td>
            <td><span class="badge plain">${c.type === 'mensuel' ? 'Mensuel' : 'Par réservation'}</span></td>
            <td class="right nowrap">${U.money(c.montant)}</td>
            <td>${c.logementIds.length === D.logements.length && D.logements.length ? 'Tous les logements' : `<span title="${esc(c.logementIds.map(lname).filter(Boolean).join(', '))}">${c.logementIds.length} logement(s)</span>`}</td>
            ${actionBtns(c.id)}</tr>`).join('') : emptyRow(5, 'Aucune charge (ménage, produits d\'accueil, transport…).')}
        </tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Synthèse du mois</h2>
          <label style="flex-direction:row;align-items:center;gap:8px">Mois<input type="month" id="ch-m" value="${f.month.slice(0, 7)}" style="width:auto"></label></div>
        <div class="table-wrap"><table id="t-chs"><thead><tr><th data-sort>Logement</th><th data-sort="num" class="right">Réservations</th>
          <th data-sort="num" class="right">Total charges</th><th data-sort="num" class="right">Charge moy. / réservation</th><th data-sort="num" class="right">CA</th><th data-sort="num" class="right">Charges / CA</th></tr></thead><tbody>
          ${st.rows.length ? st.rows.map(r => `<tr><td><b>${esc(r.logement.nom)}</b></td><td class="right">${r.resa}</td>
            <td class="right nowrap" data-v="${r.charges}">${U.money(r.charges)}</td><td class="right nowrap" data-v="${r.chargePerResa}">${r.resa ? U.money(r.chargePerResa) : '—'}</td>
            <td class="right nowrap" data-v="${r.ca}">${U.money(r.ca)}</td><td class="right" data-v="${r.ca ? r.charges / r.ca : 0}">${r.ca ? U.pct(r.charges / r.ca * 100) : '—'}</td></tr>`).join('') : emptyRow(6, 'Aucun logement.')}
        </tbody>${st.rows.length ? `<tfoot><tr><td>Total</td><td class="right">${st.tot.resa}</td><td class="right nowrap">${U.money(st.tot.charges)}</td>
          <td class="right nowrap">${st.tot.resa ? U.money(st.tot.charges / st.tot.resa) : '—'}</td><td class="right nowrap">${U.money(st.tot.ca)}</td><td class="right">${st.tot.ca ? U.pct(st.tot.charges / st.tot.ca * 100) : '—'}</td></tr></tfoot>` : ''}</table></div>
        <p class="hint">Charges mensuelles : montant × mois. Charges par réservation : montant × nombre d'arrivées du mois.</p>
      </div>`;
    UI.sortable($('#t-chs', v));
    $('#ch-m', v).onchange = e => { if (e.target.value) { f.month = e.target.value + '-01'; App.render(); } };
    $$('[data-edit]', v).forEach(b => b.onclick = () => this.form(Store.get('charges', b.dataset.edit)));
    $$('[data-del]', v).forEach(b => b.onclick = async () => {
      const c = Store.get('charges', b.dataset.del);
      if (await UI.confirm(`Supprimer la charge <b>${esc(c.nom)}</b> ?`)) { Store.remove('charges', c.id); App.render(); UI.toast('Charge supprimée'); }
    });
  },
  form(c = null) {
    const isNew = !c;
    c = c ? { ...c } : { id: U.uid(), nom: '', type: 'reservation', montant: 0, logementIds: Store.data.logements.map(l => l.id) };
    const logs = U.sortBy(Store.data.logements, l => l.nom);
    const m = UI.modal({
      title: isNew ? 'Nouvelle charge' : 'Modifier la charge',
      body: `<form id="f-ch" class="form-grid">
        <label class="full">Nom *<input name="nom" value="${esc(c.nom)}" placeholder="Ménage, produits d'accueil, transport…" required></label>
        <label>Type<select name="type">${UI.options([['reservation', 'Par réservation'], ['mensuel', 'Mensuel']], c.type)}</select></label>
        <label>Montant (${esc(Store.data.settings.devise)})<input type="number" step="0.01" min="0" name="montant" value="${c.montant}"></label>
        <div class="full"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3>Logements concernés</h3>
          <span class="row"><a href="#" data-all>Tous</a><a href="#" data-none>Aucun</a></span></div>
          <div class="equip-grid">${logs.map(l => `<label class="check"><input type="checkbox" data-multi name="logementIds" value="${l.id}"${c.logementIds.includes(l.id) ? ' checked' : ''}>${esc(l.nom)}</label>`).join('') || '<p class="muted">Aucun logement.</p>'}</div></div>
      </form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const form = $('#f-ch', m.el);
    $('[data-all]', m.el).onclick = e => { e.preventDefault(); $$('[name=logementIds]', form).forEach(x => x.checked = true); };
    $('[data-none]', m.el).onclick = e => { e.preventDefault(); $$('[name=logementIds]', form).forEach(x => x.checked = false); };
    const save = () => {
      if (!form.reportValidity()) return;
      const d = U.formData(form);
      Store.upsert('charges', { ...c, ...d, montant: U.num(d.montant), logementIds: d.logementIds || [] });
      m.close(); App.render(); UI.toast(isNew ? 'Charge ajoutée' : 'Charge mise à jour');
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
  },
};

/* ═════════════════════════ RAPPORTS ═════════════════════════ */
const Rapports = {
  title: 'Rapports', icon: 'chart',
  availableMonths() {
    const today = U.today();
    let first = U.addMonths(U.monthStart(today), -11);
    for (const t of Store.data.locataires) if (t.dateArrivee && t.dateArrivee < first) first = U.monthStart(t.dateArrivee);
    const out = [];
    for (let m = first; m <= U.addMonths(U.monthStart(today), 3); m = U.addMonths(m, 1)) out.push(m.slice(0, 7));
    return out;
  },
  build(months) {
    const st = Calc.months(months);
    const sorted = [...months].sort();
    let title;
    if (sorted.length === 1) {
      const [y, m] = sorted[0].split('-');
      title = `Rapport du mois de ${U.MONTHS[+m - 1]} ${y} — Nexstay`;
    } else {
      title = `Rapport de ${U.monthLabel(sorted[0])} à ${U.monthLabel(sorted[sorted.length - 1])} — Nexstay`;
    }
    return { title, subtitle: `${sorted.length} mois : ${sorted.map(U.monthLabel).join(', ')}`, months: sorted, st, monthly: st.monthly };
  },
  render(v) {
    const f = S.rapports;
    const months = this.availableMonths();
    v.innerHTML = `<div class="card"><div class="card-head"><h2>Mois à inclure</h2>
        <div class="row"><button class="btn btn-sm" data-sel="cur">Mois en cours</button><button class="btn btn-sm" data-sel="q">3 derniers mois</button>
        <button class="btn btn-sm" data-sel="y">Année en cours</button><button class="btn btn-sm" data-sel="none">Aucun</button></div></div>
        <div class="month-pick">${months.map(m => `<label><input type="checkbox" value="${m}"${f.months.includes(m) ? ' checked' : ''}>${U.monthLabel(m)}</label>`).join('')}</div>
        <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="r-pdf">${icon('download')}Télécharger le PDF</button><button class="btn" id="r-csv">${icon('download')}CSV</button></div>
      </div><div id="r-out"></div>`;
    const pick = $('.month-pick', v);
    const last = pick.querySelector('input:checked');
    if (last) setTimeout(() => last.scrollIntoView({ block: 'nearest' }), 0);
    const sync = () => { f.months = $$('input:checked', pick).map(i => i.value); this.show(v); };
    pick.onchange = sync;
    $$('[data-sel]', v).forEach(b => b.onclick = () => {
      const cur = U.today().slice(0, 7);
      const k = b.dataset.sel;
      $$('input', pick).forEach(i => {
        i.checked = k === 'cur' ? i.value === cur : k === 'q' ? i.value <= cur && i.value >= U.addMonths(cur + '-01', -2).slice(0, 7)
          : k === 'y' ? i.value.slice(0, 4) === cur.slice(0, 4) && i.value <= cur : false;
      });
      sync();
    });
    $('#r-pdf', v).onclick = () => {
      if (!f.months.length) return UI.toast('Sélectionnez au moins un mois', 'warn');
      try { Docs.reportPDF(this.build(f.months)); UI.toast('Rapport téléchargé'); } catch (e) { UI.toast(e.message, 'error'); }
    };
    $('#r-csv', v).onclick = () => {
      if (!f.months.length) return UI.toast('Sélectionnez au moins un mois', 'warn');
      const r = this.build(f.months);
      const rows = [['Logement', 'Propriétaire', 'Locataires', 'Nuits', 'Occupation %', 'Durée moyenne', 'CA', 'Commission', 'Charges', 'Reversement']];
      r.st.rows.forEach(x => rows.push([x.logement.nom, Store.ownerName(x.owner), x.resa, x.nights, U.round2(x.occupancy), U.round2(x.avgStay), U.round2(x.ca), U.round2(x.commission), U.round2(x.charges), U.round2(x.reversement)]));
      U.download(`rapport_${r.months[0]}${r.months.length > 1 ? '_' + r.months[r.months.length - 1] : ''}.csv`, U.csv(rows), 'text/csv;charset=utf-8');
    };
    this.show(v);
  },
  show(v) {
    const out = $('#r-out', v);
    const f = S.rapports;
    if (!f.months.length) { out.innerHTML = '<div class="card empty">Sélectionnez un ou plusieurs mois.</div>'; return; }
    const r = this.build(f.months), T = r.st.tot;
    const table = (head, rows, foot) => `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th class="${i ? 'right' : ''}">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(x => `<tr>${x.map((c, i) => `<td class="${i ? 'right nowrap' : ''}">${c}</td>`).join('')}</tr>`).join('') || emptyRow(head.length, 'Aucune donnée')}</tbody>
      ${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${i ? 'right nowrap' : ''}">${c}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
    out.innerHTML = `<div class="stack report">
      <div class="card" style="background:var(--t);color:#fff;border-color:var(--t)"><h2 style="font-size:20px">${esc(r.title)}</h2><p style="margin:6px 0 0;opacity:.85;text-transform:capitalize">${esc(r.subtitle)}</p></div>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Nombre total de locataires</div><div class="val">${T.resa}</div><div class="sub">${T.voyageurs} voyageur(s)</div></div>
        <div class="kpi accent"><div class="lbl">Chiffre d'affaires</div><div class="val">${U.money(T.ca)}</div></div>
        <div class="kpi"><div class="lbl">Total des commissions</div><div class="val">${U.money(T.commission)}</div></div>
        <div class="kpi"><div class="lbl">Taux d'occupation</div><div class="val">${U.pct(T.occupancy)}</div></div>
        <div class="kpi"><div class="lbl">Charges</div><div class="val">${U.money(T.charges)}</div></div>
        <div class="kpi"><div class="lbl">Durée moyenne de séjour</div><div class="val">${T.avgStay.toFixed(1)} n</div></div>
      </div>
      ${r.months.length > 1 ? `<div class="card"><h2>Évolution mensuelle</h2>${table(['Mois', 'Locataires', 'CA', 'Commissions', 'Charges', 'Occupation'],
        r.monthly.map(m => [`<span style="text-transform:capitalize">${U.monthLabel(m.ym)}</span>`, m.tot.resa, U.money(m.tot.ca), U.money(m.tot.commission), U.money(m.tot.charges), U.pct(m.tot.occupancy)]))}</div>` : ''}
      <div class="card"><h2>Indicateurs par logement</h2>${table(
        ['Logement', 'Locataires', 'CA', 'Occupation', 'Charges', 'Durée moy.', 'Commission'],
        r.st.rows.map(x => [`<b>${esc(x.logement.nom)}</b>`, x.resa, U.money(x.ca), U.pct(x.occupancy), U.money(x.charges), x.avgStay ? x.avgStay.toFixed(1) + ' n' : '—', U.money(x.commission)]),
        ['Total', T.resa, U.money(T.ca), U.pct(T.occupancy), U.money(T.charges), T.avgStay ? T.avgStay.toFixed(1) + ' n' : '—', U.money(T.commission)])}</div>
      <div class="card"><h2>Indicateurs par propriétaire</h2>${table(
        ['Propriétaire', 'Logements', 'Locataires', 'CA', 'Occupation', 'Commission', 'Reversement'],
        r.st.owners.map(o => [`<b>${o.owner ? esc(Store.ownerName(o.owner)) : 'Sans propriétaire'}</b>`, o.logements, o.resa, U.money(o.ca), U.pct(o.occupancy), U.money(o.commission), U.money(o.reversement)]),
        ['Total', r.st.rows.length, T.resa, U.money(T.ca), U.pct(T.occupancy), U.money(T.commission), U.money(T.reversement)])}</div>
    </div>`;
  },
};

/* ═════════════════════════ SAUVEGARDE ═════════════════════════ */
const Sauvegarde = {
  title: 'Sauvegarde', icon: 'database',
  render(v) {
    const D = Store.data, c = Sync.cfg();
    const size = new Blob([localStorage.getItem(DB_KEY) || '']).size;
    const snaps = Store.snapshots();
    v.innerHTML = `
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Export / import</h2></div>
          <p class="hint" style="margin-top:0">Exportez toutes les données (propriétaires, logements, locataires, paiements, charges, équipements, modèles, utilisateurs) dans un fichier JSON
          pour les sauvegarder ou les transférer sur un autre poste. Les fichiers de l'ancienne version du CRM sont acceptés.</p>
          <div class="row"><button class="btn btn-primary" id="b-exp">${icon('download')}Exporter (JSON)</button>
            <label class="btn" style="flex-direction:row;color:var(--text);font-size:13px">${icon('upload')}Importer<input type="file" id="b-imp" accept=".json,application/json" hidden></label></div>
          <hr class="sep-line" style="margin:16px 0">
          <div class="row"><span class="muted">Exports tableur :</span>
            <button class="btn btn-sm" data-csv="locataires">Locataires</button><button class="btn btn-sm" data-csv="logements">Logements</button>
            <button class="btn btn-sm" data-csv="proprietaires">Propriétaires</button><button class="btn btn-sm" data-csv="paiements">Paiements</button></div>
          <p class="hint">${D.proprietaires.length} propriétaire(s) · ${D.logements.length} logement(s) · ${D.locataires.length} locataire(s) · ${D.charges.length} charge(s) · ${(size / 1024).toFixed(0)} Ko utilisés sur ~5 Mo</p>
        </div>
        <div class="card"><div class="card-head"><h2>${icon('cloud')} Synchronisation cloud</h2>${Sync.enabled ? '<span class="badge b-ok">Active</span>' : '<span class="badge">Non configurée</span>'}</div>
          <form id="sy" class="stack">
            <label>Jeton GitHub (permission « Gists » uniquement)<input name="token" type="password" data-reveal value="${esc(c.token)}" placeholder="github_pat_…" autocomplete="off"></label>
            <label>Identifiant du Gist<input name="gistId" value="${esc(c.gistId)}" placeholder="Laisser vide pour en créer un"></label>
            <label class="check"><input type="checkbox" name="auto"${c.auto ? ' checked' : ''}>Synchronisation automatique (envoi après chaque modification, récupération au démarrage)</label>
            <div class="row"><button class="btn btn-primary" type="submit">Enregistrer</button><button class="btn" type="button" id="sy-push">${icon('upload')}Envoyer</button><button class="btn" type="button" id="sy-pull">${icon('download')}Récupérer</button></div>
            <p class="hint" style="margin:0">${c.lastSync ? 'Dernière synchronisation : ' + new Date(c.lastSync).toLocaleString('fr-FR') + '. ' : ''}Sur le second poste, saisissez le même jeton et le même identifiant de Gist. Le jeton reste sur ce poste et n'est jamais exporté.</p>
          </form>
        </div>
      </div>
      <div class="card"><div class="card-head"><h2>Points de restauration automatiques</h2><span class="muted">un par jour, 7 conservés</span></div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th class="right">Locataires</th><th class="right">Logements</th><th></th></tr></thead><tbody>
          ${snaps.length ? snaps.map((s, i) => `<tr><td>${new Date(s.at).toLocaleString('fr-FR')}</td><td class="right">${(s.data.locataires || []).length}</td><td class="right">${(s.data.logements || []).length}</td>
            <td class="actions"><button class="btn btn-sm" data-restore="${i}">Restaurer</button></td></tr>`).join('') : emptyRow(4, 'Aucun point de restauration.')}
        </tbody></table></div></div>`;

    $('#b-exp', v).onclick = () => { U.download(`nexstay_backup_${U.today()}.json`, JSON.stringify(Store.exportJSON(), null, 1)); UI.toast('Sauvegarde exportée'); };
    $('#b-imp', v).onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const obj = JSON.parse(await file.text());
        const n = k => Array.isArray(obj[k]) ? obj[k].length : 0;
        if (!(await UI.confirm(`Importer <b>${esc(file.name)}</b> ?<br><br>${n('proprietaires')} propriétaire(s), ${n('logements')} logement(s), ${n('locataires')} locataire(s).<br>Les données actuelles seront remplacées (un point de restauration est créé avant).`, { ok: 'Importer' }))) return;
        Store.importJSON(obj);
        App.afterDataReplace();
        UI.toast('Données importées');
      } catch (err) { UI.toast('Import impossible : ' + err.message, 'error'); }
      e.target.value = '';
    };
    $$('[data-csv]', v).forEach(b => b.onclick = () => this.csv(b.dataset.csv));
    $$('[data-restore]', v).forEach(b => b.onclick = async () => {
      const s = snaps[+b.dataset.restore];
      if (!(await UI.confirm(`Restaurer les données du ${new Date(s.at).toLocaleString('fr-FR')} ?`, { ok: 'Restaurer' }))) return;
      Store.importJSON(s.data); App.afterDataReplace(); UI.toast('Données restaurées');
    });
    const form = $('#sy', v);
    const saveCfg = () => { const d = U.formData(form); Sync.setCfg({ token: d.token, gistId: d.gistId, auto: d.auto }); };
    form.onsubmit = e => { e.preventDefault(); saveCfg(); App.render(); UI.toast('Configuration enregistrée'); };
    $('#sy-push', v).onclick = async () => {
      saveCfg();
      try { const g = await Sync.push(); App.render(); UI.toast('Données envoyées (Gist ' + g.id.slice(0, 7) + '…)'); } catch (e) { UI.toast(e.message, 'error'); }
    };
    $('#sy-pull', v).onclick = async () => {
      saveCfg();
      if (!Sync.cfg().gistId) return UI.toast('Indiquez l\'identifiant du Gist', 'warn');
      if (!(await UI.confirm('Remplacer les données locales par celles du cloud ?', { ok: 'Récupérer' }))) return;
      try { await Sync.pull(); App.afterDataReplace(); UI.toast('Données récupérées'); } catch (e) { UI.toast(e.message, 'error'); }
    };
  },
  csv(kind) {
    const D = Store.data;
    let rows;
    if (kind === 'locataires') return Locataires.csv();
    if (kind === 'logements') rows = [['Nom', 'Adresse', 'Ville', 'Code postal', 'Chambres', 'SDB', 'Lits', 'Capacité', 'Propriétaire', 'Équipements'],
      ...D.logements.map(l => [l.nom, l.adresse, l.ville, l.codePostal, l.chambres, l.sdb, l.lits, l.capacite, Store.ownerName(Store.ownerOf(l)), l.equipements.join(', ')])];
    if (kind === 'proprietaires') rows = [['Nom', 'Prénom', 'Commission %', 'E-mail', 'Téléphone'], ...D.proprietaires.map(p => [p.nom, p.prenom, p.commission, p.email, p.telephone])];
    if (kind === 'paiements') {
      rows = [['Locataire', 'Logement', 'Date', 'Mode', 'Note', 'Montant']];
      for (const t of D.locataires) for (const h of (D.paiements[t.id] || { historique: [] }).historique) {
        rows.push([Store.guestName(t), (Store.get('logements', t.logementId) || {}).nom, h.date, h.mode, h.note, h.montant]);
      }
    }
    U.download(kind + '.csv', U.csv(rows), 'text/csv;charset=utf-8');
  },
};

/* ═════════════════════════ UTILISATEURS ═════════════════════════ */
const Utilisateurs = {
  title: 'Utilisateurs', icon: 'shield', admin: true,
  actions: `<button class="btn btn-primary" data-act="new">${icon('plus')}<span>Nouvel utilisateur</span></button>`,
  onAction(a) { if (a === 'new') this.form(); },
  render(v) {
    const users = U.sortBy(Store.data.users, u => u.login);
    v.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Identifiant</th><th>Rôle</th><th>Mot de passe</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr><td><b>${esc(u.login)}</b>${u.id === Auth.user.id ? ' <span class="muted">(vous)</span>' : ''}</td>
        <td>${u.isAdmin ? '<span class="badge b-accent">Administrateur</span>' : '<span class="badge">Utilisateur</span>'}</td>
        <td>${u.mustChange ? '<span class="badge b-warn">À changer</span>' : '<span class="badge b-ok">Chiffré</span>'}</td>
        <td class="actions">${u.id !== Auth.user.id ? `<button class="btn btn-sm" data-role="${u.id}">${u.isAdmin ? 'Retirer admin' : 'Rendre admin'}</button>` : ''}
          <button class="btn btn-sm" data-reset="${u.id}">Réinitialiser</button>
          ${u.id !== Auth.user.id ? `<button class="icon-btn danger" data-del="${u.id}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="hint">Les mots de passe sont stockés sous forme d'empreinte SHA-256 salée, jamais en clair.</p></div>`;
    $$('[data-role]', v).forEach(b => b.onclick = () => {
      const u = Store.get('users', b.dataset.role);
      u.isAdmin = !u.isAdmin; Store.save(); App.render();
    });
    $$('[data-reset]', v).forEach(b => b.onclick = () => this.form(Store.get('users', b.dataset.reset)));
    $$('[data-del]', v).forEach(b => b.onclick = async () => {
      const u = Store.get('users', b.dataset.del);
      if (await UI.confirm(`Supprimer l'utilisateur <b>${esc(u.login)}</b> ?`)) { Store.remove('users', u.id); App.render(); UI.toast('Utilisateur supprimé'); }
    });
  },
  form(u = null) {
    const isNew = !u;
    const m = UI.modal({
      title: isNew ? 'Nouvel utilisateur' : 'Réinitialiser le mot de passe de ' + esc(u.login), size: 'small',
      body: `<form id="f-u" class="stack">
        ${isNew ? '<label>Identifiant *<input name="login" required autocomplete="off"></label>' : ''}
        <label>Mot de passe *<input name="password" type="password" data-reveal required minlength="6" autocomplete="new-password"></label>
        ${isNew ? '<label class="check"><input type="checkbox" name="isAdmin">Administrateur</label>' : ''}
        <label class="check"><input type="checkbox" name="mustChange" checked>Exiger un changement à la prochaine connexion</label>
      </form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`,
    });
    const form = $('#f-u', m.el);
    const save = () => {
      if (!form.reportValidity()) return;
      const d = U.formData(form);
      if (isNew && Store.data.users.some(x => x.login.toLowerCase() === d.login.toLowerCase())) return UI.toast('Cet identifiant existe déjà', 'error');
      const user = u || { id: U.uid(), login: d.login, isAdmin: d.isAdmin };
      Auth.setPassword(user, d.password);
      user.mustChange = d.mustChange;
      if (isNew) Store.data.users.push(user);
      Store.save(); m.close(); App.render(); UI.toast(isNew ? 'Utilisateur créé' : 'Mot de passe réinitialisé');
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = e => { e.preventDefault(); save(); };
  },
};

/* ═════════════════════════ MON COMPTE ═════════════════════════ */
const Compte = {
  title: 'Mon compte', icon: 'user',
  render(v) {
    const u = Auth.user;
    v.innerHTML = `<div class="card" style="max-width:480px"><div class="card-head"><h2>Changer mon mot de passe</h2><span class="badge plain">${esc(u.login)}</span></div>
      ${u.mustChange ? `<div class="alert" style="margin-bottom:14px">${icon('shield')}Pour votre sécurité, choisissez un nouveau mot de passe.</div>` : ''}
      <form id="f-pw" class="stack">
        <label>Mot de passe actuel<input name="old" type="password" data-reveal required autocomplete="current-password"></label>
        <label>Nouveau mot de passe (6 caractères min.)<input name="pw" type="password" data-reveal required minlength="6" autocomplete="new-password"></label>
        <label>Confirmation<input name="pw2" type="password" data-reveal required autocomplete="new-password"></label>
        <div><button class="btn btn-primary">Mettre à jour</button></div>
      </form></div>`;
    UI.enhancePasswords(v);
    $('#f-pw', v).onsubmit = e => {
      e.preventDefault();
      const d = U.formData(e.target);
      if (!Auth.check(u, d.old)) return UI.toast('Mot de passe actuel incorrect', 'error');
      if (d.pw !== d.pw2) return UI.toast('Les deux mots de passe ne correspondent pas', 'error');
      if (d.pw === d.old) return UI.toast('Choisissez un mot de passe différent', 'warn');
      Auth.setPassword(u, d.pw);
      u.mustChange = false;
      Store.save(); App.render(); UI.toast('Mot de passe modifié');
    };
  },
};

/* ═════════════════════════ RECHERCHE GLOBALE (Ctrl+K) ═════════════════════════ */
const Search = {
  open() {
    if ($('.search-box')) return;
    const m = UI.modal({ body: `<div class="search-box">${icon('search')}<input id="s-q" placeholder="Rechercher un locataire, un logement, un propriétaire…" autocomplete="off"><kbd>Échap</kbd></div><div class="search-results" id="s-res"></div>` });
    const body = m.el.querySelector('.modal-body');
    body.style.padding = '0'; body.style.gap = '0';
    const input = $('#s-q', m.el), res = $('#s-res', m.el);
    let items = [], sel = 0;
    const run = () => {
      const q = U.norm(input.value.trim());
      const D = Store.data;
      items = [];
      if (q) {
        for (const t of D.locataires) {
          const l = Store.get('logements', t.logementId);
          if (U.norm([t.prenom, t.nom, t.identite, t.telephone, t.email].join(' ')).includes(q))
            items.push({ ico: 'users', label: Store.guestName(t), sub: `${l ? l.nom : '—'} · ${U.fmtDate(t.dateArrivee)} → ${U.fmtDate(t.dateDepart)}`, k: 'Locataire', go: () => Locataires.form(t) });
        }
        for (const l of D.logements) if (U.norm([l.nom, l.adresse, l.ville].join(' ')).includes(q))
          items.push({ ico: 'home', label: l.nom, sub: [l.adresse, l.ville].filter(Boolean).join(', '), k: 'Logement', go: () => Logements.form(l) });
        for (const p of D.proprietaires) if (U.norm([p.nom, p.prenom, p.email].join(' ')).includes(q))
          items.push({ ico: 'key', label: Store.ownerName(p), sub: p.email || '', k: 'Propriétaire', go: () => Proprietaires.form(p) });
        for (const [route, view] of Object.entries(VIEWS)) if (U.norm(view.title).includes(q) && (!view.admin || Auth.isAdmin))
          items.push({ ico: view.icon, label: view.title, sub: 'Ouvrir l\'écran', k: 'Page', go: () => App.go(route) });
      }
      items = items.slice(0, 30); sel = 0;
      draw();
    };
    const draw = () => {
      res.innerHTML = items.length ? items.map((it, i) => `<div class="search-result${i === sel ? ' sel' : ''}" data-i="${i}">${icon(it.ico)}<div><div><b>${esc(it.label)}</b></div><div class="muted" style="font-size:12px">${esc(it.sub)}</div></div><span class="k">${it.k}</span></div>`).join('')
        : `<div class="empty">${input.value ? 'Aucun résultat' : 'Tapez pour rechercher'}</div>`;
      $$('[data-i]', res).forEach(el => el.onclick = () => choose(+el.dataset.i));
    };
    const choose = i => { const it = items[i]; if (!it) return; m.close(); it.go(); };
    input.oninput = run;
    input.onkeydown = e => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter') choose(sel);
    };
    draw();
  },
};

/* Ordre du menu */
const VIEWS = {
  dashboard: Dashboard, locataires: Locataires, logements: Logements, proprietaires: Proprietaires, calendrier: Calendrier,
  paiements: Paiements, modeles: Modeles, parametrage: Parametrage, charges: Charges, rapports: Rapports, sauvegarde: Sauvegarde,
  utilisateurs: Utilisateurs, compte: Compte,
};
