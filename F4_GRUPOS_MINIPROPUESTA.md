# F4 · Minipropuesta: publicaciones de grupos/camadas (adopción conjunta)

> **Estado:** propuesta base **integrada en la replanificación de fases** (no implementada).
> **Fecha:** 2026-11-17. **Actualizada:** 2026-11-17 (replan).
> **Alcance:** contrato y encaje de grupos/camadas en el gestor de publicaciones, interiorizado en **todas las fases** (F0–F4).
> **Uso en el plan:** referencia de diseño para [`PLAN_GESTOR_FICHAS_PUBLICACIONES.md`](PLAN_GESTOR_FICHAS_PUBLICACIONES.md) y extensión de contrato en [`F0_MAPA_CAMPOS_Y_CONTRATO.md`](F0_MAPA_CAMPOS_Y_CONTRATO.md) (§11). F0–F3 se reabren para verificar/adaptar el encaje 1:1↔grupos (conservando lo realizado) y se cierran progresivamente **hasta F4**; F5 (QA 1:1+grupos) es posterior.
> **No se descarta:** el trabajo 1:1 de F0–F3 (D1–D5 y avances de implementación), que se mantiene como base compatible salvo ajustes necesarios para grupos.

---

## 1. Contexto y problema

- **Ficha interna (hoy):** los animales pueden pertenecer a un grupo/camada (`grupo`, `grupo_id`) y marcarse como **adopción conjunta/obligatoria** (`grupo_obligatorio`), además de existir flujos de alta de camada y vista de grupo en `Animales`.
- **Publicación web (hoy):** solo modelo **1:1** (`tipo=animal`, `origen_id` = animal) o autónoma (`evento`/`historia`). No existe publicación de grupo.
- **Problema:** para un grupo de **adopción conjunta** (los miembros deben ir juntos) no hay una unidad publicable coherente. Publicar N fichas individuales genera contradicciones de estado, CTA, slug, retirada y contenido duplicado; ocultarlas impide dar visibilidad al conjunto.

## 2. Casos de uso

| Caso | Descripción | Necesidad pública |
|---|---|---|
| **A. Adopción conjunta / `grupo_obligatorio`** | Varios animales que solo pueden adoptarse juntos (p. ej. pareja inseparable, madre + cría con condición conjunta). | **Una sola publicación del grupo**: una historia, una galería, un estado y una vía de contacto/CTA para el conjunto. |
| **B. Camada o grupo no obligatorio** | Cachorros/hermanos que pueden adoptarse por separado (grupo informativo). | **1:1 individual por animal** (modelo actual). Opcionalmente, una publicación editorial de tipo `historia`/`evento` sobre la camada (ya soportado como autónoma). |
| **C. Grupo mixto/evolutivo** (borde) | Un grupo que pasa de conjunto a separable, o miembros que cambian de estado a ritmos distintos. | Reglas explícitas de transición y de refresco de la publicación (ver §5 y decisiones abiertas). |

## 3. Opciones evaluadas

| Opción | Resumen | Valoración |
|---|---|---|
| **G1 — Publicación de grupo (recomendada)** | Nuevo origen de publicación `grupo` (solo para grupos de adopción conjunta). Una publicación representa al conjunto; compone datos agregados de sus miembros y contenido editorial propio. Convivencia con 1:1 para animales sin grupo obligatorio. | **Recomendada.** Resuelve A sin duplicar contenido ni estados; reutiliza el compositor, whitelist, ciclo de vida, slugs/301/410 y media ya definidos en F0–F3. Requiere modelado aditivo. |
| **G2 — “Padre” de camada solo agrupador** | Publicación editorial que enlaza a publicaciones individuales ya existentes. | No resuelve adopción conjunta: mantiene N fichas/estados/CTAs contradictorios. Útil solo como complemento informativo (ya cubierto por `historia`). |
| **G3 — N publicaciones individuales sincronizadas** | Una publicación por miembro, sincronizando estado, texto y media. | Alto riesgo de inconsistencia, UX confusa (duplicados en listados), mayor complejidad de sincronización/retirada y difícil de mantener. **Descartada.** |

## 4. Recomendación (G1)

Adoptar **G1** con estas reglas base:

1. **Cardinalidad**
   - **Grupo con adopción conjunta (`grupo_obligatorio = true`):** 1 publicación de **grupo** (exclusiva). Mientras esté activa (no eliminada como borrador sin efecto), sus miembros **no** tienen publicación individual pública activa; el grupo es la unidad de visibilidad.
   - **Animal sin grupo obligatorio** (sin grupo, o grupo informativo/no obligatorio): 1 publicación **individual** 1:1, como hoy. Sin cambios.
2. **Origen y tipo de publicación**
   - Publicación de grupo vinculada al grupo: `origen_tipo = "grupo"` y `origen_id = <grupo_id>` (identificador estable del grupo en `Animales`). Mantener compatibilidad con el campo `tipo` actual: valor propuesto `tipo = "animal_grupo"` (o discriminador equivalente) para distinguirla de `animal` individual y poder filtrar/componer sin ambigüedad. *Decisión a cerrar en contrato final.*
3. **Unidad de composición**
   - `payload = normalizar(publicación_grupo ⊕ herencia_agregada(miembros))` con **whitelist estricta**, igual que 1:1: la publicación aporta editorial/presentación/overrides/SEO; los miembros aportan datos de origen agregados. **`preview == feed`** y listados ligeros (sin `ficha` pesada).
4. **Convivencia y compatibilidad**
   - El 1:1 individual existente sigue vigente y sin migración forzada. Cambios **aditivos** en `WebPublicaciones` y API. Grupos solo aplican donde `grupo_obligatorio` sea verdadero.

## 5. Contrato propuesto (borrador, sujeto a cierre)

### 5.1 Datos heredados/agregados desde miembros

- **Miembros:** lista curada para mostrar (nombre, especie, raza, sexo, edad/etiqueta, foto/portada individual si existe, `origen_id` interno solo para gestión — no exponer IDs internos sensibles si no son necesarios; enlazar a la ficha pública del grupo, no a fichas individuales inexistentes).
- **Resumen agregado:** especie(s) y tamaño/edad combinados con regla explícita (p. ej. rango/varios; definir formato), ubicación si aplica.
- **Salud y compatibilidad:** agregación conservadora (p. ej. “necesidades especiales” si **algún** miembro las tiene; compatibilidad como el mínimo común o listado por miembro, a definir) para no prometer de más.
- **Estado público derivado del grupo (`auto`):** regla propuesta
  - todos los miembros en `disponible`/`en_acogida` → derivado equivalente (`en_adopcion`/`en_acogida`) según composición del conjunto;
  - algún miembro `en_adopcion` (reservado interno) o el conjunto reservado → `reservado`;
  - todos `adoptado` → `adoptado` (y proponer retirada/ocultación según flujo);
  - cualquier miembro `fallecido` o el grupo deja de ser válido → estado `cerrado` y **revisión obligatoria** (no publicar automáticamente; proponer retirada con confirmación).
  - Override manual posible (modo `manual`) respetando coherencias mínimas (no publicar incoherente), igual que D1/D6.
- **Urgente (`urgent`):** bandera del grupo = `true` si **algún** miembro es prioritario/urgente (no estado), coherente con D2.

### 5.2 Editorial y presentación (propios de la publicación de grupo)

- Título, slug (único por tipo/espacio de slugs definido), extracto, `contenido_html`, categoría pública.
- Media del grupo: portada y galería/vídeos propios; puede pre-rellenarse combinando media de miembros al crear.
- CTA, SEO (`seo`), visibilidad (`listed`/`indexable`/`featured`), bloque `ficha` C3, `orden`, fechas.
- Contacto público según política de asociación (D7).

### 5.3 Ciclo de vida, slugs y completitud

- Estados: `borrador | publicado | oculto | retirado`, mismas reglas de transición relevantes.
- **Slug:** único y reservado; histórico con 301; retirada → lápida 410 con `gone` y opción de **restaurar** (D3), igual que el resto.
- **Completitud para publicar (propuesta):** título, slug válido, categoría, estado público coherente, descripción suficiente, portada (propia o heredada/agregada según se defina), meta/extracto, y **al menos 1 miembro válido** en el grupo. No publicar si el conjunto está cerrado/fallecido sin resolución explícita.
- **Refresco ante cambios de miembros:** *decisión abierta* — recalcular derivación al leer/componer (preferible para coherencia) y/o marcar “desactualizada” cuando cambie un miembro (estado, pertenencia al grupo, datos clave). Definir evento de invalidación en implementación.

### 5.4 UI del gestor (objetivo)

- Entrada: “Publicar grupo” desde el contexto de grupos/camadas (listado de grupos con `grupo_obligatorio` y candidatos) además del flujo individual.
- Formulario de publicación de grupo: muestra miembros y datos heredados/agregados **en solo lectura** (con origen), y permite editar editorial/presentación/SEO/overrides permitidos.
- Indicadores en ficha interna de cada miembro: estado web del **grupo** cuando aplique (no duplicar publicaciones individuales activas).
- Acciones: publicar/ocultar/retirar/restaurar, preview, ver pública, misma semántica que 1:1.

### 5.5 Canal público, visor y prerender

- El payload público debe ser **auto-contenido** para renderizar la ficha del grupo (miembros resumidos, media, estado, CTA) sin exponer datos internos.
- Rutas/URL: canónica estática `publicaciones/<slug>.html` como el resto; tipo diferenciado en datos si el front lo necesita para plantilla/JSON-LD, manteniendo compatibilidad.
- Sitemap/robots/301/410/índice de estáticas con las mismas garantías que 1:1.

## 6. Impacto técnico (resumen para implementación)

| Capa | Cambios previstos (aditivos/compatibles) |
|---|---|
| **Datos / Sheets** | Identificar grupo como origen (`origen_tipo`/discriminador y `origen_id` de grupo), posibles campos agregados/cache si se decide; mantener compatibilidad 1:1. |
| **Backend (`WebPublicaciones.gs`, `Code.gs`)** | Resolución de miembros por grupo, agregación, derivación de estado/urgente, compositor/whitelist de grupo, validación/coherencia, CRUD/acciones (retirar/restaurar), endpoints de listado/detalle para grupos. |
| **API (`api.js`)** | Endpoints/params para obtener/guardar/publicar grupo (p. ej. `web-grupos`, `web-grupo-guardar`, etc., a concretar). |
| **Gestor (`web.js`, `dashboard*.js`)** | Selector/alta de publicación de grupo, formulario y acciones, indicadores en miembros. |
| **Público/prerender (`publico.js`, `ficha-config.js`, `prerender-publico.js`)** | Render de ficha de grupo (lista de miembros, agregados), JSON-LD/metas apropiadas, estática/índice. |
| **Tests** | Contrato de composición/whitelist/estados/slugs para grupos, convivencia 1:1, casos `grupo_obligatorio` y borde (miembro fallecido, cambios de pertenencia). |

## 7. Decisiones abiertas (a cerrar antes de implementar F4)

1. **Discriminador de tipo/origen:** `tipo="animal_grupo"` vs `tipo="animal"` + `origen_tipo="grupo"` (y nombre exacto de campos/columnas).
2. **Identidad estable del grupo:** confirmar que `grupo_id` es la clave canónica y estable para vincular la publicación (y cómo se comporta si se renombra el grupo).
3. **Regla exacta de derivación de estado agregado** (tabla caso a caso, incluido “algún adoptado y otros no”, y `fallecido` parcial).
4. **Estrategia de refresco:** recalcular en composición/lectura vs marcar desactualizada vs ambas.
5. **Exclusividad operativa:** cómo impedir/avisar publicaciones individuales activas cuando exista publicación de grupo obligatoria (y flujo de migración de 1:1 → grupo si ya hay individuales en borrador/publicadas).
6. **Representación pública de miembros:** cuánta ficha individual mostrar (resumen vs detalle) y si enlazar a anclas/secciones internas (sin páginas individuales públicas de miembros del grupo obligatorio).
7. **Categoría/SEO/JSON-LD** específicos para grupo (p. ej. tipo de schema) manteniendo consistencia con el sitio.

## 8. Fases adaptadas (integradas, cierre progresivo hasta F4)

> Detalle operativo en [`PLAN_GESTOR_FICHAS_PUBLICACIONES.md`](PLAN_GESTOR_FICHAS_PUBLICACIONES.md) §4. Esta sección resume cómo los grupos (G1) se interiorizan en cada fase.

| Fase | Objetivo | Cómo se integra grupos | Criterio de cierre (1:1+grupos) |
|---|---|---|---|
| **F0. Contrato unificado (reabierta)** | Cerrar ambigüedades | Unificar contrato 1:1 con origen/discriminador de grupo, composición y whitelist agregada, matriz de acciones y **cerrar G-D1…G-D7**. | Contrato documentado y sin decisiones bloqueantes para F1–F4. |
| **F1. UX y flujos (reabierta, revisión)** | Claridad operativa | Verificar/adaptar IA y flujos: publicar/gestionar grupo (`grupo_obligatorio`), formularios con miembros/agregados en solo lectura, indicadores en miembros, exclusividad y responsive. | UX/flujos definidos y coherentes para 1:1 y grupo. |
| **F2. Fuente de verdad y composición (reabierta, revisión)** | Seguridad y coherencia | Extender modelo a herencia agregada, derivación de estado/`urgent` y whitelist de grupo; mantener `preview == feed` y verificar 1:1 en producción. | Composición/whitelist unificadas (simple+agregada), 1:1 verificado y sin fugas. |
| **F3. Modelo de datos, persistencia y media (reabierta, revisión)** | Base aditiva sin duplicidad | Esquema aditivo para origen grupo, media/carpeta de publicación de grupo, persistencia de overrides/agregados, refresco (G-D4) y despliegue/verificación 1:1. | Esquema/persistencia listos para 1:1 y grupo; 1:1 desplegado/verificado. |
| **F4. Implementación end-to-end de grupos (abierta)** | Adopción conjunta publicable | Backend (agregación, derivación, compositor/whitelist, validación, endpoints, ciclo de vida), API/UI gestor, canal/visor/prerender/índice y convivencia/exclusividad con 1:1. | Grupo obligatorio operativo de punta a punta sin romper 1:1. |
| **F5. Endurecimiento y QA (posterior)** | Estabilidad 1:1 + grupos | Tests de contrato y bordes (1:1 y grupos), rol/viewport, rendimiento y documentación/contrato público. | Regresión cubierta y documentación alineada. |

**Dependencias:** cierre progresivo **F0 → F1 → F2 → F3 → F4**. El trabajo 1:1 existente se conserva y se valida dentro de cada fase; F4 arranca con G-D1…G-D7 cerrados y base 1:1 desplegada/verificada.
