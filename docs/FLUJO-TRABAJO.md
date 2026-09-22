# Flujo de Trabajo - GN-Encuestas

## Regla general

**Todo desarrollo nuevo** pasa por los 4 roles: Arquitecto → Diseñador → Desarrollador → Tester.

**Mejoras y bug fixes** pasan por: Diseñador → Desarrollador → Tester (sin Arquitecto).

**Excepción:** Si una mejora/fix toca seguridad o arquitectura, el Arquitecto SÍ participa.

---

## Flujo completo (Nueva feature)

```
┌─────────────────────────────────────────────────────────┐
│ 1. ARQUITECTO                                           │
│    - ¿Qué se necesita?                                  │
│    - ¿Impacta en la seguridad?                          │
│    - ¿Cambia la arquitectura?                           │
│    - Define requisitos técnicos                          │
│    Entrega: Requisitos en ROLES.md o ARQUITECTURA.md    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 2. DISEÑADOR                                            │
│    - ¿Cómo se ve?                                       │
│    - ¿Cómo se siente en móvil?                          │
│    - Define colores, espaciados, componentes            │
│    Entrega: CSS + estructura HTML                       │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 3. DESARROLLADOR                                        │
│    - Implementa el código                                │
│    - Actualiza mock backend si es necesario              │
│    - Actualiza Apps Script si es necesario               │
│    Entrega: Código funcional en local                   │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 4. TESTER                                               │
│    - Prueba el flujo completo                           │
│    - Prueba en móvil y desktop                          │
│    - Verifica que no se rompió nada                     │
│    Entrega: Checklist completado                        │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│ 5. ARQUITECTO (validación final)                        │
│    - Revisa seguridad si aplica                         │
│    - Aprueba para producción                            │
└─────────────────────────────────────────────────────────┘
```

---

## Flujo simplificado (Mejora / Bug fix)

```
┌──────────────────────┐
│ 1. DISEÑADOR (si UI) │  ──┐
└──────────────────────┘    │
                            ▼
┌──────────────────────────────────────────┐
│ 2. DESARROLLADOR                         │
│    - Corrige el bug o aplica la mejora   │
│    - Verifica que funciona en local      │
└──────────────────────┬───────────────────┘
                       ▼
┌──────────────────────────────────────────┐
│ 3. TESTER                                │
│    - Verifica que se resolvió            │
│    - Verifica que no se rompió nada      │
└──────────────────────────────────────────┘
```

---

## Registro de cambios

Cada cambio se registra en `docs/CHANGELOG.md` con:

```markdown
## [fecha] - Nombre del cambio
- **Tipo:** feature | fix | improvement
- **Roles involucrados:** Arquitecto, Diseñador, Desarrollador, Tester
- **Descripción:** ...
- **Archivos modificados:** ...
- **Estado:** pendiente | en progreso | completado
```

---

## Comandos útiles

```bash
# Desarrollo local
npm run dev

# Abrir en navegador
http://localhost:8080
```
