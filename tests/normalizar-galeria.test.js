'use strict';
/**
 * Normalización de la galería ya guardada (`scripts/normalizar-galeria.mjs`).
 *
 * Las filas `galeria-foto` de la hoja Documentos que tienen el enlace del visor
 * de Drive no se pintan en el carrusel del panel: hay que reescribir su `url`
 * con el thumbnail, sin tocar ninguna otra fila ni volver a subir nada.
 */
const { test } = require('node:test');
const assert = require('node:assert');

let mod;
async function modulo() {
  return (mod ||= await import('../scripts/normalizar-galeria.mjs'));
}

test('thumbnailDrive arma el thumbnail con el tamaño pedido', async () => {
  const { thumbnailDrive } = await modulo();
  assert.equal(thumbnailDrive('ABC123'), 'https://drive.google.com/thumbnail?id=ABC123&sz=w1600');
  assert.equal(thumbnailDrive('ABC123', 'w800'), 'https://drive.google.com/thumbnail?id=ABC123&sz=w800');
  assert.equal(thumbnailDrive(''), '');
  assert.equal(thumbnailDrive(null), '');
});

test('idDrive saca el id de file_id, del visor, de uc?id y de un id suelto', async () => {
  const { idDrive } = await modulo();
  assert.equal(idDrive('1AbCdEfGhIjKlMnOpQrS'), '1AbCdEfGhIjKlMnOpQrS');
  assert.equal(idDrive('https://drive.google.com/file/d/XYZ9/view?usp=drivesdk'), 'XYZ9');
  assert.equal(idDrive('https://drive.google.com/uc?id=QWE12&export=download'), 'QWE12');
  assert.equal(idDrive('https://drive.google.com/thumbnail?id=TH1&sz=w800'), 'TH1');
  assert.equal(idDrive('assets/fotos/luna.jpg'), '');
  assert.equal(idDrive('https://ejemplo.org/foto.jpg?id=1234'), '');
  assert.equal(idDrive(''), '');
});

test('solo normaliza galeria-foto y solo las que tienen el visor', async () => {
  const { planificarNormalizacion } = await modulo();
  const documentos = [
    { id: 'd1', tipo: 'galeria-foto', file_id: 'FOTO1', url: 'https://drive.google.com/file/d/FOTO1/view?usp=sharing' },
    { id: 'd2', tipo: 'galeria-foto', file_id: 'FOTO2', url: 'https://drive.google.com/thumbnail?id=FOTO2&sz=w1600' },
    { id: 'd3', tipo: 'galeria-foto', url: 'https://drive.google.com/uc?id=FOTO3&export=download' },
    { id: 'd4', tipo: 'galeria-video', file_id: 'VID1', url: 'https://drive.google.com/file/d/VID1/view' },
    { id: 'd5', tipo: 'Cartilla', file_id: 'DOC1', url: 'https://drive.google.com/file/d/DOC1/view' },
    { id: 'd6', tipo: 'galeria-foto', url: 'https://ejemplo.org/foto.jpg' }
  ];

  const plan = planificarNormalizacion(documentos);
  assert.equal(plan.total, 4);
  assert.equal(plan.yaNormalizadas, 1);
  assert.equal(plan.sinId.length, 1);
  assert.equal(plan.sinId[0].id, 'd6');
  assert.deepEqual(plan.cambios.map(c => c.id), ['d1', 'd3']);
  assert.equal(plan.cambios[0].despues, 'https://drive.google.com/thumbnail?id=FOTO1&sz=w1600');
  assert.equal(plan.cambios[1].despues, 'https://drive.google.com/thumbnail?id=FOTO3&sz=w1600');
});

test('el plan prioriza el file_id de la fila sobre el id de la URL', async () => {
  const { planificarNormalizacion } = await modulo();
  const plan = planificarNormalizacion([
    { id: 'd1', tipo: 'galeria-foto', file_id: 'BUENO', url: 'https://drive.google.com/file/d/OTRO/view' }
  ]);
  assert.equal(plan.cambios[0].file_id, 'BUENO');
  assert.equal(plan.cambios[0].despues, 'https://drive.google.com/thumbnail?id=BUENO&sz=w1600');
});

test('es idempotente: tras normalizar no quedan cambios', async () => {
  const { planificarNormalizacion } = await modulo();
  const documentos = [
    { id: 'd1', tipo: 'galeria-foto', file_id: 'FOTO1', url: 'https://drive.google.com/file/d/FOTO1/view' }
  ];
  const plan = planificarNormalizacion(documentos);
  documentos[0].url = plan.cambios[0].despues;
  const otra = planificarNormalizacion(documentos);
  assert.equal(otra.cambios.length, 0);
  assert.equal(otra.yaNormalizadas, 1);
});

test('entradas vacías o raras no rompen', async () => {
  const { planificarNormalizacion } = await modulo();
  const vacio = planificarNormalizacion(null);
  assert.equal(vacio.total, 0);
  assert.deepEqual(vacio.filas, []);
  assert.deepEqual(vacio.cambios, []);
  assert.equal(vacio.yaNormalizadas, 0);
  const plan = planificarNormalizacion([null, {}, { tipo: 'GALERIA-FOTO', file_id: 'F1', url: '' }]);
  assert.equal(plan.total, 1);
  assert.equal(plan.cambios.length, 1);
});
