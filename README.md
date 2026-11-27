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
- `.github/workflows/build-manifest.yml`: regeneración automática en `main`.

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
pnpm run check
pnpm run check:fix
pnpm test
```

## CI

El workflow `Build manifest` se ejecuta en push a `main` cuando cambian `skills/**` o `skills.config.json`, y también por `workflow_dispatch`. Regenera `manifest.json` y, si hay cambios, crea un commit automático `chore: regenerate manifest.json`.

## Licencia

MIT. Ver [LICENSE](LICENSE).
