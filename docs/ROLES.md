# Roles y Responsabilidades - GN-Encuestas

## Arquitecto de Software

**Objetivo:** Definir la estructura técnica y garantizar seguridad, escalabilidad y mantenibilidad.

**Responsabilidades:**
- Definir la arquitectura del sistema (PWA + Apps Script + Firebase)
- Establecer el contrato de la API (endpoints, formato de datos)
- Diseñar el flujo de autenticación y autorización
- Definir qué datos se exponen y cuáles se protegen
- Revisar decisiones de stack tecnológico
- Validar que la arquitectura es viable para producción

**Participa en:** Nuevas features, cambios de arquitectura, integración de nuevos servicios.

**NO participa en:** Bugs, mejoras menores, ajustes de UI, refactorizaciones puntuales.

---

## Diseñador UX/UI

**Objetivo:** Crear una interfaz mobile-first funcional, accesible y profesional.

**Responsabilidades:**
- Diseñar el layout responsive (mobile-first, desktop-compat)
- Definir paleta de colores, tipografía, espaciados
- Diseñar componentes: login, dashboard, tarjetas, tablas, botones
- Garantizar accesibilidad (contraste, tamaños de toque ≥44px, aria-labels)
- Diseñar el comportamiento PWA (splash, iconos, colores del manifest)
- Definir el flujo visual de exportación a PDF

**Participa en:** Todo (nuevas features y mejoras que afecten a la UI).

---

## Desarrollador

**Objetivo:** Implementar el código, integrar servicios, asegurar que funcione en local y producción.

**Responsabilidades:**
- Implementar Google Apps Script (Code.gs, Auth, DataFilter, PDF)
- Desarrollar el frontend PWA (HTML, CSS, JS)
- Integrar Firebase Authentication
- Crear y mantener el mock backend para desarrollo local
- Implementar la capa de API (api.js) con switching local/production
- Implementar la generación de PDF
- Configurar Service Worker y manifest PWA
- Asegurar que no haya datos sensibles hardcodeados

**Participa en:** Todo.

---

## Tester / QA

**Objetivo:** Verificar que la aplicación cumple requisitos de seguridad, funcionalidad y usabilidad.

**Responsabilidades:**
- Probar el flujo completo: login → dashboard → ver respuesta → exportar PDF
- Verificar que el mock backend funciona correctamente
- Verificar que en producción solo se sirven datos filtrados
- Probar en múltiples dispositivos móviles (iOS Safari, Android Chrome)
- Probar en desktop (Chrome, Firefox, Edge)
- Verificar que la PWA se instala correctamente
- Probar comportamiento offline
- Verificar que los tokens JWT se renuevan
- Prueba de seguridad: sin token, token expirado, rol no autorizado

**Checklist de pruebas:**
- [ ] Login funcional (email/password y Google)
- [ ] Login rechaza credenciales incorrectas
- [ ] Dashboard muestra encuestas disponibles
- [ ] Al seleccionar encuesta se ven las respuestas
- [ ] Botón "Ver" abre el detalle de la respuesta
- [ ] Botón "Exportar" descarga el PDF
- [ ] Admin ve todos los datos
- [ ] Usuario normal solo ve sus datos
- [ ] PDF contiene solo datos autorizados
- [ ] PWA se instala en Android
- [ ] PWA se instala en iOS
- [ ] Responsive: 320px, 375px, 768px, 1024px+
- [ ] No hay datos sensibles en el código fuente

---

## Flujo de trabajo

### Tipo 1: Nueva feature / Cambio de arquitectura

```
1. Arquitecto  → Define qué se hace y por qué (requisitos, seguridad, impacto)
2. Diseñador   → Diseña cómo se ve y se siente (UI/UX)
3. Desarrollador → Implementa el código
4. Tester      → Verifica que funciona correctamente
5. Arquitecto  → Validación final (si aplica seguridad/arquitectura)
```

**Ejemplos:** Añadir un nuevo tipo de encuesta, cambiar de Firebase a otro provider, añadir un rol nuevo, modificar el flujo de autenticación.

### Tipo 2: Mejora / Bug fix

```
1. Diseñador   → Si afecta a la UI, define el cambio visual
2. Desarrollador → Implementa la corrección/mejora
3. Tester      → Verifica que se resolvió y no se rompió nada
```

**Ejemplos:** Corregir un botón que no se ve, arreglar un error en el PDF, ajustar colores, mejorar el layout de una card.

**El arquitecto NO participa** en este tipo de tareas a menos que:
- El cambio implique modificar la estructura de datos
- El cambio afecte a la seguridad
- El cambio implique un nuevo endpoint o servicio

---

## Criterio de aceptación para producción

1. Todos los ítems del CHECKLIST-PRODUCCION.md marcados
2. Arquitecto valida que la seguridad es suficiente (solo para features)
3. Tester aprueba las pruebas en al menos 2 dispositivos reales
4. Diseñador valida que la UI es usable en mobile
