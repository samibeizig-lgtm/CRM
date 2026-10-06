/* Nexstay CRM — documents : contrats, rapports, reçus (PDF) et calendriers iCal */
'use strict';

const CONTRACT_VARS = [
  ['prenom', 'Prénom'], ['nom', 'Nom'], ['identite', 'N° pièce d\'identité'], ['dateEmissionIdentite', 'Date d\'émission'],
  ['nationalite', 'Nationalité'], ['telephone', 'Téléphone'], ['email', 'E-mail'], ['personnes', 'Nb personnes'],
  ['dateArrivee', 'Date d\'arrivée'], ['dateDepart', 'Date de départ'], ['nbNuits', 'Nb de nuits'],
  ['logementNom', 'Logement'], ['logementAdresse', 'Adresse'], ['logementVille', 'Ville'], ['logementCodePostal', 'Code postal'],
  ['logementChambres', 'Chambres'], ['logementSDB', 'Salles de bain'], ['logementLits', 'Lits'], ['logementEquipements', 'Équipements'],
  ['prixTotal', 'Prix total'], ['prixNuit', 'Prix par nuit'], ['montantPaye', 'Montant payé'], ['resteDu', 'Reste dû'],
  ['proprietaire', 'Propriétaire'], ['societe', 'Société'], ['dateDuJour', 'Date du jour'],
];

const PDFC = { t: [194, 122, 107], td: [169, 96, 79], text: [42, 38, 35], muted: [138, 129, 122], line: [236, 230, 224], soft: [251, 246, 244] };

const Docs = {
  jsPDF() {
    if (!window.jspdf) throw new Error('Bibliothèque PDF indisponible (connexion internet requise au premier lancement).');
    return window.jspdf.jsPDF;
  },

  contractValues(t) {
    const l = Store.get('logements', t.logementId) || {};
    const n = Calc.nights(t);
    return {
      prenom: t.prenom, nom: t.nom, identite: t.identite, dateEmissionIdentite: U.fmtDate(t.dateEmissionIdentite),
      nationalite: t.nationalite, telephone: t.telephone, email: t.email, personnes: t.personnes,
      dateArrivee: U.fmtDate(t.dateArrivee), dateDepart: U.fmtDate(t.dateDepart), nbNuits: n,
      logementNom: l.nom, logementAdresse: l.adresse, logementVille: l.ville, logementCodePostal: l.codePostal,
      logementChambres: l.chambres, logementSDB: l.sdb, logementLits: l.lits, logementEquipements: (l.equipements || []).join(', '),
      prixTotal: U.money(t.prix), prixNuit: U.money(n ? t.prix / n : 0), montantPaye: U.money(Calc.paid(t)), resteDu: U.money(Calc.balance(t)),
      proprietaire: Store.ownerName(Store.ownerOf(l)), societe: Store.data.settings.societe, dateDuJour: U.fmtDate(U.today()),
    };
  },

  renderContract(t, html = null) {
    const tpl = html !== null ? { html } : Store.get('modeles', t.modeleId) || Store.data.modeles[0];
    if (!tpl) return '<p>Aucun modèle de contrat.</p>';
    const vals = this.contractValues(t);
    return tpl.html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vals ? U.esc(vals[k] ?? '') : m));
  },

  async contractPDF(t, html = null) {
    const JsPDF = this.jsPDF();
    if (!window.html2canvas) throw new Error('html2canvas indisponible.');
    const area = UI.$('#print-area');
    area.innerHTML = `<div class="contract-page" style="box-shadow:none;border-radius:0;padding:0;width:700px">${this.renderContract(t, html)}</div>`;
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    await new Promise((resolve, reject) => {
      try {
        doc.html(area.firstElementChild, {
          x: margin, y: margin, margin: [margin, margin, margin, margin],
          width: 595.28 - margin * 2, windowWidth: 700, autoPaging: 'text',
          html2canvas: { backgroundColor: '#ffffff' },
          callback: resolve,
        });
      } catch (e) { reject(e); }
    });
    area.innerHTML = '';
    const name = `Contrat_${(t.nom || 'locataire').replace(/\s+/g, '_')}_${t.dateArrivee || ''}.pdf`;
    doc.save(name);
  },

  receiptPDF(t) {
    const JsPDF = this.jsPDF();
    const S = Store.data.settings;
    const l = Store.get('logements', t.logementId) || {};
    const p = Store.data.paiements[t.id] || { historique: [] };
    const doc = new JsPDF({ unit: 'mm', format: 'a5' });
    doc.setFillColor(...PDFC.t); doc.rect(0, 0, 148, 26, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(S.societe || 'Nexstay', 12, 16);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Reçu de paiement', 136, 16, { align: 'right' });
    doc.setTextColor(...PDFC.text); doc.setFontSize(10);
    let y = 38;
    const line = (a, b) => { doc.setTextColor(...PDFC.muted); doc.text(a, 12, y); doc.setTextColor(...PDFC.text); doc.text(String(b), 55, y); y += 6.5; };
    line('Locataire', Store.guestName(t));
    line('Logement', l.nom || '—');
    line('Séjour', `${U.fmtDate(t.dateArrivee)} au ${U.fmtDate(t.dateDepart)} (${Calc.nights(t)} nuits)`);
    line('Date d\'émission', U.fmtDate(U.today()));
    doc.autoTable({
      startY: y + 2, margin: { left: 12, right: 12 },
      head: [['Date', 'Mode', 'Note', 'Montant']],
      body: p.historique.map(h => [U.fmtDate(h.date), h.mode || '', h.note || '', U.money(h.montant)]),
      foot: [['', '', 'Total payé', U.money(Calc.paid(t))], ['', '', 'Prix du séjour', U.money(t.prix)], ['', '', 'Reste dû', U.money(Calc.balance(t))]],
      headStyles: { fillColor: PDFC.t }, footStyles: { fillColor: PDFC.soft, textColor: PDFC.text },
      styles: { fontSize: 9 }, columnStyles: { 3: { halign: 'right' } },
    });
    const fy = doc.lastAutoTable.finalY + 14;
    doc.setFontSize(8); doc.setTextColor(...PDFC.muted);
    doc.text([S.societe, S.adresse, S.telephone, S.email].filter(Boolean).join(' · '), 12, Math.min(fy, 200));
    doc.save(`Recu_${(t.nom || 'locataire').replace(/\s+/g, '_')}.pdf`);
  },

  /* Rapport mensuel : paysage, couleur terracotta, page de garde */
  reportPDF(report) {
    const JsPDF = this.jsPDF();
    const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;
    const S = Store.data.settings;

    // Page de garde
    doc.setFillColor(...PDFC.t); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(...PDFC.td); doc.rect(0, H - 42, W, 42, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text((S.societe || 'Nexstay').toUpperCase(), 24, 30);
    doc.setFontSize(34);
    doc.text(doc.splitTextToSize(report.title, W - 48), 24, 88);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
    doc.text(doc.splitTextToSize(report.subtitle, W - 48), 24, 118);
    doc.setFontSize(10);
    doc.text(`Généré le ${U.fmtDateLong(U.today())}`, 24, H - 18);
    doc.text(`${report.st.rows.length} logement(s) · ${report.st.tot.resa} réservation(s)`, W - 24, H - 18, { align: 'right' });

    const T = report.st.tot;
    // Synthèse
    doc.addPage();
    this.pageHeader(doc, 'Synthèse', report.title);
    const kpis = [
      ['Locataires', String(T.resa)], ['Chiffre d\'affaires', U.money(T.ca)], ['Commissions', U.money(T.commission)],
      ['Taux d\'occupation', U.pct(T.occupancy)], ['Charges', U.money(T.charges)], ['Durée moy. séjour', T.avgStay.toFixed(1) + ' nuits'],
      ['Prix moyen / nuit', U.money(T.adr)], ['RevPAR', U.money(T.revpar)],
    ];
    kpis.forEach(([k, v], i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 14 + col * 68, y = 34 + row * 30;
      doc.setFillColor(...PDFC.soft); doc.setDrawColor(...PDFC.line); doc.roundedRect(x, y, 62, 24, 3, 3, 'FD');
      doc.setFontSize(8.5); doc.setTextColor(...PDFC.muted); doc.text(k, x + 5, y + 8);
      doc.setFontSize(15); doc.setTextColor(...PDFC.td); doc.setFont('helvetica', 'bold'); doc.text(v, x + 5, y + 18);
      doc.setFont('helvetica', 'normal');
    });
    if (report.months.length > 1) {
      this.table(doc, 98, 'Évolution mensuelle', ['Mois', 'Locataires', 'CA', 'Commissions', 'Charges', 'Occupation'],
        report.monthly.map(m => [U.monthLabel(m.ym), m.tot.resa, U.money(m.tot.ca), U.money(m.tot.commission), U.money(m.tot.charges), U.pct(m.tot.occupancy)]));
    }

    // Détail par logement
    doc.addPage();
    this.pageHeader(doc, 'Détail par logement', report.title);
    this.table(doc, 30, null,
      ['Logement', 'Propriétaire', 'Locataires', 'Nuits', 'Occupation', 'Durée moy.', 'CA', 'Commission', 'Charges', 'Charge / résa'],
      report.st.rows.map(r => [r.logement.nom, Store.ownerName(r.owner), r.resa, r.nights, U.pct(r.occupancy), r.avgStay ? r.avgStay.toFixed(1) + ' n' : '—',
        U.money(r.ca), U.money(r.commission), U.money(r.charges), r.resa ? U.money(r.chargePerResa) : '—']),
      ['Total', '', T.resa, T.nights, U.pct(T.occupancy), T.avgStay ? T.avgStay.toFixed(1) + ' n' : '—', U.money(T.ca), U.money(T.commission), U.money(T.charges), '']);

    // Par propriétaire
    doc.addPage();
    this.pageHeader(doc, 'Synthèse par propriétaire', report.title);
    this.table(doc, 30, null, ['Propriétaire', 'Commission %', 'Logements', 'Locataires', 'Occupation', 'CA', 'Commission', 'Charges', 'Reversement'],
      report.st.owners.map(o => [o.owner ? Store.ownerName(o.owner) : 'Sans propriétaire', o.owner ? o.owner.commission + ' %' : '—', o.logements, o.resa,
        U.pct(o.occupancy), U.money(o.ca), U.money(o.commission), U.money(o.charges), U.money(o.reversement)]),
      ['Total', '', report.st.rows.length, T.resa, U.pct(T.occupancy), U.money(T.ca), U.money(T.commission), U.money(T.charges), U.money(T.reversement)]);

    // Pieds de page
    const n = doc.getNumberOfPages();
    for (let i = 2; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(...PDFC.muted);
      doc.text(`${S.societe || 'Nexstay'} — ${report.title}`, 14, H - 8);
      doc.text(`${i - 1} / ${n - 1}`, W - 14, H - 8, { align: 'right' });
    }
    doc.save(`Rapport_Nexstay_${report.months[0]}${report.months.length > 1 ? '_' + report.months[report.months.length - 1] : ''}.pdf`);
  },

  pageHeader(doc, title, sub) {
    doc.setFillColor(...PDFC.t); doc.rect(0, 0, 297, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...PDFC.text);
    doc.text(title, 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDFC.muted);
    doc.text(sub, 283, 18, { align: 'right' });
  },

  table(doc, y, title, head, body, foot) {
    if (title) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDFC.text);
      doc.text(title, 14, y); y += 4;
      doc.setFont('helvetica', 'normal');
    }
    doc.autoTable({
      startY: y, margin: { left: 14, right: 14, top: 26 }, head: [head], body, foot: foot ? [foot] : undefined,
      headStyles: { fillColor: PDFC.t, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: PDFC.soft, textColor: PDFC.td, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [253, 251, 250] },
      styles: { fontSize: 8.5, cellPadding: body.length > 10 ? 1.8 : 2.4, lineColor: PDFC.line, lineWidth: 0.1 },
      showFoot: 'lastPage',
    });
  },

  /* Export iCal (.ics) — importable dans Airbnb, Booking ou Google Agenda pour bloquer les dates */
  ics(logementId) {
    const l = Store.get('logements', logementId);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const esc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const ev = Store.data.locataires
      .filter(t => t.logementId === logementId && Calc.active(t) && Calc.nights(t))
      .map(t => ['BEGIN:VEVENT', `UID:${t.id}@nexstay-crm`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${t.dateArrivee.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${t.dateDepart.replace(/-/g, '')}`,
        `SUMMARY:${esc('Réservé — ' + Store.guestName(t))}`, 'END:VEVENT'].join('\r\n'));
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nexstay//CRM//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(l ? l.nom : 'Nexstay')}`, ...ev, 'END:VCALENDAR'].join('\r\n');
    U.download(`${(l ? l.nom : 'logement').replace(/[^\w-]+/g, '_')}.ics`, body, 'text/calendar');
  },
};
