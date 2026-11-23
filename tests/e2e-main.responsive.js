/**
 * Pruebas E2E con Playwright (core) para validar el proyecto `main`
 * (sitio público de Grupo Nebak) en Desktop, Tablet y Móvil.
 *
 * Ejecutar: node tests/e2e-main.responsive.js
 *   (desde admin-dashboard donde está instalado playwright)
 */

const { chromium } = require('playwright');

const BASE_URL = 'https://gn-admin.github.io/main/';

// Dispositivos a probar
const DEVICES = [
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Móvil', width: 360, height: 720 }
];

// Secciones del sitio a verificar
const SECCIONES = [
  { nombre: 'Portada', ruta: '', selector: 'h1, h2, .hero, [data-section="home"]' },
  { nombre: 'Perros en adopción', ruta: 'perros-en-adopcion/', selector: 'h1, h2, .perro, .animal, [data-section]' },
  { nombre: 'Gatos en adopción', ruta: 'gatos-en-adopcion/', selector: 'h1, h2, .gato, .animal, [data-section]' },
  { nombre: 'Historias', ruta: 'historias/', selector: 'h1, h2, .historia, [data-section]' },
  { nombre: 'Acogidas', ruta: 'acoge/', selector: 'h1, h2, .acogida, [data-section]' },
  { nombre: 'Adopciones', ruta: 'adopciones/', selector: 'h1, h2, .adopcion, [data-section]' },
  { nombre: 'Sobre Nebak', ruta: 'sobre-nebak/', selector: 'h1, h2, [data-section]' },
  { nombre: 'Contacto', ruta: 'contacto/', selector: 'h1, h2, form, [data-section]' },
];

let passed = 0;
let failed = 0;

async function assert(condition, nombre, contexto = '') {
  if (condition) {
    passed++;
    console.log(`    ✅ ${nombre}`);
  } else {
    failed++;
    console.error(`    ❌ ${nombre}` + (contexto ? ` — ${contexto}` : ''));
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const device of DEVICES) {
    console.log(`\n═════════════════════════════════════════════════════════`);
    console.log(`📱 PRUEBAS EN ${device.name.toUpperCase()} (${device.width}x${device.height})`);
    console.log(`═════════════════════════════════════════════════════════`);

    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
    });
    const page = await context.newPage();

    // Capturar errores de consola
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`    ⚠️  CONSOLE ERROR: ${msg.text().substring(0, 150)}`);
      }
    });

    // ========== TEST 1: Carga de la portada ==========
    console.log(`\n📋 ${device.name} TEST 1: Carga de la portada`);
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const title = await page.title();
      await assert(title.length > 0, 'Título de página definido', title);
      await assert(await page.locator('body').count() > 0, 'Body presente');
      await assert(await page.locator('nav, header, .nav, menu').count() > 0, 'Navegación presente');
    } catch (err) {
      await assert(false, `Carga de portada falló: ${err.message}`);
    }

    // ========== TEST 2: Navegar por todas las secciones ==========
    console.log(`\n📋 ${device.name} TEST 2: Navegación por secciones`);
    for (const seccion of SECCIONES) {
      try {
        await page.goto(BASE_URL + seccion.ruta, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);
        const contenido = await page.locator(seccion.selector).count();
        await assert(contenido > 0, `${seccion.nombre} carga correctamente`);
      } catch (err) {
        await assert(false, `${seccion.nombre} falló: ${err.message}`);
      }
    }

    // ========== TEST 3: Página 404 ==========
    console.log(`\n📋 ${device.name} TEST 3: Página 404`);
    try {
      await page.goto(BASE_URL + 'pagina-inexistente-xyz/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);
      const bodyText = await page.locator('body').innerText();
      await assert(bodyText.includes('404') || bodyText.includes('no encontrada') || bodyText.includes('No encontrada'), 'Página 404 muestra mensaje apropiado');
    } catch (err) {
      await assert(false, `Página 404 falló: ${err.message}`);
    }

    // ========== TEST 4: Verificar enlaces no rotos (muestreo) ==========
    console.log(`\n📋 ${device.name} TEST 4: Enlaces principales no rotos`);
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const links = await page.locator('a[href]').all();
      let enlacesRotos = 0;
      for (const link of links.slice(0, 15)) {
        const href = await link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
        try {
          const res = await page.request.fetch(BASE_URL + href, { timeout: 10000 });
          if (res.status() >= 400) enlacesRotos++;
        } catch {}
      }
      await assert(enlacesRotos === 0, `No hay enlaces rotos en la portada (revisados ${Math.min(links.length, 15)})`, `${enlacesRotos} rotos`);
    } catch (err) {
      await assert(false, `Verificación de enlaces falló: ${err.message}`);
    }

    // ========== TEST 5: Sin scroll horizontal ==========
    console.log(`\n📋 ${device.name} TEST 5: Sin scroll horizontal`);
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = device.width;
      await assert(bodyWidth <= viewportWidth + 20, `No hay scroll horizontal (body: ${bodyWidth}px ≤ viewport: ${viewportWidth}px)`, `body: ${bodyWidth}px`);
    } catch (err) {
      await assert(false, `Scroll horizontal falló: ${err.message}`);
    }

    // ========== TEST 6: Imágenes con alt ==========
    console.log(`\n📋 ${device.name} TEST 6: Imágenes con atributo alt`);
    try {
      await page.goto(BASE_URL + 'perros-en-adopcion/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const imagenes = await page.locator('img').all();
      let sinAlt = 0;
      for (const img of imagenes) {
        const alt = await img.getAttribute('alt');
        const src = await img.getAttribute('src');
        if (!src || src.startsWith('data:')) continue;
        if (!alt || alt.trim() === '') sinAlt++;
      }
      await assert(sinAlt === 0, `Todas las imágenes tienen alt (${imagenes.length} imágenes revisadas)`, `${sinAlt} sin alt`);
    } catch (err) {
      await assert(false, `Verificación de alt falló: ${err.message}`);
    }

    await context.close();
  }

  // ========== RESUMEN FINAL ==========
  console.log(`\n═════════════════════════════════════════════════════════`);
  console.log(`RESULTADO FINAL: ${passed} pasaron, ${failed} fallaron`);
  console.log(`═════════════════════════════════════════════════════════`);

  await browser.close();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
