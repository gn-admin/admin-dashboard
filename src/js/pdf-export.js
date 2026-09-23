/**
 * Exportación a PDF - Individual y completa.
 */

const PdfExport = {

  exportSingleResponse(row, survey) {
    const content = this._buildSingleReport(row, survey);
    this._openPrintWindow(content, `Informe-${row.id}.pdf`);
  },

  exportAllResponses(responses, survey) {
    const content = this._buildFullReport(responses, survey);
    this._openPrintWindow(content, `Informe-${survey?.id || 'encuesta'}.pdf`);
  },

  _buildSingleReport(row, survey) {
    const date = row.fecha_creacion
      ? new Date(row.fecha_creacion).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    const sections = typeof Dashboard !== 'undefined' ? Dashboard._buildSections(row, survey?.id) : [];

    const sectionsHtml = sections.map(s => `
      <div class="section">
        <div class="section-title">${s.title}</div>
        ${s.fields.map(f => `
          <div class="field">
            <div class="question">${f.label}</div>
            <div class="answer">${f.value ?? '—'}</div>
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
        .section{margin-bottom:20px}
        .section-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#757575;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #e8eaed}
        .field{margin-bottom:12px}
        .question{font-size:8pt;font-weight:600;color:#9aa0a6;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:3px}
        .answer{font-size:10pt;color:#191919;line-height:1.5}
        .footer{text-align:center;margin-top:32px;padding-top:12px;border-top:1px solid #e8eaed;font-size:8pt;color:#9aa0a6}
      </style></head><body>
      <div class="report-header">
        <img src="https://static.wixstatic.com/media/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg/v1/fill/w_96,h_96,al_c,q_80/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg" class="report-logo" alt="Grupo Nebak">
        <div class="avatar">${(row.nombre?.[0]||'')+(row.apellidos?.[0]||'')}</div>
        <div>
          <div class="name">${row.nombre} ${row.apellidos}</div>
          <div class="meta">${row.email} · ${date}</div>
          ${survey ? `<span class="badge">${survey.name}</span>` : ''}
        </div>
      </div>
      ${sectionsHtml}
      <div class="footer">
        Generado por GN-Encuestas · Grupo Nebak · ${new Date().toLocaleDateString('es-ES')} · Documento confidencial
      </div>
    </body></html>`;
  },

  _buildFullReport(responses, survey) {
    const headers = responses.length > 0
      ? Object.keys(responses[0]).filter(h => h.charAt(0) !== '_' && !['userId','nombre','apellidos','email','fecha_creacion'].includes(h))
      : [];

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>${survey?.name || 'Informe'} - Reporte completo</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:10pt/1.4 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .header{text-align:center;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #1FC95B}
        h1{font-size:16pt;color:#191919;margin:0}
        .sub{font-size:9pt;color:#757575;margin-top:4px}
        table{width:100%;border-collapse:collapse;font-size:8pt}
        th{background:#1FC95B;color:#fff;padding:6px 8px;text-align:left;font-weight:600}
        td{padding:5px 8px;border-bottom:1px solid #e8eaed}
        tr:nth-child(even){background:#f9fafb}
        .footer{text-align:center;margin-top:24px;padding-top:8px;border-top:1px solid #e8eaed;font-size:7pt;color:#9aa0a6}
      </style></head><body>
      <div class="header" style="display:flex;align-items:center;gap:16px;text-align:left">
        <img src="https://static.wixstatic.com/media/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg/v1/fill/w_96,h_96,al_c,q_80/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B" alt="Grupo Nebak">
        <div>
          <h1>${survey?.name || 'Reporte'}</h1>
          <div class="sub">${new Date().toLocaleDateString('es-ES')} · ${responses.length} solicitudes</div>
        </div>
      </div>
      <table><thead><tr>
        ${headers.map(h => `<th>${this._label(h)}</th>`).join('')}
      </tr></thead><tbody>
        ${responses.map(row => `<tr>${headers.map(h => `<td>${row[h]??'—'}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <div class="footer">GN-Encuestas · Grupo Nebak · Documento confidencial</div>
    </body></html>`;
  },

  exportContracto(c) {
    const content = this._buildContracto(c);
    this._openPrintWindow(content, `Contrato-Adopcion-${c.adopcion_id || 'signed'}.pdf`);
  },

  _buildContracto(c) {
    const fecha = c.fecha
      ? new Date(c.fecha + (c.fecha.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('es-ES');
    const fimg = (f) => (f && String(f).startsWith('data:') ? `<img class="firma-img" src="${f}" alt="Firma">` : '<div class="firma-fallback">[Sin firma]</div>');
    const f1Nombre = c.f1_nombre || c.adoptante || '[adoptante]';
    const f1Dni = c.f1_dni || '—';
    const f2Presente = c.f2_nombre || (c.f2_firma && String(c.f2_firma).startsWith('data:'));

    const firma2Block = f2Presente
      ? `<div class="signature">
          <div class="sig-label">Firmante 2 &middot; ${c.f2_rol || ''}</div>
          ${fimg(c.f2_firma)}
          <div class="sig-line">${c.f2_nombre || 'Firma del firmante 2'} &middot; DNI ${c.f2_dni || ''}</div>
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
        .clausula{margin-bottom:10px;font-size:10pt;text-align:justify}
        .clausula b{color:#191919}
        .signatures{display:flex;gap:48px;margin-top:48px}
        .signature{flex:1}
        .sig-label{font-size:9pt;color:#757575;margin-bottom:4px}
        .firma-img{height:70px;object-fit:contain}
        .sig-line{border-top:1px solid #191919;margin-top:8px;padding-top:6px;font-size:9pt;font-weight:600}
        .firma-fallback{height:70px;display:flex;align-items:center;color:#999;font-style:italic}
        .footer{text-align:center;margin-top:40px;padding-top:10px;border-top:1px solid #e8eaed;font-size:8pt;color:#9aa0a6}
      </style></head><body>
      <div class="header">
        <img src="https://static.wixstatic.com/media/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg/v1/fill/w_96,h_96,al_c,q_80/ef25d5_6d0863724c2041aeac7b5291f0433409~mv2.jpg" class="logo" alt="Grupo Nebak">
        <div><div class="title">Contrato de Adopcion</div><div class="sub">Asociacion Grupo Nebak &middot; Expediente ${c.adopcion_id || c.id || ''}</div></div>
      </div>

      <p>En <b>${c.ciudad || '[ciudad]'}</b>, a <b>${fecha}</b>, entre la <b>Asociacion Grupo Nebak</b> (en adelante, "la entidad") y <b>${f1Nombre}</b> con DNI <b>${f1Dni}</b>, en calidad de <b>${c.f1_rol || 'adoptante'}</b>, se formaliza el presente contrato de adopcion responsable del animal:</p>

      <h2>1. Animal adoptado</h2>
      <div class="grid">
        <div><div class="label">Animal</div>${c.animal || '—'}</div>
        <div><div class="label">Especie</div>${c.especie || '—'}</div>
        <div><div class="label">Raza</div>${c.raza || '—'}</div>
        <div><div class="label">Edad</div>${c.edad || '—'}</div>
      </div>

      <h2>2. Firmante 1 · ${c.f1_rol || 'Titular'}</h2>
      <div class="grid">
        <div><div class="label">Nombre</div>${f1Nombre}</div>
        <div><div class="label">DNI</div>${f1Dni}</div>
        <div><div class="label">Email</div>${c.f1_email || '—'}</div>
        <div><div class="label">Telefono</div>${c.f1_telefono || '—'}</div>
      </div>

      ${f2Presente ? `<h2>3. Firmante 2 · ${c.f2_rol || 'Segundo firmante'}</h2>
      <div class="grid">
        <div><div class="label">Nombre</div>${c.f2_nombre || '—'}</div>
        <div><div class="label">DNI</div>${c.f2_dni || '—'}</div>
        <div><div class="label">Email</div>${c.f2_email || '—'}</div>
        <div><div class="label">Telefono</div>${c.f2_telefono || '—'}</div>
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

  _openPrintWindow(html, filename) {
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = PdfExport;
