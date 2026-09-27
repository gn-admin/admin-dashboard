/**
 * Exportación a PDF - Individual y completa.
 */

const PdfExport = {

  async exportSingleResponse(row, survey, nota) {
    return this._printAsync(`Informe-${row.id}.pdf`, (logo) => this._buildSingleReport(row, survey, logo, nota));
  },

  async exportAllResponses(responses, survey) {
    return this._printAsync(`Informe-${survey?.id || 'encuesta'}.pdf`, (logo) => this._buildFullReport(responses, survey, logo));
  },

  _logoFallback: 'https://static.wixstatic.com/media/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg/v1/fill/w_96,h_96,al_c,q_80/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg',
  _logoCache: null,

  // Logo local (offline) con fallback remoto. No bloquear: se resuelve antes de pintar.
  async _logoUrl() {
    if (this._logoCache) return this._logoCache;
    try {
      const res = await fetch('assets/icons/logo-nebak.jpg');
      if (!res.ok) throw 0;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      this._logoCache = dataUrl;
      return dataUrl;
    } catch {
      return this._logoFallback;
    }
  },

  _esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  },

  _buildSingleReport(row, survey, logo, nota) {
    const sid = (survey && survey.id) || row._surveyId || '';
    const estado = (typeof Dashboard !== 'undefined' && sid) ? Dashboard.getEstado(row.id, sid) : '';
    const estBadge = estado ? `<span class="badge badge-${estado}">${this._esc(estado.replace(/_/g, ' '))}</span>` : '';
    const img = logo || this._logoFallback;
    const date = row.fecha_creacion
      ? new Date(row.fecha_creacion).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    const sections = typeof Dashboard !== 'undefined' ? Dashboard._buildSections(row, survey?.id) : [];

    const sectionsHtml = sections.map(s => `
      <div class="section">
        <div class="section-title">${this._esc(s.title)}</div>
        ${s.fields.map(f => `
          <div class="field">
            <div class="question">${this._esc(f.label)}</div>
            <div class="answer">${f.value == null ? '—' : this._esc(f.value)}</div>
          </div>
        `).join('')}
      </div>
    `).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Informe ${row.nombre} ${row.apellidos}</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:11pt/1.5 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .report-header{display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1FC95B}
        .report-logo{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B}
        .avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#1FC95B,#16E096);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;flex-shrink:0}
        .name{font-size:18pt;font-weight:700;color:#191919}
        .meta{font-size:9pt;color:#757575;margin-top:2px}
        .badge{display:inline-block;background:#AFF3C7;color:#15863D;padding:2px 10px;border-radius:999px;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px}
        .badge-pendiente{background:#e8eaed;color:#6b7280}.badge-en_proceso{background:#ebf5fb;color:#2563db}.badge-aprobada{background:#AFF3C7;color:#15863D}.badge-descartada{background:#fde2e2;color:#c0392b}
        .section{margin-bottom:20px;break-inside:avoid}
        .section-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#757575;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #e8eaed}
        .field{margin-bottom:12px;break-inside:avoid}
        .question{font-size:8pt;font-weight:600;color:#9aa0a6;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px}
        .answer{font-size:10pt;color:#191919;line-height:1.5}
        .footer{text-align:center;margin-top:32px;padding-top:12px;border-top:1px solid #e8eaed;font-size:8pt;color:#9aa0a6}
      </style></head><body>
      <div class="report-header">
        <img src="${img}" class="report-logo" alt="Grupo Nebak">
        <div class="avatar">${(row.nombre?.[0]||'')+(row.apellidos?.[0]||'')}</div>
        <div>
          <div class="name">${this._esc(row.nombre)} ${this._esc(row.apellidos)}</div>
          <div class="meta">${this._esc(row.email)} · ${date}</div>
          ${survey ? `<span class="badge">${survey.name}</span>` : ''} ${estBadge}
        </div>
      </div>
      ${sectionsHtml}
      ${nota ? `<div class="section"><div class="section-title">Notas del evaluador</div><div class="answer">${this._esc(nota)}</div></div>` : ''}
      <div class="footer">
        Generado por GN-Encuestas · Grupo Nebak · ${new Date().toLocaleDateString('es-ES')} · Documento confidencial
      </div>
    </body></html>`;
  },

  _buildFullReport(responses, survey, logo) {
    const sid = (survey && survey.id) || '';
    const rows = (responses || []).map(r => ({
      row: r,
      estado: (typeof Dashboard !== 'undefined' && sid) ? Dashboard.getEstado(r.id, sid) : ''
    }));
    const counts = {};
    rows.forEach(({ estado }) => { const k = estado || 'pendiente'; counts[k] = (counts[k] || 0) + 1; });
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const img = logo || this._logoFallback;
    const order = ['pendiente', 'en_proceso', 'aprobada', 'descartada'];
    const dist = order.filter(k => counts[k]).map(k => `<div class="kpi"><div class="kpi-n">${counts[k]}</div><div class="kpi-l">${k.replace(/_/g, ' ')}</div></div>`).join('');

    const pages = rows.map(({ row, estado }, i) => {
      const sections = (typeof Dashboard !== 'undefined') ? Dashboard._buildSections(row, sid) : [];
      const who = [row.nombre, row.apellidos].filter(Boolean).join(' ').trim() || ('Solicitud ' + (row.id || (i + 1)));
      return `<div class="sheet">
        <div class="sheet-head"><span class="sheet-n">${i + 1}</span>
          <div><div class="sheet-name">${this._esc(who)}</div>
          <div class="sheet-meta">${this._esc(row.email || '')}${row.fecha_creacion ? ' · ' + this._esc(row.fecha_creacion) : ''}</div></div>
          ${estado ? `<span class="badge badge-${estado}">${this._esc(estado.replace(/_/g, ' '))}</span>` : ''}
        </div>
        ${sections.map(s => `<div class="section"><div class="section-title">${this._esc(s.title)}</div>${s.fields.map(f => `<div class="field"><div class="question">${this._esc(f.label)}</div><div class="answer">${f.value == null ? '—' : this._esc(f.value)}</div></div>`).join('')}</div>`).join('')}
      </div>`;
    }).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>${survey?.name || 'Informe'} - Reporte completo</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:10pt/1.5 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .cover{text-align:center;padding:48px 0 32px;border-bottom:3px solid #1FC95B;margin-bottom:24px}
        .cover img{width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B}
        .cover h1{font-size:20pt;margin:12px 0 4px}
        .cover .sub{font-size:10pt;color:#757575}
        .kpis{display:flex;gap:12px;justify-content:center;margin:20px 0 8px;flex-wrap:wrap}
        .kpi{background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;padding:8px 18px;text-align:center}
        .kpi-n{font-size:16pt;font-weight:800}
        .kpi-l{font-size:8pt;color:#757575;text-transform:uppercase;letter-spacing:.5px}
        .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:#AFF3C7;color:#15863D}
        .badge-pendiente{background:#e8eaed;color:#6b7280}.badge-en_proceso{background:#ebf5fb;color:#2563db}.badge-aprobada{background:#AFF3C7;color:#15863D}.badge-descartada{background:#fde2e2;color:#c0392b}
        .sheet{page-break-before:always;padding-top:8px}
        .sheet:first-of-type{page-break-before:avoid}
        .sheet-head{display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #1FC95B}
        .sheet-n{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#1FC95B;color:#fff;font-weight:800;font-size:11pt;flex-shrink:0}
        .sheet-name{font-size:14pt;font-weight:700}
        .sheet-meta{font-size:8pt;color:#757575;margin-top:2px}
        .sheet-head .badge{margin-left:auto}
        .section{margin-bottom:18px}
        .section-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#757575;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #e8eaed}
        .field{margin-bottom:10px;break-inside:avoid}
        .question{font-size:8pt;font-weight:600;color:#9aa0a6;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
        .answer{font-size:10pt;line-height:1.5}
        .footer{text-align:center;margin-top:24px;padding-top:8px;border-top:1px solid #e8eaed;font-size:7pt;color:#9aa0a6}
      </style></head><body>
      <div class="cover">
        <img src="${img}" alt="Grupo Nebak">
        <h1>${survey?.name || 'Reporte'}</h1>
        <div class="sub">Grupo Nebak · ${fecha} · ${rows.length} solicitudes</div>
        <div class="kpis">${dist}</div>
      </div>
      ${pages}
      <div class="footer">Generado por GN-Admin · Grupo Nebak · ${fecha} · Documento confidencial</div>
    </body></html>`;
  },

  exportContracto(c) {
    return this._printAsync(`Contrato-Adopcion-${c.adopcion_id || 'signed'}.pdf`, (logo) => this._buildContracto(c, logo));
  },

  _buildContracto(c, logo) {
    const fecha = c.fecha
      ? new Date(c.fecha + (c.fecha.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('es-ES');
    const fimg = (f) => (f && String(f).startsWith('data:') ? `<img class="firma-img" src="${f}" alt="Firma">` : '<div class="firma-fallback">[Sin firma]</div>');
    const f1Nombre = this._esc(c.f1_nombre || c.adoptante || '[adoptante]');
    const f1Dni = this._esc(c.f1_dni || '—');
    const f2Presente = c.f2_nombre || (c.f2_firma && String(c.f2_firma).startsWith('data:'));

    const firma2Block = f2Presente
      ? `<div class="signature">
          <div class="sig-label">Firmante 2 &middot; ${c.f2_rol || ''}</div>
          ${fimg(c.f2_firma)}
          <div class="sig-line">${this._esc(c.f2_nombre || 'Firma del firmante 2')} &middot; DNI ${this._esc(c.f2_dni || '')}</div>
        </div>`
      : `<div class="signature">
          <div class="sig-label">Por Grupo Nebak</div>
          <div class="firma-fallback">[Firma de la entidad]</div>
          <div class="sig-line">Asociacion Grupo Nebak</div>
        </div>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Contrato de Adopcion</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:11pt/1.6 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .header{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:3px solid #1FC95B;margin-bottom:24px}
        .logo{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B}
        .title{font-size:16pt;font-weight:800;color:#191919}
        .sub{font-size:9pt;color:#757575}
        h2{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15863D;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e8eaed}
        .grid{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:10pt}
        .grid>div{width:45%}
        .label{font-size:8pt;font-weight:600;color:#9aa0a6;text-transform:uppercase;letter-spacing:0.3px}
        .clausula{margin-bottom:10px;font-size:10pt;text-align:justify;break-inside:avoid}
        .clausula b{color:#191919}
        .signatures{display:flex;gap:48px;margin-top:48px;break-inside:avoid}
        .signature{flex:1}
        .sig-label{font-size:9pt;color:#757575;margin-bottom:4px}
        .firma-img{height:70px;object-fit:contain}
        .sig-line{border-top:1px solid #191919;margin-top:8px;padding-top:6px;font-size:9pt;font-weight:600}
        .firma-fallback{height:70px;display:flex;align-items:center;color:#999;font-style:italic}
        .footer{text-align:center;margin-top:40px;padding-top:10px;border-top:1px solid #e8eaed;font-size:8pt;color:#9aa0a6}
      </style></head><body>
      <div class="header">
        <img src="${logo || this._logoFallback}" class="logo" alt="Grupo Nebak">
        <div><div class="title">Contrato de Adopcion</div><div class="sub">Asociacion Grupo Nebak &middot; Expediente ${c.adopcion_id || c.id || ''}</div></div>
      </div>

      <p>En <b>${this._esc(c.ciudad || '[ciudad]')}</b>, a <b>${fecha}</b>, entre la <b>Asociacion Grupo Nebak</b> (en adelante, "la entidad") y <b>${f1Nombre}</b> con DNI <b>${f1Dni}</b>, en calidad de <b>${this._esc(c.f1_rol || 'adoptante')}</b>, se formaliza el presente contrato de adopcion responsable del animal:</p>

      <h2>1. Animal adoptado</h2>
      <div class="grid">
        <div><div class="label">Animal</div>${this._esc(c.animal || '—')}</div>
        <div><div class="label">Especie</div>${this._esc(c.especie || '—')}</div>
        <div><div class="label">Raza</div>${this._esc(c.raza || '—')}</div>
        <div><div class="label">Edad</div>${this._esc(c.edad || '—')}</div>
      </div>

      <h2>2. Firmante 1 · ${this._esc(c.f1_rol || 'Titular')}</h2>
      <div class="grid">
        <div><div class="label">Nombre</div>${f1Nombre}</div>
        <div><div class="label">DNI</div>${f1Dni}</div>
        <div><div class="label">Email</div>${this._esc(c.f1_email || '—')}</div>
        <div><div class="label">Telefono</div>${this._esc(c.f1_telefono || '—')}</div>
      </div>

      ${f2Presente ? `<h2>3. Firmante 2 · ${this._esc(c.f2_rol || 'Segundo firmante')}</h2>
      <div class="grid">
        <div><div class="label">Nombre</div>${this._esc(c.f2_nombre || '—')}</div>
        <div><div class="label">DNI</div>${this._esc(c.f2_dni || '—')}</div>
        <div><div class="label">Email</div>${this._esc(c.f2_email || '—')}</div>
        <div><div class="label">Telefono</div>${this._esc(c.f2_telefono || '—')}</div>
      </div>

      <h2>4. Compromisos del adoptante</h2>` : '<h2>3. Compromisos del adoptante</h2>'}
      <div class="clausula">a) Proporcionar al animal cuidados adecuados: alimentacion, acceso al veterinario, atencion y cariño, en un entorno seguro.</div>
      <div class="clausula">b) No ceder, vender ni regalar el animal a terceros sin consentimiento de la entidad. En caso de no poder continuar con el cuidado, la entidad se hará cargo de nuevo del animal.</div>
      <div class="clausula">c) Permitir el seguimiento por parte de la entidad durante el periodo posterior a la adopcion.</div>
      <div class="clausula">d) Mantener al animal identificado (microchip) y al dia en vacunaciones y desparasitaciones.</div>
      <div class="clausula">e) Asumir los gastos derivados del cuidado y la manutencion del animal.</div>

      <h2>${f2Presente ? '5' : '4'}. Firmas</h2>
      <div class="signatures">
        <div class="signature">
          <div class="sig-label">Firmante 1 · ${c.f1_rol || 'Titular'}</div>
          ${fimg(c.f1_firma)}
          <div class="sig-line">${f1Nombre} &middot; DNI ${f1Dni}</div>
        </div>
        ${firma2Block}
      </div>

      <div class="footer">Generado por GN-Admin · Grupo Nebak · ${new Date().toLocaleDateString('es-ES')}</div>
    </body></html>`;
  },

  _label(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  },

  // Apertura sincrona (no la bloquea el popup-blocker) + contenido async.
  async _printAsync(filename, build) {
    const w = (typeof window !== 'undefined') ? window.open('', '_blank') : null;
    if (!w) return;
    try { w.document.write('<html><head><meta charset="UTF-8"><title>' + filename + '</title></head><body style="font-family:Arial,sans-serif"><p>Generando informe...</p></body></html>'); w.document.close(); } catch {}
    const logo = await this._logoUrl();
    let content;
    try { content = await build(logo); }
    catch (err) { content = '<html><head><meta charset="UTF-8"></head><body><p>Error generando el informe.</p></body></html>'; }
    try {
      w.document.open();
      w.document.write(content);
      w.document.close();
      w.focus();
    } catch { return; }
    setTimeout(() => { try { if (!w.closed) w.print(); } catch {} }, 400);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = PdfExport;
