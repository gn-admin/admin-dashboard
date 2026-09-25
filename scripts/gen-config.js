#!/usr/bin/env node
/**
 * Genera la configuración real a partir del entorno (.env o variables del CI).
 *
 *   node scripts/gen-config.js
 *
 * Escribe:
 *   - src/js/config.js       (configuración del frontend)
 *   - apps-script/Config.gs  (configuración del backend Apps Script)
 *
 * Ninguno de los dos ficheros generados debe subirse a git: contienen los
 * valores reales (claves Firebase, IDs de hojas/formularios).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

function loadEnv() {
  const out = {};
  if (fs.existsSync(ENV_PATH)) {
    const raw = fs.readFileSync(ENV_PATH, 'utf8');
    for (let line of raw.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[k] = v;
    }
  }
  return out;
}

const envFile = loadEnv();
const env = (k, def = '') => {
  if (process.env[k] !== undefined && process.env[k] !== '') return process.env[k];
  if (envFile[k] !== undefined && envFile[k] !== '') return envFile[k];
  return def;
};

function writeFile(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  console.log('Generado: ' + rel);
}

/* ------------------------- FRONTEND: config.js ------------------------- */
const frontConfig = `/**
 * Configuración del frontend.
 * Archivo GENERADO por scripts/gen-config.js a partir de .env (no editar a mano).
 */

const CONFIG = {
  apiUrl: '${env('API_URL')}',

  firebase: {
    apiKey: '${env('FIREBASE_API_KEY')}',
    authDomain: '${env('FIREBASE_AUTH_DOMAIN')}',
    projectId: '${env('FIREBASE_PROJECT_ID')}',
    storageBucket: '${env('FIREBASE_STORAGE_BUCKET')}',
    messagingSenderId: '${env('FIREBASE_MESSAGING_SENDER_ID')}',
    appId: '${env('FIREBASE_APP_ID')}'
  },

  app: {
    name: 'GN-Encuestas',
    version: '1.0.0',
    pdfDefaultTitle: 'Reporte de Encuestas'
  },

  contacto: {
    telefono: '${env('CONTACTO_TELEFONO')}',
    email: '${env('CONTACTO_EMAIL')}'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
`;
writeFile('src/js/config.js', frontConfig);

/* ------------------------- BACKEND: Config.gs ------------------------- */
function sheetsBlock() {
  const rows = [
    ['estados', 'SHEET_ESTADOS_ID', 'Estados'],
    ['notas', 'SHEET_NOTAS_ID', 'Notas']
  ];
  return rows.map(([key, envK, name]) => `    ${key}: { sheetId: '${env(envK)}', sheetName: '${name}' }`).join(',\n');
}

const backendConfig = `var CONFIG = {
  FIREBASE_PROJECT_ID: '${env('FIREBASE_PROJECT_ID')}',
  FIREBASE_API_KEY: '${env('FIREBASE_API_KEY')}',
  ALLOWED_ORIGINS: ${env('APPS_SCRIPT_ALLOWED_ORIGINS', '["https://tusuario.github.io","http://localhost:8080","http://localhost:3000"]')},
  RATE_LIMIT: 100,
  REQUIRE_EMAIL_VERIFIED: ${env('APPS_SCRIPT_REQUIRE_EMAIL_VERIFIED', 'false') === 'true' ? 'true' : 'false'},
  ALLOW_ORIGIN_EMPTY: ${env('APPS_SCRIPT_ALLOW_ORIGIN_EMPTY', 'false') === 'true' ? 'true' : 'false'},
  DRIVE_FOTOS_FOLDER_ID: '${env('APPS_SCRIPT_DRIVE_FOTOS_FOLDER_ID', '')}',
  ROLES: { ADMIN: 'admin', USER: 'usuario' },

  surveys: {
    'pre-adopcion-perros': {
      name: 'Encuesta Pre-Adopcion Perros',
      formId: '${env('FORM_PERROS_ID')}',
      sheetId: '${env('SHEET_PERROS_ID')}',
      sheetName: 'Respuestas de formulario 1',
      visible: true
    },
    'pre-adopcion-gatos': {
      name: 'Encuesta Pre-Adopcion Gatos',
      formId: '${env('FORM_GATOS_ID')}',
      sheetId: '${env('SHEET_GATOS_ID')}',
      sheetName: 'Respuestas de formulario 1',
      visible: true
    },
    'pre-acogida': {
      name: 'Solicitud de Acogida',
      formId: '${env('FORM_ACOGIDA_ID')}',
      sheetId: '${env('SHEET_ACOGIDA_ID')}',
      sheetName: 'Respuestas de formulario 1',
      visible: true
    }
  },

  sheets: {
    animales: { sheetId: '${env('SHEET_ANIMALES_ID')}', sheetName: 'Animales' },
    familias: { sheetId: '${env('SHEET_FAMILIAS_ID')}', sheetName: 'Familias' },
    adopciones: { sheetId: '${env('SHEET_ADOPCIONES_ID')}', sheetName: 'Adopciones' },
    socios: { sheetId: '${env('SHEET_SOCIOS_ID')}', sheetName: 'Socios' },
    blacklist: { sheetId: '${env('SHEET_BLACKLIST_ID')}', sheetName: 'Blacklist' },
    actividad: { sheetId: '${env('SHEET_ACTIVIDAD_ID')}', sheetName: 'Actividad' },
    candidaturas: { sheetId: '${env('SHEET_CANDIDATURAS_ID')}', sheetName: 'Candidaturas' },
    acogidas: { sheetId: '${env('SHEET_ACOGIDAS_ID')}', sheetName: 'Acogidas' },
    contratos: { sheetId: '${env('SHEET_CONTRATOS_ID')}', sheetName: 'Contratos' },
    apadrinamientos: { sheetId: '${env('SHEET_APADRINAMIENTOS_ID')}', sheetName: 'Apadrinamientos' },
    gastos: { sheetId: '${env('SHEET_GASTOS_ID')}', sheetName: 'Gastos' },
    recordatorios: { sheetId: '${env('SHEET_RECORDATORIOS_ID')}', sheetName: 'Recordatorios' },
    donaciones: { sheetId: '${env('SHEET_DONACIONES_ID')}', sheetName: 'Donaciones' },
    seguimientos: { sheetId: '${env('SHEET_SEGUIMIENTOS_ID')}', sheetName: 'Seguimientos' },
${sheetsBlock()}
  }
};
`;
writeFile('apps-script/Config.gs', backendConfig);