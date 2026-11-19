/**
 * E2E real: media del gestor en Drive (`web-media-subir` / `web-media-eliminar`).
 *
 *   AUDIT_PASSWORD=... node e2e/media-drive.e2e.mjs
 *
 * Con una publicación de borrador temporal comprueba contra el backend
 * desplegado que `DRIVE_WEB_FOLDER_ID` está configurado y es accesible:
 *   1. La portada (imagen) se sube a `animales/<slug>` y queda compartida
 *      (se descarga sin sesión).
 *   2. Un documento de la misma ficha se sube a la misma carpeta y **no** se
 *      comparte (sin sesión no se puede descargar).
 *   3. El borrado con el `publicacion_id` de otra ficha se rechaza («el archivo
 *      no pertenece a la carpeta de esta publicación»), lo que prueba que el
 *      archivo está realmente dentro de la carpeta de esta publicación.
 *   4. Se borran los dos archivos y la publicación de borrador.
 *
 * No toca publicaciones existentes: aborta si el animal elegido ya tiene
 * publicación y solo elimina las filas/archivos que crea.
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

// PNG 1x1 transparente y PDF mínimo: suficientes para probar tipos y permisos.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+PgplbmRvYmoKdHJhaWxlcgo8PC9Sb290IDEgMCBSPj4KJSVFT0YK';

const sufijo = 'media' + Date.now().toString(36);
const SLUG = 'e2e-media-' + sufijo;
const CONTENIDO = 'Publicación temporal de la prueba E2E de media en Drive. Se elimina al terminar.';

const fallos = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fallo = (msg) => { console.log('  ✘ ' + msg); fallos.push(msg); };

let token = '';
let animalId = '';
let publicacionId = '';
let creada = false;
const archivos = [];

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

async function api(endpoint, body) {
  const [nombre, ...resto] = String(endpoint).split('&');
  const qs = '?endpoint=' + encodeURIComponent(nombre) + (resto.length ? '&' + resto.join('&') : '') + '&token=' + encodeURIComponent(token);
  const opts = body === undefined ? { signal: AbortSignal.timeout(60000) } : {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000)
  };
  const res = await fetch(CONFIG.apiUrl + qs, opts);
  try { return await res.json(); } catch { return { status: 'error', error: 'respuesta no JSON (' + res.status + ')' }; }
}

/** Sin cookies ni token: como un visitante anónimo de la web. */
async function publico(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
  const tipo = String(res.headers.get('content-type') || '');
  const html = tipo.indexOf('text/html') === 0 ? (await res.text()).slice(0, 200).toLowerCase() : '';
  return {
    status: res.status,
    tipo,
    esImagen: tipo.indexOf('image/') === 0,
    pareceLogin: /accounts\.google\.com|signin|inicia sesi/.test(res.url + ' ' + html)
  };
}

async function limpiar() {
  for (const a of archivos) {
    const del = await api('web-media-eliminar', { file_id: a.fileId, publicacion_id: publicacionId }).catch(() => null);
    if (del && del.status === 'success') console.log('  · archivo eliminado (' + a.nombre + ')');
    else fallo('no se pudo eliminar el archivo ' + a.nombre + ': ' + JSON.stringify(del).slice(0, 160));
  }
  if (creada) {
    const del = await api('web-animales', { accion: 'eliminar', animal_id: animalId }).catch(() => null);
    if (del && del.status === 'success') console.log('  · publicación de borrador eliminada');
    else fallo('no se pudo eliminar la publicación de borrador: ' + JSON.stringify(del).slice(0, 160));
  }
}

async function main() {
  console.log('E2E media en Drive · sufijo ' + sufijo);
  await sesionREST();
  ok('sesión REST como admin');

  const filasA = (await api('web-animales')).data || [];
  const libre = filasA.find((x) => x && !x.publicacion_id);
  const conPublicacion = filasA.find((x) => x && x.publicacion_id);
  if (!libre) throw new Error('no hay ningún animal sin publicación web; no se toca nada');
  if (!conPublicacion) throw new Error('hace falta otra publicación para probar el rechazo de carpeta');
  animalId = String(libre.animal_id);
  console.log('  · animal «' + libre.nombre + '» (' + animalId + '), control «' + conPublicacion.nombre + '»');

  const alta = await api('web-animales', {
    animal_id: animalId, titulo: 'ZZ E2E Media ' + sufijo, slug: SLUG,
    extracto: 'Prueba E2E', contenido_html: CONTENIDO, estado_publicacion: 'borrador'
  });
  if (alta.status !== 'success') throw new Error('no se pudo crear el borrador: ' + (alta.error || alta.status));
  publicacionId = String((alta.data && alta.data.id) || '');
  if (!publicacionId) throw new Error('el alta no devolvió id; se aborta');
  creada = true;
  ok('publicación de borrador creada (' + SLUG + ', ' + publicacionId + ')');

  // 1. Portada (imagen): debe quedar en la carpeta de la ficha y compartida.
  const img = await api('web-media-subir', {
    publicacion_id: publicacionId, tipo: 'portada', archivo_base64: PNG,
    nombre: 'portada-e2e.png', mime_type: 'image/png'
  });
  if (img.status !== 'success') throw new Error('la portada no se subió: ' + (img.error || img.status));
  archivos.push(img.data);
  const carpetaEsperada = 'animales/' + SLUG;
  if (img.data.carpeta === carpetaEsperada) ok('portada en la carpeta «' + img.data.carpeta + '»');
  else fallo('carpeta inesperada para la portada: «' + img.data.carpeta + '» (esperaba «' + carpetaEsperada + '»)');
  if (img.data.carpeta_id) ok('la carpeta tiene id de Drive (existe de verdad)');
  else fallo('la respuesta no trae carpeta_id');
  if (String(img.data.url || '').indexOf('thumbnail?id=' + img.data.fileId) !== -1) ok('la URL de la portada es la miniatura del archivo subido');
  else fallo('URL de portada inesperada: ' + img.data.url);

  const imgPublica = await publico(img.data.url);
  if (imgPublica.status === 200 && (imgPublica.esImagen || imgPublica.status === 200)) ok('la portada se descarga sin sesión (status ' + imgPublica.status + ', ' + imgPublica.tipo + ')');
  else fallo('la portada no es pública: ' + JSON.stringify(imgPublica));

  // 2. Documento de la misma ficha: misma carpeta, pero privado.
  const doc = await api('web-media-subir', {
    publicacion_id: publicacionId, tipo: 'documento', archivo_base64: PDF,
    nombre: 'documento-e2e.pdf', mime_type: 'application/pdf'
  });
  if (doc.status !== 'success') throw new Error('el documento no se subió: ' + (doc.error || doc.status));
  archivos.push(doc.data);
  if (doc.data.carpeta === carpetaEsperada) ok('documento en la misma carpeta de la ficha');
  else fallo('carpeta inesperada para el documento: «' + doc.data.carpeta + '»');
  const docPublico = await publico(doc.data.download);
  const docPrivado = !(docPublico.status === 200 && docPublico.tipo.indexOf('application/pdf') === 0);
  if (docPrivado) ok('el documento NO es descargable sin sesión (status ' + docPublico.status + (docPublico.pareceLogin ? ', pide login' : '') + ')');
  else fallo('el documento quedó público: ' + JSON.stringify(docPublico));

  // 3. Borrado con la publicación de otra ficha: debe rechazarse.
  const ajeno = await api('web-media-eliminar', { file_id: img.data.fileId, publicacion_id: conPublicacion.publicacion_id });
  if (ajeno.status === 'error' && /no pertenece/i.test(String(ajeno.error || ''))) ok('el borrado con otra ficha se rechaza: «' + ajeno.error + '»');
  else fallo('el borrado con otra ficha no se rechazó: ' + JSON.stringify(ajeno).slice(0, 200));

  // 4. Borrado correcto con su publicación.
  const propio = await api('web-media-eliminar', { file_id: img.data.fileId, publicacion_id: publicacionId });
  if (propio.status === 'success') {
    ok('la portada se borra con su publicación');
    archivos.splice(0, 1); // ya eliminada: no repetir en la limpieza
  } else {
    fallo('no se pudo borrar la portada: ' + JSON.stringify(propio).slice(0, 200));
  }
  const trasBorrar = await publico(img.data.url);
  if (trasBorrar.status !== 200) ok('la URL de la portada deja de servir tras borrarla (' + trasBorrar.status + ')');
  else fallo('la portada borrada sigue sirviéndose públicamente');
}

try {
  await main();
} catch (err) {
  fallo('excepción: ' + (err && err.message ? err.message : err));
} finally {
  try { await limpiar(); } catch (err) { fallo('limpieza: ' + (err && err.message ? err.message : err)); }
  try {
    const filas = (await api('web-animales')).data || [];
    const restos = filas.filter((x) => String(x.slug || '') === SLUG);
    if (!restos.length) ok('sin restos de la publicación temporal');
    else fallo('queda la publicación temporal: ' + JSON.stringify(restos).slice(0, 200));
    const miembro = filas.find((x) => String(x.animal_id) === animalId);
    if (!miembro || !miembro.publicacion_id) ok('el animal vuelve a estar sin publicación web');
    else fallo('el animal conserva publicación: ' + miembro.publicacion_id);
  } catch (err) {
    fallo('verificación final: ' + (err && err.message ? err.message : err));
  }
  console.log(fallos.length ? '\nFALLOS (' + fallos.length + ')' : '\nTODO EN VERDE');
  fallos.forEach((f) => console.log(' - ' + f));
  process.exit(fallos.length ? 1 : 0);
}
