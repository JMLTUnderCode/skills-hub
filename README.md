# skills-hub

Banco central de skills para agentes de código. Este repositorio contiene skills reutilizables y un `manifest.json` generado automáticamente para que instaladores externos las descubran.

## Estructura

- `skills/<skill-id>/SKILL.md`: definición de cada skill (frontmatter `name`, `description`).
- `skills/<skill-id>/references/`: material de apoyo opcional.
- `skills.config.json`: categorías y sus skill IDs para el instalador. Formato: `{ "Categoría": ["skill-id", ...] }`.
- `manifest.json`: índice generado por CI/ script; no editar manualmente.
- `scripts/build-manifest.mjs`: regenerador del manifest.

## Añadir o actualizar una skill

1. Crea `skills/<skill-id>/SKILL.md` con frontmatter YAML válido (`name`, `description`).
2. Opcional: añade `references/`.
3. Opcional: añade la categoría en `skills.config.json`. Si no existe, la skill aparecerá como `Otros`.
4. Haz push a `main`. El workflow `Build manifest` regenera `manifest.json`.

## Regenerar manifest localmente

> Se recomienda pnpm: el repositorio incluye `pnpm-lock.yaml` y la verificación oficial usa pnpm.

```bash
pnpm install
pnpm run build:manifest
```

## Verificación de desarrollo

```bash
pnpm run check
pnpm run check:fix
pnpm test
```
