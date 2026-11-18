# Plan trasladado al proyecto `main` (ejecutar en `C:\Users\JonEg\Documents\proyectos\main`)

> Documento consolidado para **trasladar y ejecutar en el proyecto `main`**. Reúne todo lo planificado para `main` que antes estaba en `admin-dashboard`.
> **Origen:** `admin-dashboard` (contrato/canal/visor y groundwork ya implementados allí). **No modificar `main` desde `admin-dashboard`.**

---

## Parte A — Track B: port SEO/canal a la web (`main`)

### A.1 Objetivo y alcance

Portar a la web real lo ya validado en la simulación de `admin-dashboard`:

- **Consumo del canal público** (sin JSON estático), con filtros/búsqueda/paginación y estados vacío/error.
- **SEO por publicación**: `<title>`, description, robots, canonical (condicional), OG/Twitter y JSON-LD (`Article`/`Event`/`BlogPosting`) desde el payload.
- **Indexabilidad real**: prerender/SSG por `slug`, `sitemap.xml` y `robots.txt` físicos en el dominio propio.
- **Estados y redirecciones**: 404 real, 410 para retirados (o página `noindex` equivalente), 301 desde slugs históricos (`/v1/redirects`).
- **Criterio de aceptación:** reproducir en el dominio real lo verificado en la simulación (referencia: `admin-dashboard/src/js/publico.js`, `src/publico.html`, `src/css/publico.css`, `scripts/prerender-publico.js` y criterios §7.1 de `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` en `admin-dashboard`).

### A.2 Contrato del canal (backend en GAS)

Base URL del Web App: la configurada para el canal público. Desde navegador usar **JSONP** (`&callback=`) para evitar CORS; el token **no** aplica a endpoints públicos.

| Endpoint (GET) | Uso | Notas |
|---|---|---|
| `?endpoint=publicaciones` | Listado público | Filtros `type`, `category`, `species`/`status` según canal, `q`, `page`, `pageSize` (máx. 50). Cacheable (~60 s). `nocache=1` solo para depurar. |
| `?endpoint=publicacion&slug=<slug>` | Detalle por slug | Devuelve publicación; puede devolver `redirect` (slug histórico → actual) o estado `gone`/error para retirada/no disponible. |
| `?endpoint=retiradas` | Slugs retirados/lápidas | Para generar páginas 410/`noindex` y excluir del sitemap. |
| `?endpoint=redirects` (o `/v1/redirects`) | Mapa 301 | `from` → `to` para reglas del hosting/build. |
| `?endpoint=sitemap` / `?endpoint=taxonomias` / `?endpoint=config` | Soporte | Según necesidad; sitemap/robots **físicos** del sitio real se generan en build/hosting del dominio propio. |

**Estados a manejar:** listado vacío, canal no configurado (`status:"warning"`), error de red/carga (con reintento), no disponible/404 lógico (`status:"error"`, `noindex,nofollow` + enlace al listado), retirada/gone (410 o página `noindex`).

### A.2.1 Publicaciones de grupo / camada (adopción conjunta, aditivo)

El canal puede entregar publicaciones de **grupo** (varios animales que se adoptan juntos). Es un tipo aditivo: si `main` aún no lo contempla, debe ignorarlo sin romper nada; el resto del contrato no cambia.

- **Tipo:** `type: "animal_grupo"` + `isGroup: true`. La URL sigue siendo `/animales/<slug>` y comparte listado, canonical, sitemap, 301/410 y prerender con las fichas individuales.
- **Bloque `group`:** `{ groupName, count, members[], species, sex, age, size, color, health, temperament, compatibility, adoption, foster, location, contact }`.
  - `members[]` es un **resumen público whitelisted**: solo `{ nombre, especie, raza, sexo, edad, size, foto }`. Nunca incluye IDs internos (`id`, `grupo_id`, `origen_id`), microchip, vacunas ni documentos.
  - Por compatibilidad, el payload incluye también `animal` con el mismo contenido que `group`; el consumidor nuevo debe usar `group` y el antiguo puede seguir leyendo `animal`.
- **Derivación:** el grupo no duplica datos; se compone de los animales internos que comparten `grupo_id`. `status` se agrega:
  - todos `adoptado` → `adoptado`;
  - algún `fallecido`, adopción parcial (mezcla de `adoptado` con no adoptados) o conjunto inconsistente → `cerrado` y **no publicable**;
  - algún `en_adopcion`/`reservado` → `reservado`;
  - todos `en_acogida` (o mezcla de `disponible` + `en_acogida`) → `en_acogida`;
  - todos `disponible` → `en_adopcion`.
- **Urgencia:** `urgent: true` si **cualquier** miembro prioritario; `urgente` no es un estado.
- **Portada:** si la publicación no fija `coverImage`, se hereda la primera foto disponible de los miembros.
- **Visibilidad:** estados `borrador`/`oculto`/`retirado` no salen del feed; `retirado` responde `gone` (410 lógico) y conserva el slug. `preview` del gestor y feed público devuelven exactamente el mismo objeto.
- **Exclusividad:** mientras el grupo está publicado no puede haber publicaciones individuales publicadas de sus miembros; si `main` encuentra ambas, debe priorizar el grupo o mostrar solo una (el backend ya bloquea la activación).
- **SEO/JSON-LD:** igual que una ficha de animal (`Article`), añadiendo `about.name = groupName` y una descripción con especie/miembros. Sin `group`, el render no cambia.
- **Referencia de render:** `admin-dashboard/src/js/publico.js` (`_bloqueGrupo`, tarjeta y JSON-LD) y `scripts/prerender-publico.js`.


### A.3 Port de consumo y render (B1–B2)

1. **Sustituir fuente estática:** reemplazar `blog-posts.json` / `HistoriasAPI` (o equivalente) por consumo del canal (`publicaciones` + `publicacion&slug=`) vía JSONP en cliente y/o fetch en build según arquitectura de `main`.
2. **Listado:** filtros, búsqueda, paginación (respetar `pageSize` máx. y total), tarjetas con datos de lista; enlaces a la ruta canónica de ficha.
3. **Detalle por slug:** render de `title`, `excerpt`, `publishedAt`/`updatedAt`, `coverImage`/`image`, `contentHtml`, `tags`, `icons`/datos destacados, `gallery` (`alt`/`caption`), `videos`, `animal`/`event`, `cta`, autor/tiempo de lectura según disponibilidad.
4. **Redirect de slug histórico:** si hay `redirect`, reescribir URL sin recargar (`history.replaceState`) y mostrar ficha vigente (y/o redirect en prerender/hosting según `redirects`).
5. **Retiradas/410:** si `status:"gone"` o slug en retiradas, mostrar “Publicación retirada” con `noindex,nofollow`, sin canonical ni JSON-LD; en hosting/prerender servir 410 cuando sea posible.
6. **`pub.ficha` (C3, aditivo y opcional):** si existe, aplicar `ficha.plantilla`, `ficha.bloques`, `ficha.mostrarLectura` y ajustes de visibilidad; **si no existe, fallback total** al comportamiento actual. No leer `ficha` en listados; aplicarla en detalle/prerender.

### A.4 SEO y metadatos

- **Title/description:** `seo.metaTitle` (o `title`) y `seo.metaDescription` (o `excerpt`).
- **Robots:** `seo.robots` / `indexable`; retiradas/error siempre `noindex`.
- **Canonical condicional:** usar **solo** `seo.canonical || canonical`. Si vacío, **no emitir** `<link rel="canonical">` ni `og:url`; nunca derivar de ruta relativa. En estado/listado, URL propia.
- **OG/Twitter:** `og:title`, `og:description`, `og:image`, `og:url` solo si hay canonical válido, `twitter:card` adecuado.
- **JSON-LD por tipo:** `animal` → `Article`, `evento` → `Event`, `historia` → `BlogPosting` (campos relevantes); único `<script type="application/ld+json">` en fichas válidas; **ninguno** en 404/error/retirada. `mainEntityOfPage` coherente con la canónica.
- **Dominio propio:** canonical/`og:url` absolutos a la URL pública definitiva de la ficha, consistentes entre HTML prerenderizado y metadatos.

### A.5 Prerender, sitemap, robots y redirects (B3)

1. **Prerender/SSG por slug:** página HTML por publicación publicada con contenido, metas, OG/Twitter y JSON-LD renderizados (sin JS para indexación). Fuente: `publicaciones` paginado + `publicacion&slug=` + `retiradas` (equivalente a `scripts/prerender-publico.js` en `admin-dashboard`).
2. **Retiradas:** página `noindex,nofollow`, sin canonical/JSON-LD, fuera de sitemap; servir **410** si el hosting lo permite.
3. **`sitemap.xml` físico (raíz):** fichas publicadas/listadas/indexables; `lastmod` desde `updatedAt`/`publishedAt`; excluir borradores, ocultos, retirados y `listed:false`.
4. **`robots.txt` físico (raíz):** permitir público y `Sitemap: https://<dominio>/sitemap.xml`.
5. **Redirects 301:** desde `GET ?endpoint=redirects` en cada despliegue.
6. **Guarda de build:** fallar si canal no responde, faltan fichas o sitemap/robots inválidos.

### A.6 Checklist de aceptación (eq. validación en simulación)

- [ ] Listado con contador/filtros/búsqueda/paginación y estados (sin resultados, canal sin configurar, error con reintento).
- [ ] Fichas `animal`/`evento`/`historia` correctas (datos, galería, vídeo, bloques, CTA).
- [ ] Metas, OG/Twitter, canonical condicional y JSON-LD correctos; sin JSON-LD en 404/error/retirada.
- [ ] 404 con `noindex,nofollow` y enlace al listado; slug histórico redirige/muestra ficha vigente.
- [ ] Retiradas `noindex,nofollow` (y 410 si posible), fuera de sitemap.
- [ ] `sitemap.xml` y `robots.txt` físicos en raíz, válidos.
- [ ] Redirects 301 activos desde mapa.
- [ ] Sin desbordes 360/1280 px; labels/`alt`/roles básicos.
- [ ] Fallback correcto sin `ficha`; con `ficha` respeta bloques/plantilla sin romper fichas antiguas.

### A.7 Dependencias Track B

- **Dominio propio (A4, externo):** canonical absolutos, sitemap/robots en raíz y Search Console.
- **Canal desplegado:** `.gs` del canal pueden requerir despliegue manual para incluir soporte reciente (p. ej. `ficha` en detalle).
- **C3 aditivo:** consumir `ficha` de forma tolerante (ignorar claves desconocidas).


## Parte A — EmailJS + reCAPTCHA v3 (enfoque inicial para formularios en `main`)

### A.1 Objetivo y alcance

- Implementar en la **web pública (`main`)** los formularios públicos (adopción, acogida, contacto, voluntariado, donaciones, información…) usando **EmailJS** como transporte de envío desde el frontend, protegidos con **reCAPTCHA v3**.
- Enfoque rápido y sin backend propio: los datos viajan a EmailJS y se reenvían como email con plantillas específicas.
- **C4 (`forms/submit` en GAS) se pospone a futura evaluación.** Si el volumen crece o se requiere trazabilidad estructurada (hoja de cálculo, estados, antiabuso robusto), se migrará desde este enfoque a C4 backend.

### A.2 Contexto y restricciones

- **Sin CORS/preflight:** EmailJS está diseñado para llamarse directamente desde el navegador; no hay problema de preflight como con `POST` JSON a GAS.
- **Claves públicas en frontend:** `service ID`, `template ID` y `public key` van expuestas en el código de `main`. No son secretos críticos (no permiten acceso a la cuenta de email), pero cualquiera puede verlas. Se mitiga con **reCAPTCHA v3** para reducir spam automatizado.
- **Validación de reCAPTCHA:** inicialmente en frontend (`grecaptcha.execute`). Para seguridad real, más adelante se puede añadir validación server-side con `RECAPTCHA_SECRET` en un backend intermedio (GAS o similar).
- **Sin registro estructurado propio:** los datos quedan en los emails enviados y (opcionalmente) en el historial de EmailJS según el plan contratado. No hay hoja de cálculo propia ni estados de solicitud a menos que se añada posteriormente.
- **Cuotas:** EmailJS tiene un plan gratuito con envíos mensuales limitados. Si el volumen crece, es necesario pasar a plan de pago o migrar a C4.
- **Privacidad:** aviso de privacidad/términos de Google (v3) y consentimiento (`privacy_accepted`), finalidad/retención definidos.

### A.3 Claves y configuración

| Elemento | Valor / ubicación | Notas |
|---|---|---|
| **Site key (pública, v3)** | `6Lf_hiEuAAAAAIPhzqJgNuXEJmO7Rghx6ZTMduI5` | Frontend/config pública. |
| **EmailJS Service ID** | Config pública de `main` | Obtener en dashboard de EmailJS. |
| **EmailJS Template IDs** | Config pública de `main` | Uno por tipo de formulario (adopción, acogida, contacto, etc.). |
| **EmailJS Public Key** | Config pública de `main` | Obtener en dashboard de EmailJS. |
| **Acción reCAPTCHA** | `form_submit` (fija) | Igual en cliente y servidor. |
| **Dominios** | Dominio real de `main` (y `localhost` solo pruebas) | Verificar en consola reCAPTCHA (v3). |
| **Umbral inicial** | `0.5` | Ajustar con datos reales. |

### A.4 Implementación en `main` (web)

1. Crear cuenta en EmailJS y configurar servicio de envío (Gmail/Outlook/etc.).
2. Crear plantillas específicas: `adopcion`, `acogida`, `contacto`, `voluntariado`, `donaciones`, `informacion`, etc., con variables dinámicas (`{{nombre}}`, `{{email}}`, `{{mensaje}}`, etc.).
3. Añadir claves públicas a la configuración de `main` (no subir secretos al repo si es público).
4. Cargar `https://www.google.com/recaptcha/api.js?render=<SITE_KEY>` y mostrar aviso de privacidad/condiciones de Google.
5. En submit: `grecaptcha.execute(siteKey, {action:'form_submit'})`; si no hay token, bloquear.
6. Llamar a `emailjs.send(serviceID, templateID, templateParams, publicKey)` con los datos del formulario.
7. UX de confirmación genérica, evitar doble submit.
8. Validación cliente (UX) y CSP (`api.emailjs.com`, `cdn.jsdelivr.net` o CDN de EmailJS, `google.com`, `gstatic.com`, `recaptcha.net` si aplica) restrictiva.
9. Accesibilidad y consentimiento.

### A.5 Checklist de aceptación (EmailJS)

- [ ] reCAPTCHA v3 genera token en submit (`action:"form_submit"`).
- [ ] EmailJS envía email con plantilla correcta según `form_type`.
- [ ] Usuario recibe acuse de recibo.
- [ ] CSP permite dominios de EmailJS y reCAPTCHA sin errores de consola.
- [ ] Formulario accesible y con consentimiento de privacidad.

---

## Parte B — C4: Formularios públicos + reCAPTCHA v3 (`forms/submit`) en `main`

### B.1 Objetivo y alcance

- Implementar en la **web pública (`main`)** los formularios que envían a `forms/submit` (C4), protegidos con **reCAPTCHA v3 verificado en servidor**.
- Backend de recepción/validación en **GAS** del ecosistema admin. Despliegue de `.gs` manual.

### B.2 Contexto y restricciones

- **CORS/preflight en POST a GAS:** no fiable. No usar `fetch` JSON cross-origin como primera opción.
- **Transporte recomendado:** `<form>` `POST` `application/x-www-form-urlencoded` a **iframe oculto**. Respuesta cross-origin **no legible** → UX de confirmación genérica.
- **reCAPTCHA v3:** verificación **obligatoria en servidor** (`UrlFetchApp` → `siteverify`, secret en Script Properties). *Fail closed*.
- **Seguridad:** sin secretos en repos; site key pública en config; secret solo en Script Properties.
- **Cuotas/antiabuso:** límites de `UrlFetchApp`/`MailApp`/Sheets; validar/sanear, limitar tamaño/frecuencia, logs sin token/secret/PII.
- **Privacidad:** aviso de privacidad/términos de Google (v3) y consentimiento (`privacy_accepted`), finalidad/retención definidos.

### B.3 Claves y configuración

| Elemento | Valor / ubicación | Notas |
|---|---|---|
| **Site key (pública, v3)** | `6Lf_hiEuAAAAAIPhzqJgNuXEJmO7Rghx6ZTMduI5` | Frontend/config pública. |
| **Secret key (privada)** | Script Properties GAS: `RECAPTCHA_SECRET` | Ya indicada como añadida en GAS. No en repo/código. |
| **Acción** | `form_submit` (fija) | Igual en cliente y servidor. |
| **Dominios** | `gn-admin.github.io`, dominio real (y `localhost` solo pruebas) | Verificar en consola reCAPTCHA (v3). |
| **Umbral inicial** | `0.5` | Ajustar con datos reales. |
| **Hostname** | Dominios registrados | Validar en `siteverify`. |

### B.4 Contrato propuesto `forms/submit`

**Request (form-urlencoded, plano; anidados `fields[...]`):** `endpoint=forms-submit`, `form_type`, `concepto` (opcional), `fields[...]`, `page_url`, `privacy_accepted`, `recaptcha_token`, `recaptcha_action`.

**Procesamiento servidor (antes de efectos):** leer params → verificar reCAPTCHA (`success`, `action`, `hostname`, `score>=UMBRAL`, fail closed) → validar contrato/campos/sanear → antiabuso/cuotas → destino (Sheet/`MailApp` según `form_type`) → respuesta coherente (cliente puede no leerla) y registro sin token/secret/PII.

**Referencia:** transporte `admin-dashboard/src/js/forms-transport.js` (`buildPayload`, `submitViaIframe`) y verificación `admin-dashboard/apps-script/Code.gs` → `verificarRecaptchaV3`.

### B.5 Implementación en `main` (web)

1. Inventariar/crear formularios y mapear campos al contrato.
2. Añadir site key a config pública.
3. Cargar `https://www.google.com/recaptcha/api.js?render=<SITE_KEY>` y mostrar aviso privacidad/condiciones de Google.
4. En submit: `grecaptcha.execute(siteKey,{action:'form_submit'})`; si no hay token, bloquear.
5. Enviar payload por **form POST a iframe oculto** al Web App GAS (`...?endpoint=forms-submit`) (adaptar `buildPayload`/`submitViaIframe`).
6. UX de confirmación genérica (sin lectura de respuesta), evitar doble submit.
7. Validación cliente (UX) y CSP (`google.com`, `gstatic.com`, `recaptcha.net` si aplica) restrictiva.
8. Accesibilidad y consentimiento.

### B.6 Implementación en backend GAS (manual)

1. Endpoint público `POST forms-submit` enrutable antes de auth Firebase.
2. Verificar con `verificarRecaptchaV3` (`RECAPTCHA_SECRET`), validar `action`/`hostname`/`score` (fail closed).
3. Validar por `form_type`, sanear, aplicar cuotas y ejecutar destino; sin loguear token/secret/PII.
4. Calibrar umbral/hostnames y rate limiting.
5. Desplegar manualmente.

### B.7 Checklist de aceptación

- [ ] Token generado en submit (`action:"form_submit"`) y enviado.
- [ ] GAS rechaza token ausente/inválido, acción/hostname incorrectos o score bajo (sin efectos).
- [ ] Con OK se ejecuta destino definido dentro de cuotas.
- [ ] Envío form+iframe con confirmación coherente sin leer respuesta.
- [ ] Doble envío controlado; validaciones y consentimiento operativos.
- [ ] Aviso privacidad/reCAPTCHA visible; sin secretos en repo.
- [ ] CSP sin bloqueos; dominios configurados; umbral/hostnames calibrados.

### B.8 Decisiones abiertas

- Catálogo `form_type`, campos y destinos (Sheet/Mail/plantillas).
- Copy/flujo de confirmación y errores visibles.
- Política de privacidad, consentimiento y retención.
- Umbral definitivo y reglas antiabuso/rate limit.
- Idempotencia/confirmación adicional si aplica.

---

## Referencias en `admin-dashboard` (consultar, no depender de copia)

- Canal/contrato/SEO de referencia: `GESTOR_WEB_PLAN_Y_ENDPOINTS.md`, `src/js/publico.js`, `scripts/prerender-publico.js`.
- Transporte C4: `src/js/forms-transport.js`. Verificación reCAPTCHA: `apps-script/Code.gs` (`verificarRecaptchaV3`).
- Estado: C3 groundwork aditivo (ficha en detalle, no en listados); D5 (login reCAPTCHA en admin) es flujo distinto a formularios de `main`.
