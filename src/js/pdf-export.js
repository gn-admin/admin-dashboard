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

  // Ruta de un asset local como URL absoluta: la ventana de impresion se abre
  // en blanco y alli las rutas relativas pueden no resolverse.
  _assetUrl(ruta) {
    const p = String(ruta || '');
    if (!p) return '';
    if (/^(data:|https?:|blob:)/i.test(p)) return p;
    try {
      if (typeof document !== 'undefined' && document.baseURI) return new URL(p, document.baseURI).href;
    } catch { /* ruta no valida: se deja tal cual */ }
    return p;
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
      <div class="footer">Generado por Grupo Nebak · Grupo Nebak · ${fecha} · Documento confidencial</div>
    </body></html>`;
  },

  exportContracto(c) {
    return this._printAsync(`Contrato-Adopcion-${c.adopcion_id || 'signed'}.pdf`, (logo) => this._buildContracto(c, logo));
  },

  exportTerminosAdopcion(c) {
    return this._printAsync(`Estipulaciones-Adopcion-${c.adopcion_id || 'signed'}.pdf`, (logo) => this._buildTerminosAdopcion(c, logo));
  },

  _buildTerminosAdopcion(c, logo) {
    const body = (typeof Dashboard !== 'undefined' && Dashboard._terminosAdopcionCuerpo)
      ? Dashboard._terminosAdopcionCuerpo({}, c || {}, logo)
      : '<p>No se pudo cargar la hoja de estipulaciones.</p>';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Hoja de estipulaciones</title>
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
        .contrato-doc-entidad-datos span b{display:inline;font-size:inherit;color:#6b7280;font-weight:600}
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
        .contrato-doc-estipulacion{margin:0 0 9px;font-size:10pt;text-align:justify;break-inside:avoid}
        .contrato-doc-estipulacion p{margin:0 0 4px}
        .contrato-doc-estipulacion b{color:#191919}
        .contrato-doc-lista{margin:2px 0 6px;padding-left:20px;font-size:10pt}
        .contrato-doc-lista li{margin-bottom:2px}
        .contrato-doc-nota{margin-top:18px;padding:10px 12px;border-radius:8px;background:#ebf5fb;color:#374151;font-size:8pt}
      </style></head><body><div class="contrato-doc">${body}</div></body></html>`;
  },

  /**
   * Datos de la entidad que firma el contrato. Es la única implementación de
   * esa precedencia: el panel la usa en `Dashboard._contratoEntidadDatos` y el
   * contrato (papel y PDF) aquí.
   *
   * Una sola regla para **todos** los campos: config del despliegue
   * (`ASOCIACION_*` y `CONTACTO_*`) → copia congelada del contrato
   * (`entidad_*`) → vacío o defecto. La asociación es la misma en todos los
   * documentos, así que el aspecto que tenía un contrato al firmarse no puede
   * fijar su nombre, CIF, domicilio ni teléfonos; la copia solo rellena lo que
   * la config no define.
   */
  _entidadDatos(c) {
    const cfg = (typeof CONFIG !== 'undefined' && CONFIG) || {};
    const a = cfg.asociacion || {};
    const contacto = cfg.contacto || {};
    const snap = c || {};
    // Primer valor con contenido: el documento nunca se queda con un hueco.
    const val = (...valores) => {
      for (let i = 0; i < valores.length; i++) {
        const v = String(valores[i] == null ? '' : valores[i]).trim();
        if (v) return v;
      }
      return '';
    };
    return {
      nombre: val(a.nombre, snap.entidad_nombre, 'Asociación Grupo Nebak'),
      cif: val(a.cif, snap.entidad_cif),
      domicilio: val(a.domicilio, snap.entidad_domicilio),
      email: val(a.email, contacto.email, snap.entidad_email),
      telefono: val(a.telefono, contacto.telefono, snap.entidad_telefono),
      registro: val(a.registro, snap.entidad_registro),
      web: val(a.web, snap.entidad_web)
    };
  },

  /**
   * Datos del contrato resueltos una sola vez. Es la única fuente que
   * comparten el contrato impreso (`_buildContracto`) y el modelo que viaja al
   * PDF del servidor (`modeloContrato`): ficha viva como respaldo, importes por
   * defecto, tutor, persona responsable designada y firma/sello de la entidad.
   */
  _datosContrato(c, logo) {
    const cv = c || {};
    const T = (typeof module !== 'undefined' && module.exports)
      ? require('./contrato-textos.js')
      : (typeof ContratoTextos !== 'undefined' ? ContratoTextos : null);
    if (!T) throw new Error('No se pudo cargar ContratoTextos');

    // La ventana de impresión abre en blanco: las rutas relativas se resuelven
    // aquí una vez, para el papel y para las imágenes que descarga el servidor.
    const abs = (u) => {
      const s = String(u || '');
      if (!s || /^(data:|https?:|blob:)/i.test(s)) return s;
      try { return new URL(s, document.baseURI).href; } catch (e) { return s; }
    };
    const val = (guardado, vivo) => (guardado !== undefined && guardado !== null && guardado !== '')
      ? guardado
      : (vivo || '');
    const firmaValida = (f) => (f && String(f).startsWith('data:')) ? f : '';
    const siNo = (v) => (v === true || /^(si|sí|true|1)$/i.test(String(v)))
      ? 'Si'
      : ((v === false || /^(no|false|0)$/i.test(String(v))) ? 'No' : '—');

    // Los contratos nuevos guardan una copia de los datos del animal al firmar;
    // los antiguos, o los campos nuevos, se completan desde la ficha viva.
    let animal = {
      nombre: cv.animal || '',
      nombre_definitivo: cv.nombre_definitivo || '',
      foto: cv.animal_foto || '',
      especie: cv.especie || '',
      raza: cv.raza || '',
      edad: cv.edad || '',
      sexo: cv.animal_sexo || '',
      microchip: cv.animal_microchip || '',
      fecha_nacimiento: cv.animal_fecha_nacimiento || '',
      capa: cv.animal_capa || '',
      color: cv.animal_color || '',
      tamano: cv.animal_tamano || '',
      esterilizada: cv.animal_esterilizada,
      descripcion: cv.animal_descripcion || ''
    };
    try {
      if (typeof Dashboard !== 'undefined' && Dashboard._contratoAnimalDatos) {
        const p = cv.adopcion_id && Dashboard._byId
          ? Dashboard._byId(Dashboard.adopciones || [], cv.adopcion_id)
          : null;
        const vivo = Dashboard._contratoAnimalDatos(p, cv) || {};
        animal = {
          nombre: val(cv.animal, vivo.nombre),
          nombre_definitivo: val(cv.nombre_definitivo, vivo.nombre_definitivo),
          foto: val(cv.animal_foto, vivo.foto),
          especie: val(cv.especie, vivo.especie),
          raza: val(cv.raza, vivo.raza),
          edad: val(cv.edad, vivo.edad),
          sexo: val(cv.animal_sexo, vivo.sexo),
          microchip: val(cv.animal_microchip, vivo.microchip),
          fecha_nacimiento: val(cv.animal_fecha_nacimiento, vivo.fecha_nacimiento),
          capa: val(cv.animal_capa, vivo.capa),
          color: val(cv.animal_color, vivo.color),
          tamano: val(cv.animal_tamano, vivo.tamano),
          esterilizada: val(cv.animal_esterilizada, vivo.esterilizada),
          descripcion: val(cv.animal_descripcion, vivo.descripcion)
        };
      }
    } catch (e) { /* PDF autonomo: usa los datos guardados */ }

    // Una sola precedencia para la entidad, también sin panel cargado.
    const ent = PdfExport._entidadDatos(cv);

    let tutor = null;
    if (typeof Dashboard !== 'undefined' && Dashboard._contratoTutor) {
      const t = Dashboard._contratoTutor(cv);
      if (t) tutor = {
        nombre: t.f2_nombre || t.nombre || '',
        dni: t.f2_dni || t.dni || '',
        relacion: t.f2_relacion || t.f2_rol || t.relacion || '',
        direccion: t.f2_direccion || t.direccion || '',
        email: t.f2_email || t.email || '',
        telefono: t.f2_telefono || t.telefono || '',
        firma: firmaValida(t.f2_firma || t.firma)
      };
    } else {
      const f2Nombre = String(cv.f2_nombre || '').trim();
      const f2Rol = String(cv.f2_rol || '').trim();
      const f2EsEntidad = /entidad|asociaci[oó]n|grupo\s*nebak/i.test(f2Rol + ' ' + f2Nombre);
      if (f2Nombre && !f2EsEntidad) tutor = {
        nombre: f2Nombre,
        dni: cv.f2_dni || '',
        relacion: cv.f2_relacion || f2Rol,
        direccion: cv.f2_direccion || '',
        email: cv.f2_email || '',
        telefono: cv.f2_telefono || '',
        firma: firmaValida(cv.f2_firma)
      };
    }

    let responsable65 = null;
    if (typeof Dashboard !== 'undefined' && Dashboard._contratoResponsable65) {
      const r = Dashboard._contratoResponsable65(cv);
      if (r) responsable65 = {
        nombre: r.responsable_nombre || r.nombre || '',
        dni: r.responsable_dni || r.dni || '',
        telefono: r.responsable_telefono || r.telefono || '',
        email: r.responsable_email || r.email || '',
        direccion: r.responsable_direccion || r.direccion || ''
      };
    } else if ((cv.adoptante_mayor_65 && /^(1|si|sí|true|on|x)$/i.test(String(cv.adoptante_mayor_65))) || cv.responsable_nombre) {
      responsable65 = {
        nombre: cv.responsable_nombre || '',
        dni: cv.responsable_dni || '',
        telefono: cv.responsable_telefono || '',
        email: cv.responsable_email || '',
        direccion: cv.responsable_direccion || ''
      };
    }

    // Importes del contrato: si faltan (contratos antiguos) se usan los del
    // documento. Misma regla que el formulario: acepta coma, respeta el 0 y
    // descarta negativos.
    const porDefecto = (typeof Dashboard !== 'undefined' && Dashboard._contratoImportesPorDefecto)
      ? Dashboard._contratoImportesPorDefecto()
      : { donacion: 100, indemnizacion: 900 };
    const importe = (v, def) => (typeof Dashboard !== 'undefined' && Dashboard._contratoImporte)
      ? Dashboard._contratoImporte(v, def)
      : ((v !== undefined && v !== null && v !== '' && !isNaN(Number(v)) && Number(v) >= 0) ? Number(v) : def);

    const fecha = this._fmtFecha(cv.fecha || this._hoy());
    // Sello real de la asociación (el mismo que lleva el papel), no un sello
    // dibujado con CSS. Si la entidad ha subido otro, manda el suyo.
    // La firma que aparece en el DOCX de la asociación es la firma por
    // defecto. Solo se sustituye si el formulario guarda otra firma expresa.
    const firmaEntidad = firmaValida(cv.entidad_firma)
      || this._assetUrl('assets/contratos/firma-nebak.jpg');
    const logoEntidad = this._assetUrl('assets/contratos/logo-nebak-horizontal.jpg');
    const nacimiento = animal.fecha_nacimiento ? this._fmtFecha(animal.fecha_nacimiento) : '';
    const nombreArchivo = ('Contrato-Adopcion-' + (animal.nombre || 'Grupo-Nebak') + '-' + (cv.fecha || cv.id || 'signed'))
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') + '.pdf';

    return {
      c: cv,
      animal: Object.assign({}, animal, {
        foto: abs(animal.foto),
        fecha_nacimiento: nacimiento,
        esterilizada: siNo(animal.esterilizada)
      }),
      entidad: ent,
      tutor,
      entidadFirma: firmaEntidad,
      entidadLogo: logoEntidad,
      responsable65,
      importes: {
        donacion: importe(cv.donacion_adoptante, porDefecto.donacion),
        indemnizacion: importe(cv.indemnizacion_importe, porDefecto.indemnizacion)
      },
      fecha,
      fechaNacimiento: nacimiento,
      ciudad: cv.ciudad || 'Irún',
      expediente: cv.adopcion_id || cv.id || '',
      logoUrl: logo || this._logoFallback,
      selloUrl: '',
      textos: T,
      nombreArchivo
    };
  },

  /**
   * Modelo del documento (bloques). Lo consumen el HTML de impresión
   * (`_htmlContrato`) y el PDF del servidor (`generarPdfModelo`): el contenido
   * y su orden viven solo en ContratoModelo, así que los dos documentos no
   * pueden separarse.
   */
  _modeloContrato(c, logo) {
    const M = (typeof module !== 'undefined' && module.exports)
      ? require('./contrato-modelo.js')
      : (typeof ContratoModelo !== 'undefined' ? ContratoModelo : null);
    if (!M) throw new Error('No se pudo cargar el modelo del contrato');
    return M.construir(this._datosContrato(c, logo));
  },

  /** Modelo que viaja al renderizador PDF del servidor (`contrato_modelo`). */
  async modeloContrato(c) {
    return this._modeloContrato(c, await this._logoUrl());
  },

  /**
   * Contrato imprimible: envuelve el modelo compartido con los estilos A4.
   * No añade contenido propio; si un dato no está en el modelo, no sale en papel.
   */
  _htmlContrato(modelo) {
    const esc = (s) => this._esc(s);
    const bloques = (modelo && modelo.bloques) || [];
    // Destaca los mismos trozos que el modelo marca (`negrita`), ya escapados.
    const conNegrita = (texto, partes) => {
      let html = esc(texto);
      (partes || []).forEach((p) => {
        const e = esc(p);
        if (!e) return;
        html = html.replace(e, '<b>' + e + '</b>');
      });
      return html;
    };
    const salida = [];
    let titulo = '';
    let subtitulo = '';
    let grupoFirmas = [];
    let grupoFecha = '';

    const bloqueFirma = (b) => {
      const etiqueta = b.etiqueta || 'Firma';
      const firma = b.firma
        ? `<img class="firma-img" src="${esc(b.firma)}" alt="Firma de ${esc(b.nombre || 'la parte')}">`
        : '<span class="firma-vacia" aria-hidden="true"></span>';
      const logo = b.logo
        ? `<img class="firma-logo" src="${esc(b.logo)}" alt="${esc(b.nombre || 'Entidad')}">`
        : '';
      const linea = b.nombre
        ? `<div class="sig-line">${esc(b.nombre)}${b.dni ? ' &middot; ' + esc(b.dniEtiqueta || 'DNI') + ' ' + esc(b.dni) : ''}</div>`
        : '';
      return `<div class="signature"><div class="sig-label">${esc(etiqueta)}</div><div class="firma-fila">${logo}${firma}</div>${linea}</div>`;
    };

    const cerrarFirmas = () => {
      if (!grupoFirmas.length) return;
      salida.push('<div class="firmas-docx">'
        + (grupoFecha ? `<div class="firmas-fecha">${esc(grupoFecha)}</div>` : '')
        + '<div class="firmas-filas">' + grupoFirmas.join('') + '</div></div>');
      grupoFirmas = [];
      grupoFecha = '';
    };

    bloques.forEach((b) => {
      const tipo = b && b.tipo;
      // Copia de una firma en la forma antigua, para el .gs aún sin actualizar:
      // aquí ya la pinta el grupo, así que no se repite.
      if (b && b.legado) return;
      // Las firmas consecutivas comparten fila; cualquier otro bloque la cierra.
      if (tipo === 'firmas') {
        if (b.fecha) grupoFecha = b.fecha;
        (b.items || []).forEach(it => grupoFirmas.push(bloqueFirma(it)));
        return;
      }
      if (tipo === 'firma' || tipo === 'firmaEntidad') { grupoFirmas.push(bloqueFirma(b)); return; }
      cerrarFirmas();
      if (tipo === 'imagen') {
        if (b.clase === 'logo') return;
        salida.push(`<img class="imagen" src="${esc(b.src)}" alt="${esc(b.alt || '')}">`);
        return;
      }
      if (tipo === 'titulo') { titulo = b.texto || ''; return; }
      if (tipo === 'subtitulo') { subtitulo = b.texto || ''; return; }
      if (tipo === 'seccion') { salida.push(`<h2>${esc(b.texto)}</h2>`); return; }
      if (tipo === 'parrafo') { salida.push(`<p>${conNegrita(b.texto, b.negrita)}</p>`); return; }
      if (tipo === 'nota') { salida.push(`<p class="nota">${esc(b.texto)}</p>`); return; }
      if (tipo === 'salto') { salida.push('<div class="page-break"></div>'); return; }
      if (tipo === 'tabla') {
        // Tabla etiqueta/valor del documento; la fotografía es la última fila.
        const filas = (b.filas || []).map(f => `<tr><th scope="row">${esc(f[0])}</th><td>${esc(f[1] == null ? '' : f[1])}</td></tr>`).join('');
        const f = b.foto;
        const fotoFila = f
          ? `<tr><th scope="row">${esc(f.etiqueta || 'Fotografía')}</th><td>${f.src
            ? `<img class="animal-photo" src="${esc(f.src)}" alt="${esc(f.alt || 'Animal')}">`
            : `<div class="animal-photo animal-photo--empty">${esc(f.vacio || 'Sin foto')}</div>`}</td></tr>`
          : '';
        salida.push(`<table class="ficha">${filas}${fotoFila}</table>`);
        return;
      }
      if (tipo === 'estipulacion') {
        const parrafos = (b.parrafos || []).map((t, i) => `<p>${i === 0 ? `<b>${esc(b.n)}ª.</b> ` : ''}${esc(t)}</p>`).join('');
        const lista = (b.lista || []).length
          ? `<ol class="est-lista">${b.lista.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`
          : '';
        salida.push(`<div class="clausula">${parrafos}${lista}</div>`);
        return;
      }
      if (tipo === 'clausula') {
        const parrafos = (b.parrafos || []).map((t, i) => `<p>${i === 0 && b.titulo ? `<b>${esc(b.titulo)}.</b> ` : ''}${esc(t)}</p>`).join('');
        salida.push(`<div class="clausula-anexo">${parrafos}</div>`);
        return;
      }
      if (tipo === 'pie') salida.push(`<div class="footer">${esc(b.texto)}</div>`);
    });
    cerrarFirmas();

    const cabecera = `<div class="header">
        <div class="title">${esc(titulo || 'Contrato de adopción')}</div>
        ${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ''}
      </div>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Contrato de adopción</title>
      <style>
        @page{size:A4;margin:25mm}
        body{font:10.5pt/1.15 Arial,sans-serif;color:#000;padding:0;margin:0}
        @media screen{html{background:#e5e7eb}body{background:#fff;width:210mm;max-width:100%;min-height:297mm;margin:12px auto;padding:25mm;box-sizing:border-box;box-shadow:0 8px 30px rgba(0,0,0,.12)}}
        body.paginado{background:transparent;width:auto;max-width:none;min-height:0;margin:0;padding:0;box-shadow:none;overflow-x:auto}
        @media screen{.sheet-wrap{width:100%;margin:12px auto}.sheet-page{display:block;width:210mm;height:297mm;padding:25mm;box-sizing:border-box;background:#fff;margin:0 auto;box-shadow:0 8px 30px rgba(0,0,0,.12);overflow:hidden;transform-origin:top left}}
        @media screen{.page-break{display:block;height:50mm;margin:0 -25mm;background:#e5e7eb}}
        @media print{body{max-width:none;margin:0;padding:0;box-shadow:none}.sheet-wrap{display:contents}.sheet-page{width:auto;height:auto;min-height:0;margin:0;padding:0;box-shadow:none;overflow:visible;transform:none!important;break-after:page}.sheet-page:last-child{break-after:auto}}
        .header{text-align:center;margin:0 0 12pt}
        .title{font-size:14pt;font-weight:700;color:#000;line-height:1.15}
        .sub{font-size:9pt;color:#757575}
        h2{font-size:11.5pt;font-weight:700;color:#000;margin:12pt 0 6pt;break-after:avoid}
        p{margin:0 0 7pt;text-align:justify;line-height:1.15;orphans:2;widows:2}
        .imagen{max-width:100%;height:auto}
        .ficha{width:100%;border-collapse:collapse;font-size:10pt;margin:4pt 0 8pt;break-inside:avoid}
        .ficha th,.ficha td{border:.75pt solid #000;padding:2pt 4pt;text-align:left;vertical-align:top;line-height:1.15}
        .ficha th{width:34%;font-size:10pt;font-weight:700;color:#000;text-transform:uppercase;background:#fff}
        .animal-photo{width:110px;height:110px;object-fit:cover;border:1px solid #d1d5db;border-radius:4px;display:block}
        .animal-photo--empty{display:flex;align-items:center;justify-content:center;background:#f4f5f7;color:#9aa0a6;font-size:8pt;text-align:center;padding:8px}
        .nota{font-size:10pt;color:#000;margin:6pt 0;text-align:left}
        .clausula{margin:0;font-size:10.5pt;text-align:justify}
        .clausula p{margin:0 0 4pt}
        .clausula b{color:#000}
        .clausula-anexo{margin:0 0 7pt;font-size:10.5pt;text-align:justify}
        .clausula-anexo p{margin:0 0 4pt}
        .est-lista{margin:0 0 4pt;padding-left:18pt;font-size:10.5pt}
        .est-lista li{margin-bottom:1pt}
        .firmas-docx{margin:12pt 0 8pt;border:.75pt solid #000;break-inside:avoid}
        .firmas-fecha{padding:3pt 5pt;border-bottom:.75pt solid #000;font-size:10pt}
        .signature{display:grid;grid-template-columns:34% 1fr;min-height:62px;break-inside:avoid}
        .signature + .signature{border-top:.75pt solid #000}
        .sig-label{padding:4px 6px;border-right:.75pt solid #000;font-size:10pt;font-weight:700}
        .firma-fila{display:flex;align-items:center;gap:8px;min-height:62px;padding:2px 6px}
        .firma-img{height:50px;max-width:100%;object-fit:contain;display:block}
        .firma-logo{height:26px;max-width:120px;object-fit:contain;display:block}
        .firma-vacia{display:block;height:48px}
        .sig-line{grid-column:2;padding:0 6px 4px;font-size:9pt;color:#000}
        .page-break{break-before:page;page-break-before:always}
        .footer{text-align:center;margin-top:20px;padding-top:8px;border-top:1px solid #e8eaed;font-size:8pt;color:#9aa0a6}
        @media screen and (max-width:640px){body{padding:0;min-height:0}}
      </style></head><body>
      ${cabecera}
      ${salida.join('\n      ')}
      <script>
      (function(){
        if (window.__contratoPaginas) return;
        window.__contratoPaginas = true;
        function paginar(){
          var body = document.body;
          if (body.getAttribute('data-paginado') === '1') return;
          var nodos = [].slice.call(body.children).filter(function(n){ return n.tagName !== 'SCRIPT'; });
          if (!nodos.length) return;
          var pagina = null;
          function nuevaPagina(){
            pagina = document.createElement('div');
            pagina.className = 'sheet-page';
            body.appendChild(pagina);
            return pagina;
          }
          function cabe(el){
            pagina.appendChild(el);
            var ok = pagina.scrollHeight <= pagina.clientHeight + 1;
            if (!ok) pagina.removeChild(el);
            return ok;
          }
          function cabeGrupo(grupo, hijo){
            grupo.appendChild(hijo);
            var ok = pagina.scrollHeight <= pagina.clientHeight + 1;
            if (!ok) grupo.removeChild(hijo);
            return ok;
          }
          function ajustarEscala(){
            var paginas = [].slice.call(document.querySelectorAll('.sheet-page'));
            if (!paginas.length) return;
            var ancho = document.documentElement.clientWidth;
            var base = paginas[0].offsetWidth || 1;
            var escala = ancho >= 680 ? Math.min(1, (ancho - 24) / base) : 1;
            paginas.forEach(function(p){
              var wrap = p.parentNode;
              if (!wrap || !wrap.classList || !wrap.classList.contains('sheet-wrap')) {
                wrap = document.createElement('div');
                wrap.className = 'sheet-wrap';
                p.parentNode.insertBefore(wrap, p);
                wrap.appendChild(p);
              }
              p.style.transform = escala < 1 ? 'scale(' + escala + ')' : '';
              p.style.transformOrigin = 'top left';
              p.style.marginLeft = Math.max(0, (ancho - base * escala) / 2) + 'px';
              wrap.style.height = Math.ceil(p.offsetHeight * escala) + 'px';
            });
          }
          body.classList.add('paginado');
          nuevaPagina();
          nodos.forEach(function(n){
            if (n.classList && n.classList.contains('page-break')) {
              if (n.parentNode) n.parentNode.removeChild(n);
              if (pagina.childNodes.length) nuevaPagina();
              return;
            }
            if (cabe(n)) return;
            if (n.classList && n.classList.contains('clausula') && n.children.length > 1) {
              var grupo = null;
              [].slice.call(n.children).forEach(function(hijo){
                if (!grupo || !cabeGrupo(grupo, hijo)) {
                  nuevaPagina();
                  grupo = document.createElement('div');
                  grupo.className = n.className;
                  pagina.appendChild(grupo);
                  grupo.appendChild(hijo);
                }
              });
              return;
            }
            nuevaPagina();
            pagina.appendChild(n);
          });
          body.setAttribute('data-paginado', '1');
          ajustarEscala();
          window.addEventListener('resize', ajustarEscala);
          window.addEventListener('beforeprint', function(){
            [].slice.call(document.querySelectorAll('.sheet-page')).forEach(function(p){
              p.style.transform = '';
              p.style.marginLeft = '';
              if (p.parentNode && p.parentNode.classList) p.parentNode.style.height = '';
            });
          });
          window.addEventListener('afterprint', ajustarEscala);
        }
        window.__paginarContrato = paginar;
        if (document.readyState === 'complete') paginar();
        else window.addEventListener('load', paginar, { once: true });
      })();
      </script>
    </body></html>`;
  },

  _buildContracto(c, logo) {
    return this._htmlContrato(this._modeloContrato(c, logo || this._logoFallback));
  },

  exportContratoAcogida(c) {
    const id = (c && (c.id || (c.animal && c.animal.nombre))) || 'documento';
    return this._printAsync(`Contrato-Acogida-${id}.pdf`, (logo) => this._buildContratoAcogida(c, logo));
  },

  // Contrato de acogida temporal: replica el documento de la asociación
  // (`contratoacogida EN BLANCO.doc`), con su texto literal y su maqueta de
  // formulario. Sigue siendo opcional: no condiciona las fases de la acogida.
  _contratoAcogidaBody(c, logo) {
    const T = (typeof module !== 'undefined' && module.exports)
      ? require('./acogida-textos.js')
      : (typeof AcogidaTextos !== 'undefined' ? AcogidaTextos : null);
    const caso = c || {};
    const animal = caso.animal || {};
    const familia = caso.familia || {};
    const fecha = this._fmtFecha(caso.fecha || this._hoy());
    const siNo = v => (v === true || /^(si|sí|true|1)$/i.test(String(v)))
      ? 'Sí'
      : ((v === false || /^(no|false|0)$/i.test(String(v))) ? 'No' : '—');
    const box = on => (on ? '☒' : '☐');
    // El material puede llegar como lista guardada o como texto separado.
    const material = (Array.isArray(caso.material) ? caso.material : String(caso.material || '').split(/[|,;]/))
      .map(x => String(x).trim())
      .filter(Boolean);
    // "Otros" solo va marcado si hay texto que detalle el material extra.
    const materialOtros = String(caso.material_otros == null ? '' : caso.material_otros).trim();
    const tiene = nombre => material.some(m => m.toLowerCase() === String(nombre).toLowerCase())
      || (String(nombre).toLowerCase() === 'otros' && !!materialOtros);
    let foto = animal.foto || '';
    if (foto && !/^(data:|https?:|blob:)/i.test(foto) && typeof document !== 'undefined') {
      try { foto = new URL(foto, document.baseURI).href; } catch { /* ruta no valida: se deja tal cual */ }
    }
    const fotoHtml = foto
      ? `<img src="${this._esc(foto)}" alt="${this._esc(animal.nombre || 'Animal')}">`
      : '<span class="acogida-foto-vacia">FOTO ANIMAL</span>';
    const titulo = T ? T.titulo : 'Contrato de acogida temporal de un animal de compañía';
    const condiciones = (T ? T.condiciones : []).map((texto, i) =>
      `<div class="acogida-cond"><b>${i + 1}-</b> ${this._esc(texto)}</div>`).join('');
    const materialHtml = (T ? T.material : []).map(nombre =>
      `<div class="acogida-material-item">${box(tiene(nombre))} ${this._esc(nombre)}</div>`).join('');
    const field = (label, value, cls) => `<div${cls ? ` class="${cls}"` : ''}><div class="label">${this._esc(label)}</div><div class="acogida-val">${this._esc(value || '—')}</div></div>`;
    const poblacion = familia.poblacion || familia.ubicacion || '';
    return `
      <div class="acogida-header">
        <img src="${this._esc(logo || 'assets/contratos/logo-nebak-horizontal.jpg')}" alt="Grupo Nebak">
        <h1 class="acogida-title">${this._esc(titulo)}</h1>
      </div>

      <div class="acogida-top">
        <div class="acogida-foto">${fotoHtml}</div>
        <div class="acogida-partes">
          <p>D./Dña. <b>${this._esc(familia.nombre || '[casa de acogida]')}</b>, con DNI/NIF <b>${this._esc(familia.nif || familia.dni || '')}</b>, con domicilio en <b>${this._esc(familia.direccion || '')}</b>.</p>
          <p>Población <b>${this._esc(poblacion)}</b> &middot; Provincia <b>${this._esc(familia.provincia || '')}</b> &middot; Cód. Postal <b>${this._esc(familia.codigo_postal || '')}</b></p>
          <p>Teléfonos <b>${this._esc(familia.telefono || '')}</b>${familia.email ? ` &middot; Email <b>${this._esc(familia.email)}</b>` : ''}</p>
          <p>Con fecha <b>${this._esc(fecha)}</b> acojo temporalmente al siguiente animal:</p>
        </div>
      </div>

      <div class="acogida-animal">
        ${field('Nombre', animal.nombre)}
        ${field('Sexo', animal.sexo)}
        ${field('Edad', animal.edad)}
        ${field('Capa', animal.capa)}
        ${field('Marcas', animal.marcas || animal.color)}
        <div><div class="label">Esterilizado</div>${box(siNo(animal.esterilizada) === 'Sí')} SÍ &nbsp;&nbsp; ${box(siNo(animal.esterilizada) === 'No')} NO</div>
        ${field('Microchip n.º', animal.microchip)}
        ${field('Pasaporte n.º', animal.pasaporte)}
        <div class="acogida-full"><div class="label">Otros rasgos distintivos</div><div class="acogida-val">${this._esc(animal.otros_rasgos || animal.descripcion || '—')}</div><div class="acogida-truncado">… (texto completo en la ficha del animal)</div></div>
      </div>

      <div class="acogida-condiciones">${condiciones}</div>

      <div class="acogida-material">
        <p>${this._esc(T ? T.materialIntro : '')}</p>
        <div class="acogida-material-grid">${materialHtml}</div>
        <p class="acogida-material-otros">${this._esc(T ? T.materialOtros : 'Otros (detallar):')} ${this._esc(materialOtros || '______________________________')}</p>
      </div>

      <p class="acogida-acepta">${this._esc(T ? T.aceptacion : '')}</p>

      <div class="acogida-firmas">
        <div class="acogida-firma">
          <div class="acogida-firma-linea"></div>
          <div class="acogida-firma-label">${this._esc(T ? T.firmas.entidad : 'Firma o sello Asociación Grupo Nebak')}</div>
        </div>
        <div class="acogida-firma">
          <div class="acogida-firma-linea"></div>
          <div class="acogida-firma-label">${this._esc(T ? T.firmas.familia : 'Firma Casa de Acogida')}</div>
          <b>${this._esc(familia.nombre || '')}</b>
          <small>DNI/NIF ${this._esc(familia.nif || familia.dni || '—')}</small>
        </div>
      </div>

      <div class="acogida-pie">
        ${(T ? T.pie : []).map(l => `<span>${this._esc(l)}</span>`).join('')}
        <span class="acogida-modelo">Modelo v${this._esc(T ? T.version : '1.0')} · ${this._esc(T ? T.fecha : '')} · Expediente ${this._esc(caso.id || '—')}</span>
      </div>`;
  },

  _buildContratoAcogida(c, logo) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Contrato de acogida temporal</title>
      <style>
        @page{size:A4;margin:1.8cm 2cm}
        body{font:10pt/1.45 Arial,sans-serif;color:#191919;padding:0;margin:0}
        .acogida-header{display:flex;align-items:center;gap:12px;padding-bottom:5px;margin-bottom:6px;border-bottom:3px solid #1FC95B}
        .acogida-header img{width:140px;max-height:44px;object-fit:contain;flex-shrink:0}
        .acogida-title{font-size:12.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.4px;line-height:1.2;margin:0}
        .acogida-top{display:flex;gap:14px;align-items:flex-start;margin-bottom:7px;break-inside:avoid}
        .acogida-foto{flex:0 0 100px;width:100px;height:112px;border:1px solid #9ca3af;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f4f5f7}
        .acogida-foto img{display:block;width:100%;height:100%;object-fit:cover}
        .acogida-foto-vacia{font-size:7.5pt;color:#9aa0a6;letter-spacing:.5px}
        .acogida-partes{flex:1;min-width:0;font-size:9.4pt}
        .acogida-partes p{margin:0 0 3px}
        .acogida-partes b{font-weight:600}
        .acogida-animal{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px 14px;padding:3px 9px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:7px;font-size:8.6pt;break-inside:avoid}
        .acogida-animal .label{font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#9aa0a6}
        .acogida-full{grid-column:1 / -1}
        /* La ficha completa vive en la app: en la hoja, el texto libre se queda
           en las tres líneas del recuadro del formulario para no empujar el
           contrato a una segunda cara. */
        .acogida-full .acogida-val{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
        .acogida-truncado{display:none;margin-top:1px;font-size:7pt;font-style:italic;color:#9aa0a6}
        .acogida-condiciones{margin-bottom:4px}
        .acogida-cond{margin:0 0 1px;font-size:8.5pt;line-height:1.25;text-align:justify;break-inside:avoid}
        .acogida-cond b{font-weight:700}
        .acogida-material{margin:0 0 5px;padding:3px 9px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;break-inside:avoid}
        .acogida-material p{margin:0 0 2px;font-size:7.8pt}
        .acogida-material-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;font-size:7.8pt}
        .acogida-material-item{white-space:nowrap}
        .acogida-material-otros{margin:3px 0 0!important}
        .acogida-acepta{font-size:8.8pt;text-align:justify;margin:0 0 7px;break-inside:avoid}
        .acogida-firmas{display:flex;gap:40px;margin:3px 0 7px;break-inside:avoid}
        .acogida-firma{flex:1;min-width:0;font-size:8.6pt}
        .acogida-firma-linea{height:34px;border-bottom:1px solid #191919}
        .acogida-firma-label{margin-top:3px;font-size:7.8pt;color:#4b5563}
        .acogida-firma b{display:block;margin-top:1px;font-size:8.5pt}
        .acogida-firma small{display:block;color:#6b7280;font-size:7.6pt}
        .acogida-pie{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 14px;border-top:1px solid #e5e7eb;padding-top:4px;font-size:7.2pt;color:#6b7280;text-align:center;break-inside:avoid}
        .acogida-pie .acogida-modelo{flex-basis:100%;font-size:7pt;color:#9aa0a6}
      </style></head><body><div class="acogida-doc">${this._contratoAcogidaBody(c, logo)}</div><script>(function(){function check(){document.querySelectorAll('.acogida-full .acogida-val').forEach(function(el){var n=el.nextElementSibling;if(n&&n.classList.contains('acogida-truncado')){n.style.display=(el.scrollHeight>el.clientHeight+1)?'block':'none';}});}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();window.addEventListener('load',check);window.addEventListener('beforeprint',check);})();</script></body></html>`;
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
        <tr><td class="k">Donaciones por adopcion (contratos)</td><td class="v">${m.donacionAdopcionesN} · ${eur(m.donacionAdopciones)} €</td></tr>
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

      <div class="footer">Generado por Grupo Nebak · Grupo Nebak · Memoria del ejercicio ${m.year} · Documento confidencial</div>
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
    try { if (typeof w.__paginarContrato === 'function') w.__paginarContrato(); } catch { /* sin paginador */ }
    setTimeout(() => { try { if (!w.closed) w.print(); } catch {} }, 150);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = PdfExport;
