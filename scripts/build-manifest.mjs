#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const skillsDir = path.join(root, 'skills');
const configPath = path.join(root, 'skills.config.json');
const manifestPath = path.join(root, 'manifest.json');

/**
 * Descripción: Extrae pares clave-valor simples del frontmatter YAML de un archivo Markdown.
 * Args:
 *    - content: (Obligatorio) Contenido completo del archivo Markdown como cadena.
 * Returns:
 *    Objeto con los campos encontrados en el frontmatter.
 */
export function parseFrontmatter(content) {
    // Busca el bloque delimitado por --- al inicio del archivo.
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    // Recorre cada línea del frontmatter para extraer claves y valores.
    const lines = match[1].split(/\r?\n/);
    const data = {};
    for (const line of lines) {
        // Ignora líneas que no cumplen el formato clave: valor.
        const keyValueMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!keyValueMatch) continue;
        const key = keyValueMatch[1];
        let value = keyValueMatch[2].trim();

        // Elimina comillas envolventes para normalizar el valor.
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        data[key] = value;
    }
    return data;
}

/**
 * Descripción: Construye un índice de skill ID a categoría desde el archivo de configuración.
 * Args:
 *    - config: (Obligatorio) Objeto de configuración cargado desde skills.config.json.
 * Returns:
 *    Mapa donde la clave es el skill ID y el valor es la categoría asignada.
 */
export function buildCategoryIndex(config) {
    const index = new Map();
    // Valida que la configuración sea un objeto utilizable.
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return index;
    }

    const values = Object.values(config);
    const isGroupedFormat = values.length > 0 && values.every((value) => Array.isArray(value));

    // Soporta formato agrupado: { "Categoría": ["skill-id", ...] }.
    if (isGroupedFormat) {
        for (const [category, skillIds] of Object.entries(config)) {
            if (!Array.isArray(skillIds)) continue;
            for (const skillId of skillIds) {
                if (typeof skillId === 'string' && skillId.trim()) {
                    index.set(skillId, category);
                }
            }
        }
        return index;
    }

    // Soporta formato legado: { "skill-id": "Categoría" }.
    for (const [skillId, category] of Object.entries(config)) {
        if (typeof category === 'string' && category.trim()) {
            index.set(skillId, category);
        }
    }
    return index;
}

/**
 * Descripción: Lee las skills disponibles desde disco y construye la lista para el manifest.
 * Args:
 *    - currentSkillsDir: (Obligatorio) Ruta absoluta al directorio de skills.
 *    - currentCategoryIndex: (Obligatorio) Mapa de skill ID a categoría.
 * Returns:
 *    Lista de objetos de skill con id, name, description y category.
 */
export function loadSkills(currentSkillsDir, currentCategoryIndex) {
    // Obtiene solo directorios válidos, excluyendo ocultos.
    const entries = fs
        .readdirSync(currentSkillsDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .map((dirent) => dirent.name)
        .sort((a, b) => a.localeCompare(b));

    const skills = [];
    for (const id of entries) {
        const skillFile = path.join(currentSkillsDir, id, 'SKILL.md');
        // Omite directorios sin definición de skill.
        if (!fs.existsSync(skillFile)) continue;

        // Extrae metadatos del frontmatter para el manifest.
        const content = fs.readFileSync(skillFile, 'utf8');
        const frontmatter = parseFrontmatter(content);
        skills.push({
            id,
            name: frontmatter.name || id,
            description: frontmatter.description || '',
            category: currentCategoryIndex.get(id) || 'Otros',
        });
    }

    // Ordena por categoría y luego por nombre para salida estable.
    skills.sort((a, b) => {
        const categoryCompare = a.category.localeCompare(b.category, 'es');
        if (categoryCompare !== 0) return categoryCompare;
        return a.name.localeCompare(b.name, 'es');
    });

    return skills;
}

/**
 * Descripción: Genera el objeto manifest con versión, fecha de generación y skills.
 * Args:
 *    - skills: (Obligatorio) Lista de skills procesadas.
 *    - generatedAt: (Opcional) Fecha ISO para la generación; usa la actual por defecto.
 * Returns:
 *    Objeto manifest listo para serializar.
 */
export function buildManifest(skills, generatedAt = new Date().toISOString()) {
    // Construye la estructura esperada por consumidores del manifest.
    return {
        version: 1,
        generated: generatedAt,
        skills,
    };
}

/**
 * Descripción: Ejecuta la generación del manifest leyendo configuración y skills del repositorio.
 * Args:
 *    - options: (Opcional) Rutas personalizadas para pruebas o ejecución controlada.
 *        - skillsDirectory: Ruta del directorio de skills.
 *        - configFile: Ruta del archivo skills.config.json.
 *        - manifestFile: Ruta de salida del manifest.json.
 * Returns:
 *    Objeto con el manifest generado y la cantidad de skills.
 */
export function runBuildManifest(options = {}) {
    const currentSkillsDir = options.skillsDirectory || skillsDir;
    const currentConfigPath = options.configFile || configPath;
    const currentManifestPath = options.manifestFile || manifestPath;

    // Verifica prerequisitos antes de procesar.
    if (!fs.existsSync(currentSkillsDir)) {
        throw new Error('No existe el directorio skills/');
    }

    // Carga configuración de categorías si existe.
    const config = fs.existsSync(currentConfigPath)
        ? JSON.parse(fs.readFileSync(currentConfigPath, 'utf8'))
        : {};
    const categoryIndex = buildCategoryIndex(config);
    const skills = loadSkills(currentSkillsDir, categoryIndex);
    const manifest = buildManifest(skills, options.generatedAt);

    // Escribe el manifest con formato estable para control de versiones.
    fs.writeFileSync(currentManifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
    return { manifest, count: skills.length };
}

// Ejecuta el script solo cuando se invoca directamente desde CLI.
const isDirectExecution =
    process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectExecution) {
    const result = runBuildManifest();
    console.log(`Manifest generado: ${result.count} skills`);
}
