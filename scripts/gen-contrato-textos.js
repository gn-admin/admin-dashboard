#!/usr/bin/env node
/**
 * Genera el bloque CONTRATO_TEXTOS_PDF de apps-script/Code.gs desde la fuente
 * única src/js/contrato-textos.js. Así el PDF del servidor usa exactamente las
 * mismas 20 estipulaciones y el mismo anexo que el modal y PdfExport, sin
 * mantener una segunda copia a mano.
 *
 * Uso: node scripts/gen-contrato-textos.js
 * El test tests/contrato-pdf-textos.test.js falla si el bloque se desincroniza.
 */
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const fuente = require(path.join(raiz, 'src/js/contrato-textos.js'));
const codePath = path.join(raiz, 'apps-script/Code.gs');
const inicio = '// === CONTRATO_TEXTOS_PDF:INICIO ===';
const fin = '// === CONTRATO_TEXTOS_PDF:FIN ===';

const json = JSON.stringify(JSON.parse(JSON.stringify(fuente)), null, 2);
const bloque = inicio + '\nvar CONTRATO_TEXTOS_PDF = ' + json + ';\n' + fin;

let code = fs.readFileSync(codePath, 'utf8');
const i = code.indexOf(inicio);
const f = code.indexOf(fin);
if (i === -1 || f === -1 || f < i) {
  console.error('No encuentro los marcadores CONTRATO_TEXTOS_PDF en Code.gs');
  process.exit(1);
}
code = code.slice(0, i) + bloque + code.slice(f + fin.length);
fs.writeFileSync(codePath, code);
console.log('CONTRATO_TEXTOS_PDF actualizado desde src/js/contrato-textos.js');
