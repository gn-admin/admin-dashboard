# Handoff: formularios públicos + reCAPTCHA v3 (proyecto `main`)

> Documento de traspaso para ejecutar en una sesión del proyecto **`C:\Users\JonEg\Documents\proyectos\main`**.  
> Origen: decisiones/groundwork del repo `admin-dashboard` (Track C4 / formularios). **No modificar el proyecto `main` desde `admin-dashboard`.**

## 1. Objetivo y alcance

- Implementar en la **web pública (`main`)** los formularios que consumen/envían al canal de formularios (`forms/submit`, C4), protegidos con **reCAPTCHA v3 verificado en servidor**.
- El backend de recepción/validación vive en **Google Apps Script (GAS)** del ecosistema admin (endpoints del gestor/canal). Este handoff define contrato, transporte, verificación y pasos para cablear la parte web + integración con GAS.
- Fuera de alcance aquí: cambios en `admin-dashboard` no solicitados y despliegue automático de `.gs` (despliegue manual).

## 2. Contexto y restricciones (decisiones ya tomadas)

- **Arquitectura:** web pública en GitHub Pages (estática) + backend en GAS. Sin servidor propio.
- **CORS/preflight en POST a GAS:** no fiable desde navegador. Lecturas públicas ya usan JSONP; para envíos **no usar `fetch` JSON cross-origin** como primera opción.
- **Transporte recomendado (spike):** `<form>` clásico `POST` (`application/x-www-form-urlencoded`) a un **iframe oculto**. La respuesta cross-origin **no es legible** desde JS → la UX debe tratar el envío como “solicitud enviada/recibida” sin depender de leer la respuesta (confirmación genérica, copy claro, posible flujo de confirmación aparte si se diseña).
- **reCAPTCHA v3:** verificación **obligatoria en servidor** (`UrlFetchApp` a `siteverify`) usando la **clave secreta en Script Properties** de GAS. La site key es pública (frontend). *Fail closed*: si la verificación falla o hay error de red, **no procesar**.
- **Seguridad/repo público:** nunca versionar secretos (secret key, tokens, IDs sensibles). Site key pública aceptable en config cliente. Secret solo en Script Properties (y/o secretos de entorno fuera de repo).
- **Cuotas/antiabuso:** `UrlFetchApp`, `MailApp` y Sheets tienen cuotas; rate-limit/estado transaccional limitado en GAS. Validar/sanear datos, limitar tamaño/frecuencia y registrar eventos sin token/secret/PII innecesaria.
- **Privacidad:** v3 es invisible pero exige **aviso de privacidad/términos de Google** en los formularios. Definir consentimiento (`privacy_accepted`), finalidad y retención de datos.

## 3. Claves y configuración

| Elemento | Valor / ubicación | Notas |
|---|---|---|
| **Site key (pública, v3)** | `6Lf_hiEuAAAAAIPhzqJgNuXEJmO7Rghx6ZTMduI5` | Va en frontend/config pública. |
| **Secret key (privada)** | **Script Properties** de GAS: `RECAPTCHA_SECRET` | Ya añadida en GAS según indicación operativa. No poner en repo/código. |
| **Acción reCAPTCHA** | `form_submit` (recomendado, fija) | Misma en `grecaptcha.execute` y validación servidor. |
| **Dominios permitidos** | `gn-admin.github.io`, dominio real de producción (y `localhost` solo pruebas) | Verificar en [consola reCAPTCHA](https://www.google.com/recaptcha/admin) que la clave es v3 y dominios correctos. |
| **Umbral score inicial** | `0.5` | Ajustar con datos reales (0.0 bot ↔ 1.0 humano). |
| **Hostname permitido (servidor)** | Dominios reales registrados | Validar `hostname` de la respuesta `siteverify`. |

## 4. Contrato propuesto `forms/submit` (C4)

### 4.1 Request (payload, form-urlencoded)
Campos planos (compatibles con form + `x-www-form-urlencoded`); objetos anidados como `fields[...]` si aplica:

- `endpoint`: `forms-submit`
- `form_type`: tipo de formulario (p. ej. `contacto`, `adopcion`, `acogida` — **definir catálogo**)
- `concepto`: asunto/motivo (opcional según tipo)
- `fields[...]`: campos del formulario (solo los definidos en contrato)
- `page_url`: URL de origen
- `privacy_accepted`: `true|false` (consentimiento explícito según política)
- `recaptcha_token`: token v3 obtenido en submit
- `recaptcha_action`: `form_submit`

> Referencia de aplanado/envío: `admin-dashboard/src/js/forms-transport.js` (`buildPayload`, `submitViaIframe`). Admite `recaptcha: { token, action }` o campos planos.

### 4.2 Procesamiento servidor (GAS, antes de cualquier efecto)
1. **Leer** parámetros (`e.parameter` en form-urlencoded / body según implementación).
2. **Verificar reCAPTCHA v3** (obligatorio): `success === true`, `action === 'form_submit'`, `hostname` permitido, `score >= UMBRAL`. Helper de referencia en `admin-dashboard/apps-script/Code.gs`: `verificarRecaptchaV3(token, actionEsperada)`.
3. **Validar contrato:** `form_type` permitido, `privacy_accepted` cuando aplique, campos requeridos, tipos/longitudes, saneado.
4. **Antiabuso/cuotas:** límites de tamaño/frecuencia razonables; no procesar si falla verificación o validación.
5. **Destino (a definir):** persistir en Sheet y/o enviar `MailApp` según tipo, dentro de cuotas. Diseñar idempotencia mínima si hay reintentos.
6. **Respuesta:** el cliente (iframe cross-origin) no la leerá de forma fiable; aun así el endpoint debe responder coherentemente. Registrar resultado/motivo sin token/secret/PII sensible.

### 4.3 Destinos/plantillas por `form_type` (definir)
- Por cada `form_type`: campos obligatorios/opcionales, destinatarios/plantilla de correo, hoja/registro, y textos de privacidad/confirmación en web.
- **Pendiente de definición funcional** (equipo/alcance del proyecto `main`).

## 5. Implementación en proyecto `main` (web) — pasos

1. **Inventariar formularios:** localizar/crear las páginas o componentes de formulario en `main` que deben enviar a `forms/submit` y mapear sus campos al contrato (4.1/4.3).
2. **Config pública:** añadir la site key v3 a la configuración del sitio (variable pública/build-time). No incluir secretos.
3. **Cargar reCAPTCHA v3:** en las páginas con formulario, cargar `https://www.google.com/recaptcha/api.js?render=<SITE_KEY>` (una vez, o por vista según arquitectura de `main`). Mostrar aviso de privacidad/condiciones de Google.
4. **Captura de token en submit:** en el handler de envío, `grecaptcha.execute(siteKey, { action: 'form_submit' })` → obtener token en el momento del submit; si no hay token, bloquear envío y mostrar error.
5. **Construir payload y enviar (transporte):** montar payload del contrato (incl. `recaptcha_token`, `recaptcha_action`, `privacy_accepted`, `page_url`, `fields`) y enviar por **form POST a iframe oculto** hacia el Web App de GAS (`...?endpoint=forms-submit`). Reutilizar/adaptar la lógica de `buildPayload`/`submitViaIframe` (referencia en `admin-dashboard/src/js/forms-transport.js`) a los patrones de `main`.
6. **UX de confirmación (sin lectura de respuesta):** tras disparar el envío, mostrar estado “enviado/recibido” genérico y coherente; deshabilitar doble submit; gestionar timeout/errores de carga del form/iframe como fallback prudente. No prometer aceptación si no es verificable en cliente.
7. **Validación cliente (UX, no seguridad):** required/formatos básicos antes de pedir token/enviar; la autoridad es el servidor.
8. **CSP/cabeceras (si aplica en `main`):** permitir `https://www.google.com`, `https://www.gstatic.com` (y `https://www.recaptcha.net` si se usa) en `script-src`/`connect-src` y, si v3 lo requiere, `frame-src` para recaptcha; mantener política lo más restrictiva posible.
9. **Accesibilidad y privacidad:** labels/errores accesibles, foco/estado, enlace a política de privacidad y texto de consentimiento/reCAPTCHA.

## 6. Implementación en backend GAS — pasos (despliegue manual)

1. **Endpoint público `forms-submit` (POST):** enrutar en `Code.gs`/handler antes de la exigencia de token Firebase (canal público controlado), similar al tratamiento de endpoints públicos de lectura pero para este POST concreto.
2. **Verificación reCAPTCHA:** usar `verificarRecaptchaV3` (`RECAPTCHA_SECRET` en Script Properties). Validar `action`, `hostname` y `score >= UMBRAL`; *fail closed* ante error de verificación/red.
3. **Validación + procesamiento:** aplicar contrato por `form_type`, sanear, respetar cuotas y escribir/notificar según destino definido. No loguear token/secret/PII sensible.
4. **Ajustes operativos:** calibrar `UMBRAL` y lista de hostnames; revisar rate limiting/abuso dentro de límites de GAS.
5. **Despliegue:** manual (nueva versión del Web App). Confirmar que la URL/`endpoint` usado por `main` es la correcta.

## 7. Pruebas y checklist de aceptación

- [ ] Token v3 se genera en submit con `action: "form_submit"` y se envía en el payload.
- [ ] GAS verifica contra `siteverify`: rechaza sin token, token inválido, `action`/`hostname` incorrectos y `score` bajo (sin efectos secundarios).
- [ ] Con verificación OK, el destino definido se ejecuta (registro/correo) dentro de cuotas.
- [ ] Formulario en `main` envía por form+iframe y muestra confirmación coherente sin depender de leer respuesta.
- [ ] Doble envío controlado; validaciones de campos y consentimiento operativas.
- [ ] Aviso de privacidad/reCAPTCHA visible; sin secretos en repo ni en cliente más allá de site key.
- [ ] CSP (si aplica) sin bloqueos en consola; dominios reCAPTCHA configurados en consola de Google.
- [ ] Hostnames y umbral calibrados con pruebas reales.

## 8. Referencias en `admin-dashboard` (no duplicar desde `main`, solo consultar)

- Transporte spike: `src/js/forms-transport.js` (aplanado + `submitViaIframe`, campos `recaptcha_token`/`recaptcha_action`).
- Verificación servidor v3: `apps-script/Code.gs` → `verificarRecaptchaV3` (requiere `RECAPTCHA_SECRET` en Script Properties).
- Plan/contrato base: `GESTOR_WEB_PLAN_Y_ENDPOINTS.md` (§5.5, §7.3.E C4, viabilidad) y `PLAN_MASTER_EJECUCION.md` (C4).
- Nota: login admin con reCAPTCHA (D5, planeado en admin) es un flujo distinto al de formularios públicos de `main`.

## 9. Decisiones abiertas (cerrar antes o durante implementación en `main`)

- Catálogo de `form_type`, campos y destinos (Sheet/Mail/plantillas) por formulario.
- Copy/flujo exacto de confirmación y tratamiento de errores visible al usuario (dado que no hay lectura de respuesta).
- Política de privacidad, consentimiento y retención.
- Umbral definitivo y reglas de antiabuso/rate limit según volumen real.
- Si se requiere algún mecanismo de confirmación/idempotencia adicional.
