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

  // Mismo formato estandar que la app: AAAA/MM/DD [hh:mm AM|PM].
  // Dashboard es la fuente unica cuando esta disponible; el fallback cubre
  // los tests y cualquier uso aislado del generador de PDF.
  _hoy() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  },

  _fmtFecha(v) {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof Dashboard !== 'undefined' && Dashboard && typeof Dashboard._fmtFecha === 'function') {
      const out = Dashboard._fmtFecha(v);
      if (out !== '—' && out !== String(v)) return out;
    }
    const s = String(v).trim();
    if (!s) return '—';
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return s;
    const pad = n => String(n).padStart(2, '0');
    const fecha = `${m[1]}/${m[2]}/${m[3]}`;
    if (!m[4]) return fecha;
    const h = +m[4];
    return `${fecha} ${pad(h % 12 || 12)}:${m[5]} ${h >= 12 ? 'PM' : 'AM'}`;
  },

  _buildSingleReport(row, survey, logo, nota) {
    const sid = (survey && survey.id) || row._surveyId || '';
    const estado = (typeof Dashboard !== 'undefined' && sid) ? Dashboard.getEstado(row.id, sid) : '';
    const estBadge = estado ? `<span class="badge badge-${estado}">${this._esc(estado.replace(/_/g, ' '))}</span>` : '';
    const img = logo || this._logoFallback;
    const date = this._fmtFecha(row.fecha_creacion);

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
        Generado por GN-Encuestas · Grupo Nebak · ${this._hoy()} · Documento confidencial
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
    const fecha = this._hoy();
    const img = logo || this._logoFallback;
    const order = ['pendiente', 'en_proceso', 'aprobada', 'descartada'];
    const dist = order.filter(k => counts[k]).map(k => `<div class="kpi"><div class="kpi-n">${counts[k]}</div><div class="kpi-l">${k.replace(/_/g, ' ')}</div></div>`).join('');

    const pages = rows.map(({ row, estado }, i) => {
      const sections = (typeof Dashboard !== 'undefined') ? Dashboard._buildSections(row, sid) : [];
      const who = [row.nombre, row.apellidos].filter(Boolean).join(' ').trim() || ('Solicitud ' + (row.id || (i + 1)));
      return `<div class="sheet">
        <div class="sheet-head"><span class="sheet-n">${i + 1}</span>
          <div><div class="sheet-name">${this._esc(who)}</div>
          <div class="sheet-meta">${this._esc(row.email || '')}${row.fecha_creacion ? ' · ' + this._esc(this._fmtFecha(row.fecha_creacion)) : ''}</div></div>
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

  exportTerminosAdopcion(c) {
    return this._printAsync(`Terminos-Adopcion-${c.adopcion_id || 'signed'}.pdf`, (logo) => this._buildTerminosAdopcion(c, logo));
  },

  _buildTerminosAdopcion(c, logo) {
    const body = (typeof Dashboard !== 'undefined' && Dashboard._terminosAdopcionCuerpo)
      ? Dashboard._terminosAdopcionCuerpo({}, c || {}, logo)
      : '<p>No se pudo cargar el documento de términos y condiciones.</p>';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Términos y condiciones de adopción</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:11pt/1.6 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .contrato-doc{font-size:10.5pt;line-height:1.55}
        .contrato-doc-header{display:flex;align-items:center;gap:16px;padding-bottom:16px;margin-bottom:20px;border-bottom:3px solid #1FC95B;break-inside:avoid}
        .contrato-doc-header img{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B;flex-shrink:0}
        .contrato-doc-title{font-size:16pt;font-weight:800;color:#191919}
        .contrato-doc-sub{font-size:9pt;color:#757575}
        .contrato-doc-meta{display:flex;flex-wrap:wrap;gap:8px 28px;padding:12px 14px;margin-bottom:18px;background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;font-size:9.5pt;break-inside:avoid}
        .contrato-doc-meta .label{display:block;font-size:7.5pt;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:#9aa0a6}
        .contrato-doc h3{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15863D;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e8eaed;break-after:avoid}
        .contrato-doc p{margin:0 0 9px;text-align:justify}
        .contrato-doc-entidad{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:12px 14px;margin:0 0 18px;border:1px solid #e8eaed;border-radius:8px;background:#f9fafb;break-inside:avoid}
        .contrato-doc-entidad-datos{flex:1;min-width:0;font-size:9pt;color:#4b5563;line-height:1.55}
        .contrato-doc-entidad-datos b{display:block;color:#191919;font-size:10pt}
        .contrato-doc-entidad-datos span{display:block;overflow-wrap:anywhere}
        .contrato-doc-entidad-rol{color:#6b7280;font-size:8pt;margin-bottom:4px}
        .contrato-doc-sello{width:94px;height:94px;flex:0 0 94px;border:2px solid #15863D;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;transform:rotate(-8deg);color:#15863D;background:#fff}
        .contrato-doc-sello-inner{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px}
        .contrato-doc-sello img{width:24px;height:24px;border-radius:50%;object-fit:cover}
        .contrato-doc-sello span{font-size:6.5pt;font-weight:800;line-height:1.15;text-transform:uppercase}
        .contrato-doc-sello small{font-size:5.5pt;font-weight:700;letter-spacing:.3px}
        .contrato-doc-firmas{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:28px;margin-top:30px;break-inside:avoid}
        .contrato-doc-firma{padding-top:6px;border-top:1px solid #191919;font-size:9pt;color:#4b5563}
        .contrato-doc-firma-label{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#6b7280}
        .contrato-doc-firma b{display:block;margin-top:4px}
        .contrato-doc-firma small{display:block;margin-top:2px;color:#6b7280}
        .contrato-doc-firma-img{height:58px;max-width:100%;object-fit:contain;display:block;margin-top:4px}
        .contrato-doc-sello--firma{margin-top:6px}
        .contrato-doc-nota{margin-top:18px;padding:10px 12px;border-radius:8px;background:#ebf5fb;color:#374151;font-size:8pt}
      </style></head><body><div class="contrato-doc">${body}</div></body></html>`;
  },

  _buildContracto(c, logo) {
    const fecha = this._fmtFecha(c.fecha || this._hoy());
    const fmtFecha = f => this._fmtFecha(f);
    const fimg = (f) => (f && String(f).startsWith('data:') ? `<img class="firma-img" src="${this._esc(f)}" alt="Firma">` : '<div class="firma-fallback">[Sin firma]</div>');
    const f1Nombre = this._esc(c.f1_nombre || c.adoptante || '[adoptante]');
    const f1Dni = this._esc(c.f1_dni || '—');
    const f2Nombre = String(c.f2_nombre || '').trim();
    const f2Rol = String(c.f2_rol || '').trim();
    const f2EsEntidad = /entidad|asociaci[oó]n|grupo\s*nebak/i.test(f2Rol + ' ' + f2Nombre);
    const tutor = f2Nombre && !f2EsEntidad ? c : null;
    const entidadFirma = !tutor && c.f2_firma && String(c.f2_firma).startsWith('data:') ? c.f2_firma : '';
    const ent = (typeof Dashboard !== 'undefined' && Dashboard._contratoEntidadDatos)
      ? Dashboard._contratoEntidadDatos(c)
      : { nombre: c.entidad_nombre || 'Asociación Grupo Nebak', cif: c.entidad_cif || '', domicilio: c.entidad_domicilio || '', email: c.entidad_email || '', telefono: c.entidad_telefono || '', registro: c.entidad_registro || '', web: c.entidad_web || '' };
    const entDato = (label, value) => value ? `<span><b>${this._esc(label)}:</b> ${this._esc(value)}</span>` : '';
    const sello = `<div class="sello" aria-label="Sello de la entidad"><div class="sello-inner"><img src="${this._esc(logo || this._logoFallback)}" alt=""><span>${this._esc(ent.nombre)}</span><small>SELLO DE LA ENTIDAD</small></div></div>`;
    const entidadHtml = `<div class="entidad"><div class="entidad-datos"><b>${this._esc(ent.nombre)}</b><span class="entidad-rol">Entidad de protección animal</span>${entDato('CIF', ent.cif)}${entDato('Domicilio', ent.domicilio)}${entDato('Registro', ent.registro)}${entDato('Email', ent.email)}${entDato('Teléfono', ent.telefono)}${entDato('Web', ent.web)}</div>${sello}</div>`;

    // Los contratos nuevos guardan una copia de los datos del animal al firmar.
    // Para contratos antiguos, o campos nuevos, se completa desde la ficha viva.
    let animal = {
      nombre: c.animal || '',
      foto: c.animal_foto || '',
      especie: c.especie || '',
      raza: c.raza || '',
      edad: c.edad || '',
      sexo: c.animal_sexo || '',
      microchip: c.animal_microchip || '',
      fecha_nacimiento: c.animal_fecha_nacimiento || '',
      peso: c.animal_peso || '',
      esterilizada: c.animal_esterilizada,
      descripcion: c.animal_descripcion || ''
    };
    try {
      if (typeof Dashboard !== 'undefined' && Dashboard._contratoAnimalDatos) {
        const p = c.adopcion_id && Dashboard._byId
          ? Dashboard._byId(Dashboard.adopciones || [], c.adopcion_id)
          : null;
        const live = Dashboard._contratoAnimalDatos(p, c) || {};
        const val = (saved, fallback) => (saved !== undefined && saved !== null && saved !== '') ? saved : (fallback || '');
        animal = {
          nombre: val(c.animal, live.nombre),
          foto: val(c.animal_foto, live.foto),
          especie: val(c.especie, live.especie),
          raza: val(c.raza, live.raza),
          edad: val(c.edad, live.edad),
          sexo: val(c.animal_sexo, live.sexo),
          microchip: val(c.animal_microchip, live.microchip),
          fecha_nacimiento: val(c.animal_fecha_nacimiento, live.fecha_nacimiento),
          peso: val(c.animal_peso, live.peso),
          esterilizada: val(c.animal_esterilizada, live.esterilizada),
          descripcion: val(c.animal_descripcion, live.descripcion)
        };
      }
    } catch (e) { /* PDF autonomo: si no hay Dashboard, usa los datos guardados */ }

    const siNo = v => (v === true || /^(si|sí|true|1)$/i.test(String(v)))
      ? 'Si'
      : ((v === false || /^(no|false|0)$/i.test(String(v))) ? 'No' : '—');
    const field = (label, value, cls) => `<div${cls ? ` class="${cls}"` : ''}><div class="label">${this._esc(label)}</div>${this._esc(value || '—')}</div>`;
    let fotoSrc = animal.foto || '';
    if (fotoSrc && !/^(data:|https?:|blob:)/i.test(fotoSrc) && typeof document !== 'undefined') {
      try { fotoSrc = new URL(fotoSrc, document.baseURI).href; } catch { /* ruta no valida: se deja tal cual */ }
    }
    const foto = fotoSrc
      ? `<img class="animal-photo" src="${this._esc(fotoSrc)}" alt="${this._esc(animal.nombre || 'Animal')}">`
      : '<div class="animal-photo animal-photo--empty">Sin foto</div>';
    const tutorHtml = tutor ? `
      <div class="page-break"></div>
      <h2>ANEXO I. Datos del tutor o persona de apoyo</h2>
      <div class="grid">
        ${field('Nombre', tutor.f2_nombre)}
        ${field('DNI', tutor.f2_dni)}
        ${field('Relacion con el adoptante', tutor.f2_relacion || tutor.f2_rol)}
        ${field('Domicilio', tutor.f2_direccion)}
        ${field('Email', tutor.f2_email)}
        ${field('Telefono', tutor.f2_telefono)}
      </div>
      <p class="nota">La persona tutora se compromete a asumir el cuidado del animal si el adoptante no pudiera hacerlo. Su firma es obligatoria y firma este contrato junto al adoptante.</p>` : '';
    const firma = (label, nombre, dni, firmaData, alt) => `<div class="signature">
      <div class="sig-label">${this._esc(label)}</div>
      ${firmaData ? `<img class="firma-img" src="${this._esc(firmaData)}" alt="${alt}">` : '<div class="firma-fallback">[Sin firma]</div>'}
      <div class="sig-line">${this._esc(nombre)}${dni ? ' &middot; DNI ' + this._esc(dni) : ''}</div>
    </div>`;
    const firmaAdoptante = firma('Adoptante', c.f1_nombre || c.adoptante || '[adoptante]', c.f1_dni, c.f1_firma, 'Firma del adoptante');
    const firmaTutor = tutor ? firma('Tutor / persona de apoyo', tutor.f2_nombre, tutor.f2_dni, tutor.f2_firma, 'Firma del tutor') : '';
    const firmaEntidad = `<div class="signature">
      <div class="sig-label">Por la entidad (firma y sello)</div>
      ${entidadFirma ? `<img class="firma-img" src="${this._esc(entidadFirma)}" alt="Firma de la entidad">` : ''}
      ${sello}
      <div class="sig-line">${this._esc(ent.nombre)}</div>
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
        h2{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15863D;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e8eaed;break-after:avoid}
        .grid{display:flex;flex-wrap:wrap;gap:4px 24px;font-size:10pt}
        .grid>div{width:45%}
        .grid-full{width:100%!important}
        .label{font-size:8pt;font-weight:600;color:#9aa0a6;text-transform:uppercase;letter-spacing:0.3px}
        .animal{display:flex;gap:16px;align-items:flex-start;margin-bottom:18px;break-inside:avoid}
        .animal-photo{width:125px;height:125px;object-fit:cover;border:2px solid #1FC95B;border-radius:8px;flex-shrink:0;display:block}
        .animal-photo--empty{display:flex;align-items:center;justify-content:center;background:#f4f5f7;color:#9aa0a6;font-size:8pt;text-align:center;padding:8px}
        .animal-data{flex:1;min-width:0}
        .nota{font-size:9pt;color:#757575;margin:6px 0 0}
        .clausula{margin-bottom:10px;font-size:10pt;text-align:justify;break-inside:avoid}
        .clausula b{color:#191919}
        .signatures{display:flex;gap:48px;margin-top:40px;break-inside:avoid}
        .signatures--three{gap:24px}
        .signature{flex:1;min-width:0}
        .sig-label{font-size:9pt;color:#757575;margin-bottom:4px}
        .firma-img{height:70px;max-width:100%;object-fit:contain;display:block}
        .sig-line{border-top:1px solid #191919;margin-top:8px;padding-top:6px;font-size:9pt;font-weight:600}
        .firma-fallback{height:70px;display:flex;align-items:center;color:#999;font-style:italic}
        .entidad{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:12px 14px;margin-bottom:18px;background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;break-inside:avoid}
        .entidad-datos{flex:1;min-width:0;font-size:9pt;color:#4b5563;line-height:1.55}
        .entidad-datos b{display:block;color:#191919;font-size:10pt}
        .entidad-datos span{display:block;overflow-wrap:anywhere}
        .entidad-rol{color:#6b7280;font-size:8pt;margin-bottom:4px}
        .sello{width:94px;height:94px;flex:0 0 94px;border:2px solid #15863D;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;transform:rotate(-8deg);color:#15863D;background:#fff}
        .sello-inner{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px}
        .sello img{width:24px;height:24px;border-radius:50%;object-fit:cover}
        .sello span{font-size:6.5pt;font-weight:800;line-height:1.15;text-transform:uppercase}
        .sello small{font-size:5.5pt;font-weight:700;letter-spacing:.3px}
        .page-break{break-before:page;page-break-before:always}
        .footer{text-align:center;margin-top:32px;padding-top:10px;border-top:1px solid #e8eaed;font-size:8pt;color:#9aa0a6}
      </style></head><body>
      <div class="header">
        <img src="${logo || this._logoFallback}" class="logo" alt="Grupo Nebak">
        <div><div class="title">Contrato de Adopcion Responsable</div><div class="sub">${this._esc(ent.nombre)} &middot; Expediente ${this._esc(c.adopcion_id || c.id || '')}</div></div>
      </div>

      ${entidadHtml}

      <p>En <b>${this._esc(c.ciudad || '[ciudad]')}</b>, a <b>${fecha}</b>, <b>REUNIDOS</b>.</p>
      <p>De una parte, <b>${this._esc(ent.nombre)}</b>${ent.cif ? `, con CIF <b>${this._esc(ent.cif)}</b>` : ''}${ent.domicilio ? `, con domicilio en <b>${this._esc(ent.domicilio)}</b>` : ''}, en adelante, <b>la Entidad</b>. De otra parte, <b>${f1Nombre}</b>, con DNI <b>${f1Dni}</b>${c.f1_direccion ? ` y domicilio en <b>${this._esc(c.f1_direccion)}</b>` : ''}, en adelante, <b>el Adoptante</b>${tutor ? `, con la intervencion de <b>${this._esc(tutor.f2_nombre)}</b>, en adelante, <b>el Tutor</b>` : ''}.</p>
      <p><b>EXPONEN</b></p>
      <p>I. Que la Entidad es una asociacion de proteccion animal sin animo de lucro dedicada a la acogida, cuidado y adopcion responsable de animales.</p>
      <p>II. Que el Adoptante desea adoptar al animal <b>${this._esc(animal.nombre || '[animal]')}</b> y se compromete a asumir su cuidado y bienestar durante toda su vida.</p>
      <p>III. Que ambas partes reconocen tener capacidad suficiente para formalizar este contrato y, a tal efecto, acuerdan las siguientes <b>CLAUSULAS</b>.</p>

      <h2>1. Datos de adopcion</h2>
      <div class="animal">
        ${foto}
        <div class="animal-data"><div class="grid">
          ${field('Nombre', animal.nombre)}
          ${field('Especie', animal.especie)}
          ${field('Raza', animal.raza)}
          ${field('Sexo', animal.sexo)}
          ${field('Edad', animal.edad)}
          ${field('Fecha de nacimiento', fmtFecha(animal.fecha_nacimiento))}
          ${field('Microchip', animal.microchip)}
          ${field('Peso', animal.peso)}
          ${field('Esterilizacion', siNo(animal.esterilizada))}
          ${field('Otras resenas', animal.descripcion, 'grid-full')}
        </div></div>
      </div>

      <h2>2. Datos del adoptante</h2>
      <div class="grid">
        ${field('Nombre y apellidos', c.f1_nombre || c.adoptante || '[adoptante]')}
        ${field('DNI', c.f1_dni)}
        ${field('Domicilio', c.f1_direccion)}
        ${field('Email', c.f1_email)}
        ${field('Telefono', c.f1_telefono)}
      </div>

      ${tutorHtml}

      <h2>${tutor ? '4' : '3'}. Estipulaciones</h2>
      <div class="clausula"><b>1.</b> El adoptante se compromete a adoptar al animal como animal de compania y a proporcionarle durante toda su vida alimentacion, agua, higiene, atencion veterinaria, ejercicio y un entorno seguro.</div>
      <div class="clausula"><b>2.</b> El animal no se utilizara para cria, caza, peleas, experimentacion, guarda de propiedades, circos, espectaculos ni fines lucrativos. No permanecera atado ni encerrado en jaulas, habitaciones, terrazas, patios o garajes.</div>
      <div class="clausula"><b>3.</b> El adoptante mantendra al animal identificado con microchip y al dia en vacunaciones y desparasitaciones, y facilitara el acceso a la cartilla sanitaria.</div>
      <div class="clausula"><b>4.</b> Si procede, el adoptante se compromete a esterilizar al animal y a aportar a la entidad el informe veterinario acreditativo.</div>
      <div class="clausula"><b>5.</b> No se podra vender, regalar ni ceder el animal por ningun titulo sin autorizacion expresa de la entidad. En caso de no poder continuar con su cuidado, el adoptante debera devolverlo a la entidad, nunca abandonarlo.</div>
      <div class="clausula"><b>6.</b> El adoptante comunicara a la entidad cualquier cambio de domicilio o telefono, asi como la perdida, robo, desaparicion o fallecimiento del animal.</div>
      <div class="clausula"><b>7.</b> El adoptante permitira las visitas y comprobaciones de seguimiento de la entidad y asumira los gastos derivados del cuidado del animal.</div>
      <div class="clausula"><b>8.</b> El incumplimiento de estas obligaciones facultara a la entidad para recuperar el animal y ejercer las acciones legales que correspondan.</div>
      <div class="clausula"><b>9.</b> Los datos personales del adoptante y, en su caso, del tutor se utilizan para gestionar la adopcion, el seguimiento y las obligaciones legales de la entidad. El interesado puede ejercer sus derechos de acceso, rectificacion, supresion y oposicion ante la entidad.</div>
      <div class="clausula"><b>10.</b> El Adoptante declara haber leido y comprendido el documento de terminos y condiciones de adopcion responsable, que forma parte de este contrato, y acepta expresamente todas sus obligaciones.</div>
      ${tutor ? '<div class="clausula"><b>11.</b> La persona tutora se compromete a asumir el cuidado del animal si el adoptante no pudiera hacerlo. Su firma es obligatoria y firma este contrato junto al adoptante.</div>' : ''}

      <h2>${tutor ? '5' : '4'}. Firmas</h2>
      <div class="signatures${tutor ? ' signatures--three' : ''}">
        ${firmaAdoptante}
        ${firmaTutor}
        ${firmaEntidad}
      </div>

      <div class="footer">Generado por GN-Admin · Grupo Nebak · ${this._hoy()}</div>
    </body></html>`;
  },

  exportContratoAcogida(c) {
    const id = (c && (c.id || (c.animal && c.animal.nombre))) || 'documento';
    return this._printAsync(`Contrato-Acogida-${id}.pdf`, (logo) => this._buildContratoAcogida(c, logo));
  },

  // Documento opcional de acogida temporal. Se construye con los datos que ya
  // existen en el caso, sin guardar nada nuevo ni condicionar las fases.
  _contratoAcogidaBody(c, logo) {
    const caso = c || {};
    const animal = caso.animal || {};
    const familia = caso.familia || {};
    const fecha = this._fmtFecha(caso.fecha || this._hoy());
    const inicio = caso.inicio ? this._fmtFecha(caso.inicio) : '—';
    const fase = ({ entrega: 'Entrega', en_casa: 'En casa', finalizada: 'Finalizada' })[caso.fase] || caso.fase || 'Acogida';
    const ciudad = caso.ciudad || familia.ubicacion || '[ciudad]';
    const nombre = familia.nombre || '[familia acogedora]';
    const field = (label, value) => `<div><span class="label">${this._esc(label)}</span>${this._esc(value || '—')}</div>`;
    const siNo = v => (v === true || /^(si|sí|true|1)$/i.test(String(v)))
      ? 'Si'
      : ((v === false || /^(no|false|0)$/i.test(String(v))) ? 'No' : '—');
    let foto = animal.foto || '';
    if (foto && !/^(data:|https?:|blob:)/i.test(foto) && typeof document !== 'undefined') {
      try { foto = new URL(foto, document.baseURI).href; } catch { /* ruta no valida: se deja tal cual */ }
    }
    const fotoHtml = foto
      ? `<img src="${this._esc(foto)}" alt="${this._esc(animal.nombre || 'Animal')}">`
      : '<div class="contrato-doc-foto-vacia">Sin foto</div>';
    return `
      <div class="contrato-doc-header">
        <img src="${this._esc(logo || 'assets/icons/logo-nebak.jpg')}" alt="Grupo Nebak">
        <div><div class="contrato-doc-title">Contrato de acogida temporal</div><div class="contrato-doc-sub">Asociación Grupo Nebak · Expediente ${this._esc(caso.id || '—')}</div></div>
      </div>
      <div class="contrato-doc-meta">
        <div><span class="label">Familia acogedora</span><b>${this._esc(nombre)}</b></div>
        <div><span class="label">Animal</span><b>${this._esc(animal.nombre || '—')}</b></div>
        <div><span class="label">Inicio</span>${this._esc(inicio)}</div>
        <div><span class="label">Fase</span>${this._esc(fase)}</div>
      </div>
      <p>En <b>${this._esc(ciudad)}</b>, a <b>${this._esc(fecha)}</b>, entre la <b>Asociación Grupo Nebak</b> (en adelante, "la entidad") y <b>${this._esc(nombre)}</b>, con DNI/NIE <b>${this._esc(familia.dni || '—')}</b>, se formaliza el presente <b>contrato de acogida temporal</b> del animal:</p>

      <h3>1. Datos del animal</h3>
      <div class="contrato-doc-animal">
        <div class="contrato-doc-foto">${fotoHtml}</div>
        <div class="contrato-doc-datos contrato-doc-grid">
          ${field('Nombre', animal.nombre)}
          ${field('Especie', animal.especie)}
          ${field('Raza', animal.raza)}
          ${field('Sexo', animal.sexo)}
          ${field('Edad', animal.edad)}
          ${field('Fecha de nacimiento', animal.fecha_nacimiento ? this._fmtFecha(animal.fecha_nacimiento) : '')}
          ${field('Microchip', animal.microchip)}
          ${field('Peso', animal.peso)}
          ${field('Esterilización', siNo(animal.esterilizada))}
        </div>
      </div>
      ${animal.descripcion ? `<p><b>Descripción:</b> ${this._esc(animal.descripcion)}</p>` : ''}

      <h3>2. Datos de la familia acogedora</h3>
      <div class="contrato-doc-grid">
        ${field('Nombre y apellidos', nombre)}
        ${field('DNI/NIE', familia.dni)}
        ${field('Domicilio', familia.direccion)}
        ${field('Email', familia.email)}
        ${field('Teléfono', familia.telefono)}
        ${field('Ubicación', familia.ubicacion)}
      </div>

      <h3>3. Datos de la acogida</h3>
      <div class="contrato-doc-grid">
        ${field('Fecha de inicio', inicio)}
        ${field('Fase actual', fase)}
        ${field('Carácter', 'Temporal')}
        ${field('Expediente', caso.id)}
      </div>
      <p>La acogida se mantiene hasta que la entidad y la familia acuerden el retorno del animal o su paso a adopción.</p>

      <h3>4. Condiciones</h3>
      <p><b>1. Carácter temporal.</b> El animal permanece bajo la titularidad de la entidad. La familia acogedora lo tiene en custodia temporal y no adquiere derechos de propiedad sobre él.</p>
      <p><b>2. Cuidados.</b> La familia se compromete a proporcionarle alimentación, agua, higiene, refugio, ejercicio, compañía y un trato responsable, adaptados a su especie y necesidades.</p>
      <p><b>3. Salud y veterinario.</b> Seguirá las indicaciones de la entidad y las pautas veterinarias, y comunicará sin demora cualquier problema de salud, accidente o urgencia.</p>
      <p><b>4. Prohibiciones.</b> No podrá vender, regalar, ceder, criar ni abandonar al animal, ni utilizarlo para fines lucrativos, de guarda o espectáculos.</p>
      <p><b>5. Devolución.</b> Si no puede continuar con la acogida, deberá avisar a la entidad y devolverle el animal. Nunca lo abandonará ni lo entregará a terceros sin autorización.</p>
      <p><b>6. Seguimiento.</b> La familia facilitará el contacto y las visitas de seguimiento de la entidad e informará de cualquier cambio de domicilio o teléfono, pérdida, robo, desaparición o fallecimiento del animal.</p>
      <p><b>7. Gastos.</b> Los gastos ordinarios y extraordinarios se acordarán previamente con la entidad. La familia conservará los justificantes y los pondrá a disposición de la entidad.</p>
      <p><b>8. Incumplimiento.</b> El incumplimiento de estas condiciones facultará a la entidad para recuperar al animal y ejercer las acciones que correspondan.</p>

      <h3>5. Firmas</h3>
      <div class="contrato-doc-firmas">
        <div class="contrato-doc-firma">
          <div class="contrato-doc-firma-label">Familia acogedora</div>
          <div class="contrato-doc-firma-espacio"></div>
          <b>${this._esc(nombre)}</b><small>DNI/NIE ${this._esc(familia.dni || '—')}</small>
        </div>
        <div class="contrato-doc-firma">
          <div class="contrato-doc-firma-label">Por Grupo Nebak</div>
          <div class="contrato-doc-firma-espacio"></div>
          <b>Asociación Grupo Nebak</b><small>Entidad</small>
        </div>
      </div>
      <div class="contrato-doc-nota"><b>Documento opcional.</b> Es un apoyo para el expediente y para firmar en papel. No es obligatorio y no bloquea el avance de la acogida.</div>`;
  },

  _buildContratoAcogida(c, logo) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Contrato de Acogida</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:11pt/1.6 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .contrato-doc{font-size:10.5pt;line-height:1.55}
        .contrato-doc-header{display:flex;align-items:center;gap:16px;padding-bottom:16px;margin-bottom:20px;border-bottom:3px solid #1FC95B}
        .contrato-doc-header img{width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B;flex-shrink:0}
        .contrato-doc-title{font-size:16pt;font-weight:800;color:#191919}
        .contrato-doc-sub{font-size:9pt;color:#757575}
        .contrato-doc-meta{display:flex;flex-wrap:wrap;gap:8px 28px;padding:12px 14px;margin-bottom:18px;background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;font-size:9.5pt}
        .contrato-doc-meta .label{display:block;font-size:7.5pt;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:#9aa0a6}
        .contrato-doc h3{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15863D;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #e8eaed;break-after:avoid}
        .contrato-doc p{margin:0 0 9px;text-align:justify}
        .contrato-doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:10pt}
        .contrato-doc-grid .label{display:block;font-size:7.5pt;font-weight:600;text-transform:uppercase;letter-spacing:.3px;color:#9aa0a6}
        .contrato-doc-animal{display:flex;gap:16px;align-items:flex-start;margin-bottom:12px;break-inside:avoid}
        .contrato-doc-foto{flex:0 0 120px;width:120px;height:120px;overflow:hidden;border:1px solid #e8eaed;border-radius:8px;background:#f4f5f7}
        .contrato-doc-foto img{display:block;width:100%;height:100%;object-fit:cover}
        .contrato-doc-foto-vacia{height:100%;display:flex;align-items:center;justify-content:center;padding:8px;color:#9aa0a6;font-size:8pt;text-align:center}
        .contrato-doc-datos{flex:1;min-width:0}
        .contrato-doc-firmas{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;margin-top:30px;break-inside:avoid}
        .contrato-doc-firma{padding-top:6px;border-top:1px solid #191919;font-size:9pt;color:#4b5563}
        .contrato-doc-firma-label{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#6b7280}
        .contrato-doc-firma-espacio{height:54px;border-bottom:1px solid #9ca3af}
        .contrato-doc-firma b{display:block;margin-top:4px}
        .contrato-doc-firma small{display:block;margin-top:2px;color:#6b7280}
        .contrato-doc-nota{margin-top:18px;padding:10px 12px;border-radius:8px;background:#ebf5fb;color:#374151;font-size:8pt}
      </style></head><body><div class="contrato-doc">${this._contratoAcogidaBody(c, logo)}</div></body></html>`;
  },

  exportMemoria(m) {
    return this._printAsync(`Memoria-Anual-${m.year}.pdf`, (logo) => this._buildMemoria(m, logo));
  },

  _buildMemoria(m, logo) {
    const fecha = this._hoy();
    const img = logo || this._logoFallback;
    const eur = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');
    const fechita = f => this._fmtFecha(f);
    const tabla = (tit, cols, filas) => filas.length
      ? `<div class="section"><div class="section-title">${tit}</div><table class="tbl"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`
      : '';
    const kpi = (n, l) => `<div class="kpi"><div class="kpi-n">${n}</div><div class="kpi-l">${l}</div></div>`;

    const tblAdop = (m.adopciones || []).map(a => `<tr><td>${this._esc(a.animal || '—')}</td><td>${this._esc(a.adoptante || '—')}</td><td>${fechita(a.fecha)}</td><td>${this._esc(a.desenlace === 'devuelto' ? 'Devuelto' : (a.fase || '—'))}</td></tr>`);
    const tblAltas = (m.altas || []).map(a => `<tr><td>${this._esc(a.nombre || '—')}</td><td>${this._esc(a.especie || '—')}</td><td>${this._esc(a.raza || '—')}</td><td>${fechita(a.fecha_ingreso)}</td><td>${this._esc(a.estado || '—')}</td></tr>`);
    const tblDon = (m.donaciones || []).map(d => `<tr><td>${fechita(d.fecha)}</td><td>${this._esc(d.donante || 'Anonimo')}</td><td>${this._esc(d.notas || '—')}</td><td class="num">${eur(d.importe)} €</td></tr>`);
    const tblGas = (m.gastos || []).map(g => `<tr><td>${fechita(g.fecha)}</td><td>${this._esc(g.concepto || '—')}</td><td>${this._esc(g.animal || '—')}</td><td class="num">${eur(g.importe)} €</td></tr>`);

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Memoria anual ${m.year} - Grupo Nebak</title>
      <style>
        @page{size:A4;margin:2cm}
        body{font:10pt/1.55 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .cover{text-align:center;padding:48px 0 32px;border-bottom:3px solid #1FC95B;margin-bottom:26px}
        .cover img{width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #1FC95B}
        .cover h1{font-size:20pt;margin:12px 0 4px}
        .cover .sub{font-size:10pt;color:#757575}
        .kpis{display:flex;gap:12px;justify-content:center;margin:22px 0 8px;flex-wrap:wrap}
        .kpi{background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;padding:8px 18px;text-align:center;min-width:96px}
        .kpi-n{font-size:16pt;font-weight:800;color:#15863D}
        .kpi-n.neg{color:#c0392b}
        .kpi-l{font-size:8pt;color:#757575;text-transform:uppercase;letter-spacing:.5px}
        h2{font-size:11pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15863D;margin:26px 0 8px;padding-bottom:5px;border-bottom:2px solid #1FC95B}
        .section{margin-bottom:18px;break-inside:avoid}
        .section-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#757575;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e8eaed}
        .tbl{width:100%;border-collapse:collapse;font-size:9pt}
        .tbl th{background:#f9fafb;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.4px;color:#757575;padding:6px 8px;border-bottom:1px solid #e8eaed}
        .tbl td{padding:6px 8px;border-bottom:1px solid #f1f3f4;vertical-align:top}
        .tbl .num{text-align:right;font-weight:700;white-space:nowrap}
        .resumen{width:100%;border-collapse:collapse;font-size:10pt;margin-top:6px}
        .resumen td{padding:7px 8px;border-bottom:1px solid #f1f3f4}
        .resumen .k{color:#757575;width:62%}
        .resumen .v{text-align:right;font-weight:800}
        .total-row td{border-top:2px solid #1FC95B;font-weight:800}
        .footer{text-align:center;margin-top:28px;padding-top:8px;border-top:1px solid #e8eaed;font-size:7pt;color:#9aa0a6}
        .vacio{color:#9aa0a6;font-style:italic;font-size:9pt;padding:6px 0}
      </style></head><body>
      <div class="cover">
        <img src="${img}" alt="Grupo Nebak">
        <h1>Memoria anual ${m.year}</h1>
        <div class="sub">Asociacion Grupo Nebak · Ejercicio ${m.year} · Generado el ${fecha}</div>
        <div class="kpis">
          ${kpi(m.altasN, 'Altas')}
          ${kpi(m.adopcionesN, 'Adopciones')}
          ${kpi(eur(m.donTotal) + ' €', 'Donaciones')}
          ${kpi(eur(m.gasTotal) + ' €', 'Gastos')}
          ${kpi(eur(m.balance) + ' €', 'Balance')}
        </div>
      </div>

      <h2>1. Resumen del ejercicio</h2>
      <table class="resumen">
        <tr><td class="k">Altas de animales registradas</td><td class="v">${m.altasN}</td></tr>
        <tr><td class="k">Adopciones cerradas</td><td class="v">${m.adopcionesN}</td></tr>
        <tr><td class="k">Donaciones recibidas</td><td class="v">${m.donacionesN} · ${eur(m.donTotal)} €</td></tr>
        <tr><td class="k">Gastos registrados</td><td class="v">${m.gastosN} · ${eur(m.gasTotal)} €</td></tr>
        <tr class="total-row"><td class="k">Balance del ejercicio</td><td class="v">${eur(m.balance)} €</td></tr>
        <tr><td class="k">Socios dados de alta en el ejercicio</td><td class="v">${m.sociosNuevos}</td></tr>
        <tr><td class="k">Socios totales / activos</td><td class="v">${m.sociosTotal} / ${m.sociosActivos}</td></tr>
        <tr><td class="k">Apadrinamientos activos</td><td class="v">${m.apadrinamientosN} · ${eur(m.apadrinaTotal)} €</td></tr>
      </table>

      <h2>2. Detalle</h2>
      ${tabla('Adopciones cerradas en el ejercicio', ['Animal', 'Adoptante', 'Fecha', 'Estado'], tblAdop) || '<div class="vacio">Sin adopciones registradas en el ejercicio.</div>'}
      ${tabla('Altas de animales', ['Nombre', 'Especie', 'Raza', 'Fecha de ingreso', 'Estado'], tblAltas) || '<div class="vacio">Sin altas de animales en el ejercicio.</div>'}
      ${tabla('Donaciones', ['Fecha', 'Donante', 'Notas', 'Importe'], tblDon) || '<div class="vacio">Sin donaciones en el ejercicio.</div>'}
      <table class="resumen"><tr class="total-row"><td class="k">Total donaciones</td><td class="v">${eur(m.donTotal)} €</td></tr></table>
      ${tabla('Gastos', ['Fecha', 'Concepto', 'Animal', 'Importe'], tblGas) || '<div class="vacio">Sin gastos en el ejercicio.</div>'}
      <table class="resumen"><tr class="total-row"><td class="k">Total gastos</td><td class="v">${eur(m.gasTotal)} €</td></tr></table>

      <div class="footer">Generado por GN-Admin · Grupo Nebak · Memoria del ejercicio ${m.year} · Documento confidencial</div>
    </body></html>`;
  },

  _label(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  },

  // Espera a que el logo y la foto del animal esten cargados antes de abrir
  // el dialogo de impresion; si una imagen falla o tarda, no bloquea el PDF.
  _waitImages(w, timeoutMs = 2500) {
    return new Promise(resolve => {
      let imgs = [];
      try { imgs = Array.from(w.document.images || []); } catch { return resolve(); }
      const pending = imgs.filter(img => !img.complete);
      if (!pending.length) return resolve();
      let left = pending.length;
      const done = () => { if (--left <= 0) resolve(); };
      pending.forEach(img => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
      setTimeout(resolve, timeoutMs);
    });
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
    await this._waitImages(w);
    setTimeout(() => { try { if (!w.closed) w.print(); } catch {} }, 150);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = PdfExport;
