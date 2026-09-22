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
