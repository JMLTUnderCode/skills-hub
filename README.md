# skills-hub

Banco central de skills reutilizables para agentes de código. El repositorio contiene las skills, su categorización y un `manifest.json` generado automáticamente para que instaladores externos las descubran.

Repositorio relacionado: [agent-skills-template](https://github.com/JMLTUnderCode/agent-skills-template).

## Estructura

- `skills/<skill-id>/SKILL.md`: definición de la skill.
- `skills/<skill-id>/references/`: material de apoyo opcional.
- `skills.config.json`: categorías y skill IDs incluidos en el manifest.
- `manifest.json`: índice generado; no editar manualmente.
- `scripts/build-manifest.mjs`: generador del manifest.
- `tests/build-manifest.test.mjs`: pruebas del generador.
- `.github/workflows/manifest-guard.yml`: guardia que verifica/regenera el manifest en `main`.

## Contrato de `manifest.json`

El manifest es el contrato de descubrimiento consumido por instaladores como [agent-skills-template](https://github.com/JMLTUnderCode/agent-skills-template).

Ejemplo:

```json
{
    "version": 1,
    "generated": "2026-11-24T16:56:37.905Z",
    "skills": [
        {
            "id": "python-pro",
            "name": "python-pro",
            "description": "Descripción de la skill.",
            "category": "Lenguajes"
        }
    ]
}
```

| Campo                  | Tipo   | Descripción                                                                      |
| ---------------------- | ------ | -------------------------------------------------------------------------------- |
| `version`              | number | Versión del esquema del manifest. Valor actual: `1`.                             |
| `generated`            | string | Fecha ISO 8601 de generación.                                                    |
| `skills`               | array  | Lista de skills disponibles.                                                     |
| `skills[].id`          | string | Identificador de la skill; coincide con el nombre del directorio `skills/<id>/`. |
| `skills[].name`        | string | Nombre tomado de `SKILL.md`; usa `id` como respaldo.                             |
| `skills[].description` | string | Descripción tomada del frontmatter de `SKILL.md`.                                |
| `skills[].category`    | string | Categoría definida en `skills.config.json`; si falta, se usa `Otros`.            |

Notas:

- Las skills se ordenan por `category` y luego por `name` con locale `es`.
- El manifest expone solo metadatos de descubrimiento. El contenido completo de la skill vive en `skills/<skill-id>/`.

## Formato de una skill

Cada skill debe tener `skills/<skill-id>/SKILL.md` con frontmatter YAML simple al inicio del archivo:

```md
---

name: python-pro
description: Use when...
license: MIT
metadata:
author: ...
---
```

El generador actual extrae `name` y `description` con un parser de frontmatter simple (`clave: valor` por línea). No depende de YAML complejo. Otros campos como `license`, `metadata` o el contenido de `references/` pueden existir en la skill, pero no se incluyen en `manifest.json`.

## Categorías

Las categorías se definen en `skills.config.json` con formato agrupado:

```json
{
    "Lenguajes": ["python-pro", "typescript-pro"]
}
```

Si una skill no está asignada, el generador la incluye en `Otros`.

## Añadir o actualizar una skill

1. Crea o edita `skills/<skill-id>/SKILL.md`.
2. Opcional: añade material en `skills/<skill-id>/references/`.
3. Asigna la skill en `skills.config.json`.
4. Ejecuta la verificación local.
5. Haz push a `main` o abre PR según el flujo del repositorio.

Guía detallada: [CONTRIBUTING.md](CONTRIBUTING.md).

## Desarrollo local

Requisitos: Node.js >= 18 y pnpm.

```bash
pnpm install
pnpm run build:manifest
pnpm run check:manifest
pnpm run check
pnpm run check:fix
pnpm test
pnpm run validate
```

`pnpm run validate` ejecuta install, build de manifest, check, tests y confirma si el árbol está listo para commit/merge del PR por la web.

## CI

El workflow `Manifest guard` se ejecuta en push a `main` cuando cambian `skills/**` o `skills.config.json`, y también por `workflow_dispatch`. Actúa como guardia: regenera `manifest.json`, verifica si hay diferencias y, solo si detecta disparidad, crea un commit automático `chore: regenerate manifest.json`; si ya está en línea, no hace nada. En ramas/PRs como `sync-skills`, regenera el manifest localmente con `pnpm run build:manifest` o usa `pnpm run validate` antes de commitear.

## Sincronización con upstream

El repositorio sincroniza skills desde [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills/tree/main/plugin/skills) mediante `.github/workflows/sync-upstream-skills.yml`.

- Frecuencia: cron diario y ejecución manual (`workflow_dispatch`).
- Detección: compara el SHA del último commit upstream en `plugin/skills` con `.github/upstream-sync-state.json`.
- Si no hay cambios, no crea PR.
- Si hay cambios, crea o actualiza un PR desde la rama `sync-skills` hacia `main`.

### Reglas de sincronización

| Caso                                | Acción                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Skill nueva en upstream             | Se copia a `skills/<id>/` y se agrega en `skills.config.json` bajo `Por asignar`. |
| Skill común con cambios en upstream | Se actualiza con la versión upstream.                                             |
| Skill eliminada en upstream         | No se elimina localmente; se reporta en el PR.                                    |
| Skill solo local                    | Se conserva.                                                                      |
| Skill listada en `sync.ignore`      | Se omite durante la sincronización.                                               |

### Protección de cambios locales

Para evitar que una skill común sea sobrescrita por upstream, agrega su ID en `sync.ignore`:

```text
python-pro
```

### Ejecución local

```bash
pnpm run sync:upstream:dry
pnpm run sync:upstream
```

## Licencia

MIT. Ver [LICENSE](LICENSE).

## Referencias

- [1] J. Allan, "claude-skills," GitHub. [Online]. Available: https://github.com/Jeffallan/claude-skills. [Accessed: 26-Nov-2026].
- [2] GitHub, "Events that trigger workflows," GitHub Docs. [Online]. Available: https://docs.github.com/actions/using-workflows/events-that-trigger-workflows. [Accessed: 26-Nov-2026].
- [3] GitHub, "REST API endpoints for commits," GitHub Docs. [Online]. Available: https://docs.github.com/rest/commits/commits. [Accessed: 26-Nov-2026].
