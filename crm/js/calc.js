/* Nexstay CRM — calculs métier (CA, occupation, commissions, charges, conflits) */
'use strict';

const Calc = {
  /* Une réservation annulée n'est comptée ni dans le CA ni dans l'occupation */
  active(t) { return t.statut !== 'annulé'; },

  nights(t) {
    const n = U.dn(t.dateDepart) - U.dn(t.dateArrivee);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },

  /* Nuits d'une réservation comprises dans [s, e] (bornes incluses, en jours) */
  overlap(t, s, e) {
    const a = U.dn(t.dateArrivee), d = U.dn(t.dateDepart);
    if (!Number.isFinite(a) || !Number.isFinite(d)) return 0;
    return Math.max(0, Math.min(d, e + 1) - Math.max(a, s));
  },

  /* CA réparti au prorata des nuits : un séjour à cheval sur deux mois est partagé entre les deux */
  revenueIn(t, s, e) {
    const n = this.nights(t);
    return n ? t.prix * this.overlap(t, s, e) / n : 0;
  },

  /* Fraction de mois couverte par la période (pour les charges mensuelles) */
  monthsIn(s, e) {
    let total = 0;
    let cur = U.monthStart(U.iso(s));
    while (U.dn(cur) <= e) {
      const ms = U.dn(cur), me = U.dn(U.monthEnd(cur));
      const ov = Math.min(me, e) - Math.max(ms, s) + 1;
      if (ov > 0) total += ov / (me - ms + 1);
      cur = U.addMonths(cur, 1);
    }
    return total;
  },

  paid(t) {
    const p = Store.data.paiements[t.id];
    return p ? p.paye : 0;
  },
  balance(t) { return U.round2(t.prix - this.paid(t)); },

  /* Statistiques d'une période. Les réservations sont comptées à leur date d'arrivée ;
     nuits et CA sont proratisés sur la période. */
  period({ start, end, logementIds = null, proprietaireId = '' }) {
    const D = Store.data;
    const s = U.dn(start), e = U.dn(end);
    const days = Math.max(0, e - s + 1);
    const months = this.monthsIn(s, e);
    let logements = D.logements;
    if (logementIds && logementIds.length) logements = logements.filter(l => logementIds.includes(l.id));
    if (proprietaireId) logements = logements.filter(l => l.proprietaireId === proprietaireId);

    const byLog = new Map();
    for (const l of logements) {
      byLog.set(l.id, { logement: l, owner: Store.ownerOf(l), nights: 0, available: days, ca: 0, resa: 0, stayNights: 0, charges: 0, commission: 0, voyageurs: 0 });
    }
    for (const t of D.locataires) {
      const r = byLog.get(t.logementId);
      if (!r || !this.active(t)) continue;
      const ov = this.overlap(t, s, e);
      r.nights += ov;
      r.ca += this.revenueIn(t, s, e);
      const a = U.dn(t.dateArrivee);
      if (a >= s && a <= e) { r.resa++; r.stayNights += this.nights(t); r.voyageurs += t.personnes || 0; }
    }
    for (const c of D.charges) {
      for (const lid of c.logementIds) {
        const r = byLog.get(lid);
        if (!r) continue;
        r.charges += c.type === 'mensuel' ? c.montant * months : c.montant * r.resa;
      }
    }
    return this.finish([...byLog.values()], { days, months });
  },

  /* Plusieurs mois (éventuellement non consécutifs) : addition des périodes mensuelles */
  months(yms, filter = {}) {
    const merged = new Map();
    let days = 0, months = 0;
    const monthly = [];
    for (const ym of [...yms].sort()) {
      const st = this.period({ start: ym + '-01', end: U.monthEnd(ym + '-01'), ...filter });
      monthly.push({ ym, tot: st.tot });
      days += st.days; months += st.months;
      for (const r of st.rows) {
        const m = merged.get(r.logement.id);
        if (!m) { merged.set(r.logement.id, { ...r }); continue; }
        for (const k of ['nights', 'available', 'ca', 'resa', 'stayNights', 'charges', 'voyageurs']) m[k] += r[k];
      }
    }
    return { ...this.finish([...merged.values()], { days, months }), monthly };
  },

  /* Indicateurs dérivés, regroupement par propriétaire et totaux */
  finish(list, { days, months }) {
    const deduct = Store.data.settings.chargesSurReversement;
    for (const r of list) {
      r.occupancy = r.available ? r.nights / r.available * 100 : 0;
      r.commission = r.ca * ((r.owner && r.owner.commission) || 0) / 100;
      r.avgStay = r.resa ? r.stayNights / r.resa : 0;
      r.chargePerResa = r.resa ? r.charges / r.resa : 0;
      r.reversement = r.ca - r.commission - (deduct ? r.charges : 0);
      r.adr = r.nights ? r.ca / r.nights : 0;
    }
    const rows = U.sortBy(list, r => r.logement.nom);

    const byOwner = new Map();
    for (const r of rows) {
      const key = r.owner ? r.owner.id : '';
      if (!byOwner.has(key)) byOwner.set(key, { owner: r.owner, logements: 0, nights: 0, available: 0, ca: 0, commission: 0, charges: 0, reversement: 0, resa: 0 });
      const o = byOwner.get(key);
      o.logements++; o.nights += r.nights; o.available += r.available; o.ca += r.ca;
      o.commission += r.commission; o.charges += r.charges; o.reversement += r.reversement; o.resa += r.resa;
    }
    const owners = U.sortBy([...byOwner.values()], o => o.owner ? Store.ownerName(o.owner) : '~');
    owners.forEach(o => { o.occupancy = o.available ? o.nights / o.available * 100 : 0; });

    const sum = k => rows.reduce((a, r) => a + r[k], 0);
    const tot = {
      resa: sum('resa'), nights: sum('nights'), available: sum('available'), ca: sum('ca'), commission: sum('commission'),
      charges: sum('charges'), reversement: sum('reversement'), stayNights: sum('stayNights'), voyageurs: sum('voyageurs'),
    };
    tot.occupancy = tot.available ? tot.nights / tot.available * 100 : 0;
    tot.adr = tot.nights ? tot.ca / tot.nights : 0;
    tot.revpar = tot.available ? tot.ca / tot.available : 0;
    tot.avgStay = tot.resa ? tot.stayNights / tot.resa : 0;
    return { rows, owners, tot, days, months };
  },

  /* CA des n derniers mois (pour le graphique du tableau de bord) */
  monthlySeries(n = 12, filter = {}) {
    const out = [];
    const first = U.addMonths(U.monthStart(U.today()), -(n - 1));
    for (let i = 0; i < n; i++) {
      const ms = U.addMonths(first, i);
      const st = this.period({ start: ms, end: U.monthEnd(ms), ...filter });
      out.push({ ym: ms.slice(0, 7), ca: st.tot.ca, occupancy: st.tot.occupancy });
    }
    return out;
  },

  /* Réservations qui se chevauchent sur un même logement */
  conflicts() {
    const ids = new Set();
    const byLog = {};
    for (const t of Store.data.locataires) {
      if (!this.active(t) || !this.nights(t)) continue;
      (byLog[t.logementId] = byLog[t.logementId] || []).push(t);
    }
    for (const list of Object.values(byLog)) {
      list.sort((a, b) => U.dn(a.dateArrivee) - U.dn(b.dateArrivee));
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length && U.dn(list[j].dateArrivee) < U.dn(list[i].dateDepart); j++) {
          ids.add(list[i].id); ids.add(list[j].id);
        }
      }
    }
    return ids;
  },

  conflictsFor(t) {
    if (!t.logementId || !this.nights(t) || !this.active(t)) return [];
    const a = U.dn(t.dateArrivee), d = U.dn(t.dateDepart);
    return Store.data.locataires.filter(o => o.id !== t.id && o.logementId === t.logementId && this.active(o) &&
      U.dn(o.dateArrivee) < d && U.dn(o.dateDepart) > a);
  },

  /* Statut proposé d'après les dates (une réservation annulée le reste) */
  autoStatus(t, today = U.today()) {
    if (t.statut === 'annulé') return t.statut;
    const td = U.dn(today);
    if (U.dn(t.dateDepart) <= td) return 'terminé';
    if (U.dn(t.dateArrivee) <= td) return 'en cours';
    return 'confirmé';
  },

  /* Prix moyen par nuit observé pour un logement : sert de suggestion de tarif */
  suggestedNightly(logementId) {
    const list = Store.data.locataires.filter(t => t.logementId === logementId && this.active(t) && this.nights(t) && t.prix > 0);
    if (!list.length) return 0;
    const recent = list.sort((a, b) => U.dn(b.dateArrivee) - U.dn(a.dateArrivee)).slice(0, 10);
    return recent.reduce((s, t) => s + t.prix / this.nights(t), 0) / recent.length;
  },
};
