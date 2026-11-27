# Contribuir a skills-hub

Guía para agregar o actualizar skills en el banco central.

## Requisitos

- Node.js >= 18
- pnpm

## Estructura de una skill

Cada skill vive en `skills/<skill-id>/` y debe incluir `SKILL.md`.

```text
skills/<skill-id>/
  SKILL.md
  references/        # opcional
```

Convenciones:

- `skill-id`: nombre del directorio, en minúsculas, con guiones si aplica.
- `SKILL.md`: debe comenzar con frontmatter YAML simple.
- `references/`: material de apoyo opcional; no se publica en `manifest.json`.

## Frontmatter de `SKILL.md`

Campos mínimos usados por el generador:

```md
---

name: python-pro
description: Use when...
---
```

Campos adicionales pueden existir en la skill (por ejemplo `license` o `metadata`), pero el manifest solo expone `id`, `name`, `description` y `category`.

El parser de `scripts/build-manifest.mjs` acepta frontmatter simple con líneas `clave: valor`. Evita estructuras YAML complejas en los campos que consume el generador.

## Categorías

Asigna la skill en `skills.config.json`:

```json
{
    "Lenguajes": ["python-pro"]
}
```

- Usa una categoría existente cuando aplique.
- Si la skill no está en `skills.config.json`, el manifest la clasificará como `Otros`.
- Mantén el formato agrupado: `{ "Categoría": ["skill-id", ...] }`.

## Verificación local

Antes de abrir PR o hacer push, ejecuta:

```bash
pnpm install
pnpm run check
pnpm run test
pnpm run build:manifest
```

Notas:

- No edites `manifest.json` manualmente.
- Si tu cambio afecta `skills/**` o `skills.config.json`, el workflow `Build manifest` puede regenerar y commitear `manifest.json` en `main`.
- `biome.json` excluye `skills/` y `manifest.json`; los cambios en skills deben revisarse por contenido y consistencia.

## Checklist

- [ ] `skills/<skill-id>/SKILL.md` existe y tiene `name` y `description`.
- [ ] El `skill-id` coincide con el directorio.
- [ ] La skill está asignada en `skills.config.json` si corresponde.
- [ ] `pnpm run check` y `pnpm run test` pasan.
- [ ] `pnpm run build:manifest` no genera cambios inesperados.
