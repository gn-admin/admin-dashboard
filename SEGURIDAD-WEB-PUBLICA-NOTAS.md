# Notas de seguridad y privacidad — Web pública y gestor (separado)

> **Estado:** documento separado para evitar mezclar con el plan funcional del gestor web y los endpoints públicos. **De momento no aplicar** estos puntos como parte del plan de implementación del módulo web; tratarlos como consideraciones/requisitos previos o paralelos cuando se aborde seguridad.
> **Relación:** complementa (no sustituye) `PLAN_SEGURIDAD.md` e `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`. Muchas medidas dependen de GAS/Sheets, Firebase y configuración externa.

---

## 1. Separación de superficies y acceso
- El **gestor/admin** y la **web pública** son superficies distintas: la web pública no debe usar API/token de administración ni acceder a datos internos.
- **Gestor (endpoints de administración):** requieren identidad/autenticación y **autorización por rol/módulo en cada acción** (denegación por defecto), coherente con el plan de seguridad del backend.
- **Canal público:** solo lectura, sin token admin, con CORS restringido al/los dominios de la web pública.

## 2. Curación y lista blanca de datos (privacidad)
- Publicar únicamente contenido marcado como publicable y **solo campos permitidos** (lista blanca definida por tipo).
- **Ficha pública de animal:** excluir adoptantes/solicitantes, acogidas internas, contratos, documentos, gastos/donaciones, apadrinamientos, datos médicos sensibles no aptos, dirección exacta, notas internas, historial/auditoría e IDs internos correlables.
- El payload público debe construirse **campo a campo en servidor** (nunca exponer la ficha interna completa). `preview` del gestor debe reflejar exactamente el payload público.
- **404** para contenido no publicado/no existente (no revelar borradores).

## 3. Validación y saneado
- Validar/sanitizar entradas del gestor: `slug` (formato/longitud/unicidad), textos/HTML permitido, URLs de media, tamaños y JSON (`icons/gallery/videos`).
- Respuestas de error públicas sin detalles internos.

## 4. SEO, URLs y contenido retirado
- Control de indexación por elemento (`index/noindex`, robots, canonical). Gestión de cambios de `slug` con redirects 301; 404/410 para retirados.
- No indexar parámetros auxiliares (p. ej. `?from=`).

## 5. Formularios y datos personales (si se abordan)
- `forms/submit` como canal separado del feed de publicaciones: verificación reCAPTCHA en servidor, validaciones/antiabuso, minimización/retención de datos y envío seguro.
- Consentimiento previo para no esenciales y políticas (cookies/privacidad) alineadas a tratamientos reales y terceros.

## 6. Auditoría y operación
- Registrar publicación/despublicación y cambios SEO relevantes cuando sea viable.
- Revisiones periódicas de respuestas públicas (muestreo de lista blanca) y de permisos de gestión web.

## 7. Dependencias externas (no en este repo)
- Autorización y controles en **Apps Script/Sheets**, configuración en **Firebase/reCAPTCHA** (si aplica), CORS/dominios de despliegue y rotación/gestión de secretos según `INSTRUCCIONES_CONFIGURACION_EXTERNA.md`.
