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
  },

  recaptchaSiteKey: '${env('RECAPTCHA_SITE_KEY', '')}',

  // Datos que aparecen en los contratos. Si no se configuran, el documento
  // solo muestra el nombre y los datos de contacto disponibles.
  asociacion: {
    nombre: '${env('ASOCIACION_NOMBRE', 'Asociación Grupo Nebak')}',
    cif: '${env('ASOCIACION_CIF')}',
    domicilio: '${env('ASOCIACION_DOMICILIO')}',
    registro: '${env('ASOCIACION_REGISTRO')}',
    web: '${env('ASOCIACION_WEB')}'
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
    ['notas', 'SHEET_NOTAS_ID', 'Notas'],
    // Valores opcionales: si no están en .env se mantiene el placeholder original
    // (nunca se escribe vacío, para no romper un Config.gs que ya funcionaba).
    ['historialFasesAdopcion', 'SHEET_HISTORIAL_FASES_ID', 'HistorialFasesAdopcion', 'REEMPLAZAR_CON_ID_HOJA_HISTORIAL_FASES_ADOPCION'],
    ['auditoria', 'SHEET_AUDITORIA_ID', 'Auditoria', 'REEMPLAZAR_CON_ID_HOJA_AUDITORIA']
  ];
  return rows.map(([key, envK, name, def]) => `    ${key}: { sheetId: '${env(envK, def || '')}', sheetName: '${name}' }`).join(',\n');
}

/** Lista separada por comas -> array de strings en minúsculas. */
function envLista(k) {
  return env(k).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

if (!envLista('ADMIN_EMAILS').length) {
  console.warn('AVISO: ADMIN_EMAILS está vacío en .env; el Config.gs generado no tendrá admins explícitos (cualquier usuario autenticado se trataría como admin).');
}

const backendConfig = `var CONFIG = {
  FIREBASE_PROJECT_ID: '${env('FIREBASE_PROJECT_ID')}',
  FIREBASE_API_KEY: '${env('FIREBASE_API_KEY')}',
  ALLOWED_ORIGINS: ${env('APPS_SCRIPT_ALLOWED_ORIGINS', '["https://tusuario.github.io","http://localhost:8080","http://localhost:3000"]')},
  RATE_LIMIT: 100,
  REQUIRE_EMAIL_VERIFIED: ${env('APPS_SCRIPT_REQUIRE_EMAIL_VERIFIED', 'false') === 'true' ? 'true' : 'false'},
  ALLOW_ORIGIN_EMPTY: ${env('APPS_SCRIPT_ALLOW_ORIGIN_EMPTY', 'false') === 'true' ? 'true' : 'false'},
  DRIVE_FOTOS_FOLDER_ID: '${env('APPS_SCRIPT_DRIVE_FOTOS_FOLDER_ID', '')}',
  DRIVE_DOCS_FOLDER_ID: '${env('APPS_SCRIPT_DRIVE_DOCS_FOLDER_ID', '')}',
  DRIVE_FACTURAS_FOLDER_ID: '${env('APPS_SCRIPT_DRIVE_FACTURAS_FOLDER_ID', '')}',
  // Raíz de media del gestor web: una subcarpeta por ficha. No se comparte.
  DRIVE_WEB_FOLDER_ID: '${env('APPS_SCRIPT_DRIVE_WEB_FOLDER_ID', '')}',
  CONTACT_EMAIL: '${env('CONTACTO_EMAIL', '')}',
  // Buzon fijo en copia (CC) de los contratos enviados. Si esta vacio se usa
  // CONTACT_EMAIL. Sirve para clasificar los contratos en la entidad.
  CONTRATOS_CC_EMAIL: '${env('CONTRATOS_CC_EMAIL', env('CONTACTO_EMAIL', ''))}',
  // Alias verificado en Gmail ("Enviar como") para el remitente del contrato.
  // Vacio = se envia desde la cuenta propietaria del despliegue de Apps Script.
  CONTRATO_FROM_EMAIL: '${env('CONTRATO_FROM_EMAIL', '')}',
  // Teléfono que aparece en los contratos y en los correos. Vacío = no se pinta.
  CONTACTO_TELEFONO: '${env('CONTACTO_TELEFONO', '')}',
  PUBLIC_WEB_BASE_URL: '${env('PUBLIC_WEB_BASE_URL', 'https://gn-admin.github.io/admin-dashboard')}',
  ROLES: { ADMIN: 'admin', USER: 'usuario', COORDINADOR: 'coordinador', VOLUNTARIO: 'voluntario', TESORERIA: 'tesoreria', CONSULTA: 'consulta' },
  MAX_UPLOAD_BYTES: ${env('MAX_UPLOAD_BYTES', String(5 * 1024 * 1024))},
  BACKUP_EMAIL: '${env('BACKUP_EMAIL', 'PON_AQUI_EL_EMAIL_DESTINO@example.com')}',
  BACKUP_DRIVE_FOLDER_ID: '${env('BACKUP_DRIVE_FOLDER_ID')}',
  BACKUP_INCLUDE_DRIVE_FILES: ${env('BACKUP_INCLUDE_DRIVE_FILES', 'false') === 'true' ? 'true' : 'false'},
  // Admins por email (desde .env: ADMIN_EMAILS=a@x.es,b@y.es).
  ADMIN_EMAILS: ${JSON.stringify(envLista('ADMIN_EMAILS'))},

  surveys: {
    'pre-adopcion-perros': {
      name: 'Encuesta Pre-Adopcion Perros',
      formId: '${env('FORM_PERROS_ID')}',
      sheetId: '${env('SHEET_PERROS_ID')}',
      sheetName: '${env('SHEET_PERROS_TAB', 'Respuestas de formulario 1')}',
      visible: true
    },
    'pre-adopcion-gatos': {
      name: 'Encuesta Pre-Adopcion Gatos',
      formId: '${env('FORM_GATOS_ID')}',
      sheetId: '${env('SHEET_GATOS_ID')}',
      sheetName: '${env('SHEET_GATOS_TAB', 'Respuestas de formulario 1')}',
      visible: true
    },
    'pre-acogida': {
      name: 'Solicitud de Acogida',
      formId: '${env('FORM_ACOGIDA_ID')}',
      sheetId: '${env('SHEET_ACOGIDA_ID')}',
      sheetName: '${env('SHEET_ACOGIDA_TAB', 'Respuestas de formulario 1')}',
      visible: true
    }
  },

  sheets: {
    animales: { sheetId: '${env('SHEET_ANIMALES_ID')}', sheetName: '${env('SHEET_ANIMALES_TAB', 'Animales')}' },
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
    documentos: { sheetId: '${env('SHEET_DOCUMENTOS_ID')}', sheetName: 'Documentos' },
    inventario: { sheetId: '${env('SHEET_INVENTARIO_ID')}', sheetName: 'Inventario' },
    grupos: { sheetId: '${env('SHEET_GRUPOS_ID')}', sheetName: 'Grupos' },
    webPublicaciones: { sheetId: '${env('SHEET_WEB_PUBLICACIONES_ID', 'REEMPLAZAR_CON_ID_HOJA_WEB_PUBLICACIONES')}', sheetName: '${env('SHEET_WEB_PUBLICACIONES_TAB', 'WebPublicaciones')}' },
${sheetsBlock()}
  }
};
`;
writeFile('apps-script/Config.gs', backendConfig);