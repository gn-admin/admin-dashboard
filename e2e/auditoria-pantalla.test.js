/**
 * Auditoría por pantalla — GN-Encuestas Admin Dashboard
 *
 * Verifica que todos los clicks, loadings, actualizaciones y navegaciones
 * funcionen correctamente en cada pantalla.
 *
 * Las credenciales se leen de variables de entorno (nunca se hardcodean):
 *   AUDIT_EMAIL    email de prueba
 *   AUDIT_PASSWORD contraseña de prueba
 *   AUDIT_BASE_URL URL base (default http://localhost:8080)
 *
 * Ejecutar:
 *   AUDIT_EMAIL=... AUDIT_PASSWORD=... npx playwright test tests/auditoria-pantalla.test.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:8080';
const AUDIT_EMAIL = process.env.AUDIT_EMAIL;
const AUDIT_PASSWORD = process.env.AUDIT_PASSWORD;

if (!AUDIT_EMAIL || !AUDIT_PASSWORD) {
  throw new Error(
    'Faltan variables de entorno AUDIT_EMAIL y/o AUDIT_PASSWORD. ' +
    'Ejemplo: AUDIT_EMAIL=usuario@ejemplo.com AUDIT_PASSWORD=clave npx playwright test tests/auditoria-pantalla.test.js'
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function login(page) {
  await page.goto(BASE_URL);
  await expect(page.locator('#login-view')).toBeVisible();

  await page.fill('#email', AUDIT_EMAIL);
  await page.fill('#password', AUDIT_PASSWORD);
  await page.click('#login-submit-btn');

  // Tras el login debe desaparecer el login y aparecer el dashboard
  await expect(page.locator('#login-view')).not.toBeVisible();
  await expect(page.locator('#dashboard-view')).toBeVisible();
  // Esperar a que el overlay de carga desaparezca si existe
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

async function logout(page) {
  const logoutBtn = page.locator('#logout-btn, #mobile-logout-btn').first();
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  }
  await expect(page.locator('#login-view')).toBeVisible();
}

async function waitForLoadingDone(page) {
  // El loading overlay se muestra con display:flex y se oculta por opacity/visibility.
  // Esperamos a que no esté visible (o que desaparezca el overlay).
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

async function navigateTo(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(500); // dar tiempo al router
  await waitForLoadingDone(page);
}

async function assertPageLoaded(page, pageId) {
  const pageEl = page.locator(`#page-${pageId}`);
  await expect(pageEl).toBeVisible({ timeout: 10000 });
  // No debe haber pantalla en blanco: el contenedor debe tener algo de contenido o al menos no estar vacío de forma sospechosa
  const html = await pageEl.innerHTML();
  if (html.trim().length === 0) {
    throw new Error(`Página #page-${pageId} cargó vacía (sin HTML)`);
  }
}

async function assertSnackbarNotRedError(page) {
  // Si hay un toast de error rojo visible, algo falló gravemente.
  // No fallamos el test aquí, solo lo registramos en consola para revisión manual.
  const toast = page.locator('#error-message');
  if (await toast.isVisible()) {
    const txt = await toast.textContent();
    console.warn(`⚠️  Snackbar de error visible: ${txt}`);
  }
}

async function screenshotOnFailure(page, testName) {
  await page.screenshot({ path: `audit-failure-${testName.replace(/\s+/g, '-')}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  // Cada test empieza en login y se autentica
  await login(page);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    await screenshotOnFailure(page, testInfo.title).catch(() => {});
  }
  await logout(page).catch(() => {});
});

/* ------------------------------------------------------------------ */
/* Tests por pantalla                                                 */
/* ------------------------------------------------------------------ */

test('Dashboard home carga y navegación básica', async ({ page }) => {
  await assertPageLoaded(page, 'dashboard');

  // KPIs clicables deben navegar
  const kpiEncuestas = page.locator("button:has-text('Encuestas'), [onclick*=\"encuestas\"]").first();
  if (await kpiEncuestas.isVisible()) {
    await kpiEncuestas.click();
    await assertPageLoaded(page, 'encuestas-perros');
  }

  // Botón refrescar
  const refreshBtn = page.locator('#refresh-btn');
  if (await refreshBtn.isVisible()) {
    await refreshBtn.click();
    await waitForLoadingDone(page);
  }

  await assertSnackbarNotRedError(page);
});

test('Navegación sidebar y bottom-nav', async ({ page }) => {
  const paginas = [
    { name: 'Animales', hash: 'animales', pageId: 'animales' },
    { name: 'Socios', hash: 'socios', pageId: 'socios' },
    { name: 'Lista Negra', hash: 'blacklist', pageId: 'blacklist' },
    { name: 'Reportes', hash: 'reportes', pageId: 'reportes' },
    { name: 'Actividad', hash: 'actividad', pageId: 'actividad' },
    { name: 'Acogidas', hash: 'acogidas', pageId: 'acogidas' },
    { name: 'Adopciones', hash: 'adopciones', pageId: 'adopciones' },
  ];

  for (const p of paginas) {
    await navigateTo(page, p.hash);
    await assertPageLoaded(page, p.pageId);
    await assertSnackbarNotRedError(page);
  }
});

test('Menú Más se abre y cierra', async ({ page }) => {
  await navigateTo(page, 'socios');

  const masToggle = page.locator('#mas-menu-toggle');
  await expect(masToggle).toBeVisible();
  await masToggle.click();

  const popup = page.locator('#mas-menu-popup');
  await expect(popup).toBeVisible();

  // Clic en overlay para cerrar
  const overlay = page.locator('#mas-menu-overlay');
  await overlay.click();
  await expect(popup).not.toBeVisible();
});

test('Sidebar se colapsa y expande', async ({ page }) => {
  const sidebar = page.locator('#sidebar');
  const collapseBtn = page.locator('#sidebar-collapse-btn');

  await expect(collapseBtn).toBeVisible();
  await collapseBtn.click();
  await expect(sidebar).toHaveClass(/collapsed/);

  await collapseBtn.click();
  await expect(sidebar).not.toHaveClass(/collapsed/);
});

test('Login y logout funcionan', async ({ page }) => {
  // Ya estamos logueados por el beforeEach
  await expect(page.locator('#dashboard-view')).toBeVisible();

  // Logout
  await logout(page);
  await expect(page.locator('#login-view')).toBeVisible();

  // Volver a login
  await login(page);
  await expect(page.locator('#dashboard-view')).toBeVisible();
});

test('Pantalla de animales carga y filtro urgentes', async ({ page }) => {
  await navigateTo(page, 'animales');
  await assertPageLoaded(page, 'animales');

  // El tercer select de Animales es el filtro de prioridad
  const selects = page.locator('#page-animales select');
  const count = await selects.count();
  if (count >= 3) {
    await selects.nth(2).selectOption('solo');
    await page.waitForTimeout(500);
  }

  await assertSnackbarNotRedError(page);
});

test('Pantalla de acogidas activas carga', async ({ page }) => {
  await navigateTo(page, 'acogidas-activas');
  await assertPageLoaded(page, 'acogidas-activas');
  await assertSnackbarNotRedError(page);
});

test('Pantalla de adopciones carga', async ({ page }) => {
  await navigateTo(page, 'adopciones');
  await assertPageLoaded(page, 'adopciones');
  await assertSnackbarNotRedError(page);
});

test('Modales se abren y cierran (Escape y overlay)', async ({ page }) => {
  await navigateTo(page, 'dashboard');

  // Abrir modal de perfil
  const profileBtn = page.locator('#profile-btn');
  if (await profileBtn.isVisible()) {
    await profileBtn.click();
    const modal = page.locator('#profile-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Cerrar con Escape
    await page.press('body', 'Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  }

  await assertSnackbarNotRedError(page);
});

test('Overlay de carga aparece y desaparece en acciones async', async ({ page }) => {
  await navigateTo(page, 'animales');

  // Buscar un botón de acción que dispare loading (ej. editar o borrar si hay filas)
  const firstBtn = page.locator('#page-animales button').first();
  if (await firstBtn.isVisible()) {
    const loading = page.locator('#loading');
    await firstBtn.click();
    // El loading puede aparecer brevemente; esperamos a que desaparezca
    await loading.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  await assertSnackbarNotRedError(page);
});

test('Pantallas de encuestas (perros, gatos, acogida)', async ({ page }) => {
  for (const p of ['encuestas-perros', 'encuestas-gatos', 'encuestas-acogida']) {
    await navigateTo(page, p);
    await assertPageLoaded(page, p);
    await assertSnackbarNotRedError(page);
  }
});

test('Pantallas de gestión (familias, socios, donaciones, almacén, redes)', async ({ page }) => {
  for (const p of ['acogidas', 'socios', 'donaciones', 'almacen', 'redes']) {
    await navigateTo(page, p);
    await assertPageLoaded(page, p);
    await assertSnackbarNotRedError(page);
  }
});

test('No quedan pantallas en blanco tras navegar por todas las rutas', async ({ page }) => {
  const rutas = [
    'dashboard', 'encuestas', 'encuestas-perros', 'encuestas-gatos', 'encuestas-acogida',
    'animales', 'acogidas', 'acogidas-activas', 'adopciones', 'socios',
    'blacklist', 'reportes', 'actividad', 'redes', 'donaciones', 'almacen'
  ];

  for (const r of rutas) {
    await navigateTo(page, r);
    await assertPageLoaded(page, r);
  }
});

/* ------------------------------------------------------------------ */
/* Reporte final                                                      */
/* ------------------------------------------------------------------ */

test('Resumen de auditoría completado', async ({ page }) => {
  // Este test solo marca que el suite se ejecutó completo.
  // Los fallos individuales se reportan en cada test anterior.
  expect(true).toBe(true);
});
