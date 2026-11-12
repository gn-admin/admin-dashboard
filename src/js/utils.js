// Utilidades compartidas (Fase 3 - modularización incremental)
const Utils = {
  esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  debounce(fn, delay = 300) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  partesFecha(f) {
    if (!f) return null;
    const s = String(f).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return { y: +m[3], m: +m[2] - 1, d: +m[1] };
    m = s.match(/^(\d{1,2})\s+([a-z]{3,4})\.?\s+(\d{4})/i);
    if (m) {
      const meses = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11 };
      const mes = meses[m[2].toLowerCase()];
      if (mes !== undefined) return { y: +m[3], m: mes, d: +m[1] };
    }
    return null;
  },

  tsFecha(f) {
    if (!f) return 0;
    const p = Utils.partesFecha(f);
    if (p) return Date.UTC(p.y, p.m, p.d);
    const d = Date.parse(String(f).trim().replace(' ', 'T'));
    return isNaN(d) ? 0 : d;
  },

  fechaCorta(d, conHora) {
    const pad = n => String(n).padStart(2, '0');
    const fecha = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    if (!conHora) return fecha;
    const h = d.getHours();
    const sufijo = h >= 12 ? 'PM' : 'AM';
    return `${fecha} ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${sufijo}`;
  },

  fmtFecha(v) {
    if (v === undefined || v === null || v === '') return '—';
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? '—' : Utils.fechaCorta(v, !!(v.getHours() || v.getMinutes()));
    }
    const s = String(v).trim();
    if (!s) return '—';
    let d = null, conHora = false;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      conHora = !!m[4];
    } else if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      conHora = !!m[4];
    } else {
      const p = Utils.partesFecha(s);
      if (p) d = new Date(p.y, p.m, p.d);
    }
    if (!d || isNaN(d.getTime())) return s;
    return Utils.fechaCorta(d, conHora);
  },

  fmtFechaHora(v) {
    if (!v) return '';
    try {
      const d = new Date(String(v).replace(' ', 'T'));
      if (isNaN(d.getTime())) return Utils.fmtFecha(v);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return Utils.fmtFecha(v); }
  }
};
