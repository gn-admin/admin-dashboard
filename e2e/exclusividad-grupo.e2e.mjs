/**
 * E2E real: exclusividad 1:1 entre la publicación de un grupo y la ficha
 * individual de sus miembros.
 *
 *   AUDIT_PASSWORD=... node e2e/exclusividad-grupo.e2e.mjs
 *
 * Con datos temporales comprueba en el backend desplegado:
 *   1. El grupo se puede publicar si ningún miembro tiene ficha individual
 *      publicada (se crea una individual en borrador para que el rechazo no se
 *      confunda con «faltan campos»).
 *   2. Con el grupo publicado, publicar la ficha de un miembro se rechaza y el
 *      aviso nombra el grupo y su slug. Se prueban las dos vías de escritura
 *      (`web-animales-estado` y el upsert `web-animales`).
 *   3. El listado `web-animales` marca `grupo_publicado` en el miembro.
 *   4. Un slug anterior del grupo responde 301 al actual, tanto en
 *      `publicacion?slug=` como en `redirects`.
 *
 * La 301 `ficha_en_grupo` (individual publicada superada por su grupo) no se
 * puede provocar desde la API: las dos direcciones están bloqueadas. Ese caso
 * queda cubierto por `tests/web-backend.test.js` y por los datos heredados; aquí
 * solo se comprueba que no hay redirecciones de ese tipo pendientes.
 *
 * Al terminar elimina los dos registros temporales, aunque la prueba falle.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CONFIG = require('../src/js/config.js');

const PASSWORD = process.env.AUDIT_PASSWORD;
const EMAIL = 'gn.test.admin@example.test';
if (!PASSWORD) {
  console.error('Falta AUDIT_PASSWORD (contraseña de los usuarios de prueba).');
  process.exit(1);
}

const sufijo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SLUG_INDIV = 'e2e-individual-' + sufijo;
const SLUG_GRUPO = 'e2e-grupo-' + sufijo;
const SLUG_GRUPO_V2 = SLUG_GRUPO + '-v2';
const CONTENIDO = 'Publicación temporal de la prueba E2E de exclusividad 1:1. Se elimina al terminar.';

const fallos = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fallo = (msg) => { console.log('  ✘ ' + msg); fallos.push(msg); };

let token = '';
let animalId = '';
let grupoId = '';
let publicacionCreada = false;
let individualCreada = false;
let creadoGrupoId = '';
let creadoIndivId = '';
/** Fotos de las publicaciones preexistentes: animal_id → «publicacion_id|estado». */
let snapshotAntes = new Map();

async function sesionREST() {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CONFIG.firebase.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    signal: AbortSignal.timeout(20000)
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('login: ' + ((j.error && j.error.message) || r.status));
  token = j.idToken;
}

async function api(endpoint, body, conToken = true) {
  const [nombre, ...resto] = String(endpoint).split('&');
  const qs = '?endpoint=' + encodeURIComponent(nombre) + (resto.length ? '&' + resto.join('&') : '') + (conToken ? '&token=' + encodeURIComponent(token) : '');
  const opts = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  };
  const res = await fetch(CONFIG.apiUrl + qs, { signal: AbortSignal.timeout(60000), ...opts });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return data || { status: 'error', error: 'respuesta no JSON (' + res.status + ')' };
}

const filas = (res) => (res && Array.isArray(res.data) ? res.data : []);

const grupoDe = (a) => a.grupo || a.grupo_id || a.grupo_nombre || '';

/**
 * Grupo publicable: 2+ miembros vivos, alguno con foto (portada del grupo) y
 * **sin publicación web**. El miembro elegido tampoco puede tener publicación
 * individual: el test la crearía y la borraría en la limpieza, y no debe tocar
 * una que ya exista.
 */
async function elegirGrupo(previas) {
  const conPublicacion = new Set(previas.filter((r) => r.publicacion_id).map((r) => String(r.animal_id)));
  const lista = await api('web-grupos&todos=1');
  const grupos = filas(lista);
  const animales = filas(await api('animales'));
  for (const g of grupos) {
    const id = String(g.grupo_id || g.origen_id || '');
    const nombre = String(g.nombre || g.titulo || '');
    if (!id || g.publicacion_id || g.estado_publicacion !== 'sin_publicar') continue; // ya tiene publicación web: no se toca
    const miembros = animales.filter((a) => String(grupoDe(a) || '').trim() === nombre.trim());
    if (miembros.length < 2) continue;
    const vivos = miembros.every((a) => ['disponible', 'en_acogida'].indexOf(String(a.estado || '').toLowerCase()) !== -1);
    if (!vivos) continue;
    if (!miembros.some((a) => a.foto_url || a.foto)) continue; // sin portada el grupo no se puede publicar
    const libre = miembros.find((a) => !conPublicacion.has(String(a.id)));
    if (!libre) continue; // todos los miembros ya tienen individual: no se toca
    return { id, nombre, miembro: libre };
  }
  return null;
}

/**
 * Limpieza defensiva: solo borra las filas que creó este test, comprobando el
 * id de publicación guardado al crearlas. Si la fila ya no es la suya (alguien
 * la recreó o cambió), no se toca y se avisa.
 */
async function limpiar() {
  if (publicacionCreada && creadoGrupoId) {
    const detalle = await api('web-grupos&id=' + grupoId).catch(() => null);
    const actual = detalle && detalle.data && detalle.data.id;
    if (actual && actual !== creadoGrupoId) {
      fallo('la publicación de grupo ya no es la del test (' + actual + '); no se toca');
    } else if (actual) {
      await api('web-grupos-estado', { grupo_id: grupoId, estado_publicacion: 'oculto' }).catch(() => null);
      const del = await api('web-grupos', { accion: 'eliminar', grupo_id: grupoId }).catch(() => null);
      if (del && del.status === 'success') console.log('  · publicación de grupo eliminada');
      else fallo('no se pudo eliminar la publicación de grupo: ' + JSON.stringify(del).slice(0, 200));
    }
  }
  if (individualCreada && creadoIndivId) {
    const fila = filas(await api('web-animales')).find((x) => String(x.animal_id) === animalId);
    const actual = fila && fila.publicacion_id;
    if (actual && actual !== creadoIndivId) {
      fallo('la publicación individual del miembro ya no es la del test (' + actual + '); no se toca');
    } else if (actual) {
      const del = await api('web-animales', { accion: 'eliminar', animal_id: animalId }).catch(() => null);
      if (del && del.status === 'success') console.log('  · publicación individual eliminada');
      else fallo('no se pudo eliminar la publicación individual: ' + JSON.stringify(del).slice(0, 200));
    }
  }
}

async function main() {
  console.log('E2E exclusividad 1:1 (datos temporales) · sufijo ' + sufijo);
  await sesionREST();
  ok('sesión REST como admin');

  const previas = filas(await api('web-animales'));
  snapshotAntes = new Map(previas.map((r) => [String(r.animal_id), String(r.publicacion_id || '') + '|' + String(r.estado_publicacion || '')]));

  const elegido = await elegirGrupo(previas);
  if (!elegido) throw new Error('no hay ningún grupo publicable sin publicación web; no se toca nada');
  grupoId = elegido.id;
  animalId = String(elegido.miembro.id);
  const yaTieneIndiv = previas.find((r) => String(r.animal_id) === animalId && r.publicacion_id);
  if (yaTieneIndiv) {
    throw new Error('el miembro «' + elegido.miembro.nombre + '» ya tiene publicación individual (' + yaTieneIndiv.publicacion_id + '); se aborta para no sobrescribirla ni borrarla');
  }
  console.log('  · grupo ' + grupoId + ' «' + elegido.nombre + '», miembro ' + elegido.miembro.nombre + ' (sin publicación individual)');

  // 1. Individual en borrador (para que el rechazo posterior sea del grupo).
  const indiv = await api('web-animales', {
    animal_id: animalId, titulo: 'ZZ E2E Individual ' + sufijo, slug: SLUG_INDIV,
    extracto: 'Prueba E2E', contenido_html: CONTENIDO, estado_publicacion: 'borrador'
  });
  if (indiv.status !== 'success') throw new Error('no se pudo crear la individual: ' + (indiv.error || indiv.status));
  creadoIndivId = String((indiv.data && indiv.data.id) || '');
  if (!creadoIndivId) throw new Error('el alta individual no devolvió id; se aborta para no borrar a ciegas');
  individualCreada = true;
  ok('individual en borrador creada (' + SLUG_INDIV + ', ' + creadoIndivId + ')');

  // 2. Publicación de grupo en borrador.
  const grupo = await api('web-grupos', {
    grupo_id: grupoId, titulo: elegido.nombre, slug: SLUG_GRUPO,
    extracto: 'Prueba E2E', contenido_html: CONTENIDO, estado_publicacion: 'borrador'
  });
  if (grupo.status !== 'success') throw new Error('no se pudo crear la publicación de grupo: ' + (grupo.error || grupo.status));
  creadoGrupoId = String((grupo.data && grupo.data.id) || '');
  if (!creadoGrupoId) throw new Error('el alta de grupo no devolvió id; se aborta para no borrar a ciegas');
  publicacionCreada = true;
  ok('publicación de grupo en borrador creada (' + SLUG_GRUPO + ', ' + creadoGrupoId + ')');

  // 3. Publicar el grupo.
  const pub = await api('web-grupos-estado', { grupo_id: grupoId, estado_publicacion: 'publicado' });
  if (pub.status !== 'success') {
    throw new Error('no se pudo publicar el grupo: ' + (pub.error || pub.status) + (pub.detail ? ' · ' + pub.detail : ''));
  }
  ok('grupo publicado');

  const publica = await api('publicacion&slug=' + SLUG_GRUPO, undefined, false);
  if (publica.status === 'success' && publica.data && publica.data.slug === SLUG_GRUPO) ok('el canal público sirve el grupo');
  else fallo('el canal público no sirve el grupo: ' + JSON.stringify(publica).slice(0, 200));

  // 4. Publicar la ficha individual: debe rechazarse por el grupo.
  const estado = await api('web-animales-estado', { animal_id: animalId, estado_publicacion: 'publicado' });
  if (estado.status === 'warning' && String(estado.error || '').indexOf(elegido.nombre) !== -1 && String(estado.error || '').indexOf(SLUG_GRUPO) !== -1) {
    ok('web-animales-estado rechaza publicar el miembro: «' + estado.error + '»');
  } else {
    fallo('web-animales-estado no rechazó como se esperaba: ' + JSON.stringify(estado).slice(0, 300));
  }

  const upsert = await api('web-animales', {
    animal_id: animalId, titulo: 'ZZ E2E Individual ' + sufijo, slug: SLUG_INDIV,
    extracto: 'Prueba E2E', contenido_html: CONTENIDO, estado_publicacion: 'publicado'
  });
  if (upsert.status === 'warning' && String(upsert.error || '').indexOf(elegido.nombre) !== -1) {
    ok('el upsert web-animales también rechaza publicar el miembro');
  } else {
    fallo('el upsert no rechazó: ' + JSON.stringify(upsert).slice(0, 300));
  }

  const lista = filas(await api('web-animales')).find((x) => String(x.animal_id) === animalId);
  // `grupo_publicado` lleva el nombre del grupo (lo que muestra el selector), no el slug.
  if (lista && lista.grupo_publicado === elegido.nombre) ok('el listado marca grupo_publicado en el miembro');
  else fallo('el listado no trae grupo_publicado: ' + JSON.stringify(lista || {}).slice(0, 200));

  // 5. 301 de un slug anterior del grupo al actual.
  const renombrado = await api('web-grupos', {
    grupo_id: grupoId, titulo: elegido.nombre, slug: SLUG_GRUPO_V2,
    extracto: 'Prueba E2E', contenido_html: CONTENIDO, estado_publicacion: 'publicado'
  });
  if (renombrado.status !== 'success') {
    fallo('no se pudo renombrar el slug del grupo: ' + JSON.stringify(renombrado).slice(0, 200));
  } else {
    const viejo = await api('publicacion&slug=' + SLUG_GRUPO, undefined, false);
    if (viejo.redirect && viejo.redirect.permanent === true && viejo.redirect.slug === SLUG_GRUPO_V2) {
      ok('el slug anterior responde 301 al actual (' + viejo.redirect.from + ' → ' + viejo.redirect.to + ')');
    } else {
      fallo('el slug anterior no redirige: ' + JSON.stringify(viejo).slice(0, 250));
    }
    const red = await api('redirects', undefined, false);
    const entrada = filas(red).find((e) => String(e.from || '').indexOf(SLUG_GRUPO) !== -1 && String(e.to || '').indexOf(SLUG_GRUPO_V2) !== -1);
    if (entrada && entrada.status === 301) ok('`redirects` publica la 301 del slug anterior');
    else fallo('`redirects` no publica la 301: ' + JSON.stringify(red).slice(0, 250));
  }

  const fichaEnGrupo = filas(await api('redirects', undefined, false)).filter((e) => e && e.motivo === 'ficha_en_grupo');
  if (!fichaEnGrupo.length) ok('sin 301 ficha_en_grupo pendientes (no hay datos heredados en conflicto)');
  else console.log('  · hay ' + fichaEnGrupo.length + ' redirección(es) ficha_en_grupo de datos heredados');
}

try {
  await main();
} catch (err) {
  fallo('excepción: ' + (err && err.message ? err.message : err));
} finally {
  try { await limpiar(); } catch (err) { fallo('limpieza: ' + (err && err.message ? err.message : err)); }
  // Estado final: el grupo vuelve a no tener publicación y no quedan filas con
  // nuestros slugs.
  try {
    const g = await api('web-grupos&id=' + grupoId);
    const vuelve = !g || !g.data || !g.data.id;
    if (vuelve) ok('el grupo queda sin publicación web');
    else fallo('el grupo conserva publicación: ' + JSON.stringify(g.data).slice(0, 200));
    const ahora = filas(await api('web-animales'));
    const restos = ahora.filter((x) => String(x.slug || '').indexOf(sufijo) !== -1);
    const restosGrupo = filas(await api('web-grupos&todos=1')).filter((x) => String(x.slug || '').indexOf(sufijo) !== -1);
    if (!restos.length && !restosGrupo.length) ok('sin restos temporales en el gestor');
    else fallo('quedan restos: ' + JSON.stringify(restos.concat(restosGrupo)).slice(0, 300));

    // Las publicaciones que ya existían no cambian (ni de id ni de estado), y el
    // miembro vuelve a quedarse sin ficha individual.
    const mapaAhora = new Map(ahora.map((r) => [String(r.animal_id), String(r.publicacion_id || '') + '|' + String(r.estado_publicacion || '')]));
    const tocadas = [];
    snapshotAntes.forEach((valor, animal) => {
      if (mapaAhora.get(animal) !== valor) tocadas.push(animal + ': ' + valor + ' → ' + (mapaAhora.get(animal) || 'sin fila'));
    });
    if (!tocadas.length) ok('las ' + snapshotAntes.size + ' publicaciones previas siguen intactas');
    else fallo('cambió alguna publicación previa: ' + tocadas.join(' | '));

    const miembro = ahora.find((x) => String(x.animal_id) === animalId);
    if (!miembro || !miembro.publicacion_id) ok('el miembro vuelve a estar sin publicación individual');
    else fallo('el miembro conserva publicación: ' + miembro.publicacion_id);
  } catch (err) {
    fallo('verificación final: ' + (err && err.message ? err.message : err));
  }
  console.log(fallos.length ? '\nFALLOS (' + fallos.length + ')' : '\nTODO EN VERDE');
  fallos.forEach((f) => console.log(' - ' + f));
  process.exit(fallos.length ? 1 : 0);
}
