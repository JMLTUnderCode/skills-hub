#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBuildManifest } from './build-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

export const DEFAULT_SOURCE = {
    repository: 'Jeffallan/claude-skills',
    ref: 'main',
    path: 'plugin/skills',
};

/**
 * Descripción: Ejecuta un comando git y retorna la salida estándar.
 * Args:
 *    - args: (Obligatorio) Lista de argumentos para git.
 *    - options: (Opcional) Opciones de ejecución para child_process.
 * Returns:
 *    Salida estándar del comando como cadena.
 */
export function runGit(args, options = {}) {
    // Ejecuta git con codificación UTF-8 para evitar problemas de caracteres.
    return execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
    }).trim();
}

/**
 * Descripción: Lee un archivo JSON si existe; en caso contrario retorna un valor por defecto.
 * Args:
 *    - filePath: (Obligatorio) Ruta absoluta del archivo JSON.
 *    - fallback: (Obligatorio) Valor a retornar si el archivo no existe.
 * Returns:
 *    Objeto parseado o el valor por defecto.
 */
export function readJsonIfExists(filePath, fallback) {
    // Evita fallar cuando el archivo de estado aún no existe.
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Descripción: Escribe un objeto como JSON con formato estable y salto de línea final.
 * Args:
 *    - filePath: (Obligatorio) Ruta absoluta de salida.
 *    - value: (Obligatorio) Valor serializable a JSON.
 * Returns:
 *    void
 */
export function writeJsonFile(filePath, value) {
    // Usa indentación de 4 espacios para consistencia con el repositorio.
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
}

/**
 * Descripción: Carga los IDs de skills ignoradas desde sync.ignore.
 * Args:
 *    - ignoreFile: (Obligatorio) Ruta al archivo sync.ignore.
 * Returns:
 *    Set con IDs de skills a ignorar.
 */
export function loadIgnoreList(ignoreFile) {
    // Si no existe archivo de exclusiones, no se ignora ninguna skill.
    if (!fs.existsSync(ignoreFile)) return new Set();

    const content = fs.readFileSync(ignoreFile, 'utf8');
    const ignored = new Set();
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        // Ignora comentarios y líneas vacías para mantener el formato simple.
        if (!line || line.startsWith('#')) continue;
        ignored.add(line);
    }
    return ignored;
}

/**
 * Descripción: Obtiene el SHA más reciente del upstream para la ruta de skills.
 * Args:
 *    - source: (Obligatorio) Configuración de fuente upstream.
 *    - fetcher: (Opcional) Función fetch inyectable para pruebas.
 * Returns:
 *    SHA del commit más reciente que afecta la ruta upstream.
 */
export async function getUpstreamSha(source, fetcher = fetch) {
    // Consulta commits limitados a la ruta para detectar cambios reales en skills.
    const url = new URL(`https://api.github.com/repos/${source.repository}/commits`);
    url.searchParams.set('sha', source.ref);
    url.searchParams.set('path', source.path);
    url.searchParams.set('per_page', '1');

    const response = await fetcher(url, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'skills-hub-sync',
        },
    });
    if (!response.ok) {
        throw new Error(`No se pudo consultar upstream: ${response.status} ${response.statusText}`);
    }
    const commits = await response.json();
    if (!Array.isArray(commits) || commits.length === 0 || !commits[0]?.sha) {
        throw new Error('No se encontró commit upstream para la ruta configurada');
    }
    return commits[0].sha;
}

/**
 * Descripción: Lista los directorios de skills presentes en una ruta.
 * Args:
 *    - skillsDirectory: (Obligatorio) Ruta al directorio que contiene skills.
 * Returns:
 *    Lista ordenada de IDs de skills.
 */
export function listSkillIds(skillsDirectory) {
    // Solo considera directorios no ocultos como skills candidatas.
    return fs
        .readdirSync(skillsDirectory, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .map((dirent) => dirent.name)
        .sort((a, b) => a.localeCompare(b));
}

/**
 * Descripción: Elimina el directorio de destino y copia el contenido desde origen.
 * Args:
 *    - sourceDir: (Obligatorio) Directorio fuente.
 *    - targetDir: (Obligatorio) Directorio destino.
 * Returns:
 *    void
 */
export function replaceDirectory(sourceDir, targetDir) {
    // Reemplaza completamente para reflejar renombres/eliminaciones internas de la skill.
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });
}

/**
 * Descripción: Determina si dos directorios tienen contenido diferente.
 * Args:
 *    - leftDir: (Obligatorio) Primer directorio.
 *    - rightDir: (Obligatorio) Segundo directorio.
 * Returns:
 *    true si existe alguna diferencia, false si son equivalentes.
 */
export function directoriesDiffer(leftDir, rightDir) {
    // Compara árbol completo para detectar cambios en SKILL.md o references/.
    const leftFiles = collectFiles(leftDir);
    const rightFiles = collectFiles(rightDir);
    if (leftFiles.length !== rightFiles.length) return true;

    for (let index = 0; index < leftFiles.length; index += 1) {
        const leftRel = leftFiles[index];
        const rightRel = rightFiles[index];
        if (leftRel !== rightRel) return true;
        const leftBuffer = fs.readFileSync(path.join(leftDir, leftRel));
        const rightBuffer = fs.readFileSync(path.join(rightDir, rightRel));
        if (!leftBuffer.equals(rightBuffer)) return true;
    }
    return false;
}

/**
 * Descripción: Recolecta rutas relativas de archivos dentro de un directorio.
 * Args:
 *    - baseDir: (Obligatorio) Directorio base a recorrer.
 * Returns:
 *    Lista ordenada de rutas relativas con separadores POSIX.
 */
export function collectFiles(baseDir) {
    const files = [];
    const stack = [''];
    // Recorre el árbol en profundidad para construir una comparación determinista.
    while (stack.length > 0) {
        const relativeDir = stack.pop();
        const absoluteDir = path.join(baseDir, relativeDir);
        const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
        for (const entry of entries) {
            const relPath = path.posix.join(relativeDir.split(path.sep).join('/'), entry.name);
            if (entry.isDirectory()) {
                stack.push(path.join(relativeDir, entry.name));
            } else if (entry.isFile()) {
                files.push(relPath);
            }
        }
    }
    files.sort((a, b) => a.localeCompare(b));
    return files;
}

/**
 * Descripción: Asegura que exista la categoría de asignación pendiente en la configuración.
 * Args:
 *    - config: (Obligatorio) Configuración de categorías.
 *    - categoryName: (Opcional) Nombre de la categoría pendiente.
 * Returns:
 *    Configuración normalizada con la categoría pendiente.
 */
export function ensurePendingCategory(config, categoryName = 'Por asignar') {
    // Crea la categoría si no existe para clasificar skills nuevas.
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { [categoryName]: [] };
    }
    if (!Array.isArray(config[categoryName])) {
        config[categoryName] = [];
    }
    return config;
}

/**
 * Descripción: Agrega un skill ID a una categoría si no está presente en la configuración.
 * Args:
 *    - config: (Obligatorio) Configuración agrupada por categoría.
 *    - skillId: (Obligatorio) ID de la skill.
 *    - c

/**
 * Descripción: Agrega un skill ID a una categoría si no está presente en la configuración.
 * Args:
 *    - config: (Obligatorio) Configuración agrupada por categoría.
 *    - skillId: (Obligatorio) ID de la skill.
 *    - categoryName: (Opcional) Categoría destino.
 * Returns:
 *    true si se agregó; false si ya existía.
 */
export function addSkillToCategory(config, skillId, categoryName = 'Por asignar') {
    // Evita duplicados en cualquier categoría antes de insertar.
    for (const skillIds of Object.values(config)) {
        if (Array.isArray(skillIds) && skillIds.includes(skillId)) return false;
    }
    config[categoryName].push(skillId);
    config[categoryName].sort((a, b) => a.localeCompare(b));
    return true;
}

/**
 * Descripción: Clona el repositorio upstream usando sparse checkout para la ruta de skills.
 * Args:
 *    - source: (Obligatorio) Fuente upstream.
 *    - tempDir: (Obligatorio) Directorio temporal de trabajo.
 *    - gitRunner: (Opcional) Ejecutor git inyectable para pruebas.
 * Returns:
 *    Ruta absoluta al directorio de skills dentro del checkout temporal.
 */
export function checkoutUpstreamSkills(source, tempDir, gitRunner = runGit) {
    const repoUrl = `https://github.com/${source.repository}.git`;
    const checkoutDir = path.join(tempDir, 'upstream');
    // Clona solo lo necesario para minimizar tiempo y ancho de banda.
    gitRunner([
        'clone',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        '--branch',
        source.ref,
        repoUrl,
        checkoutDir,
    ]);
    gitRunner(['-C', checkoutDir, 'sparse-checkout', 'set', source.path]);
    return path.join(checkoutDir, source.path);
}

/**
 * Descripción: Sincroniza skills desde upstream aplicando reglas de adición, actualización y reporte.
 * Args:
 *    - options: (Opcional) Rutas y dependencias para ejecución o pruebas.
 * Returns:
 *    Resumen de la sincronización.
 */
export async function syncUpstreamSkills(options = {}) {
    const currentRoot = options.root || root;
    const source = { ...DEFAULT_SOURCE, ...(options.source || {}) };
    const skillsDirectory = options.skillsDirectory || path.join(currentRoot, 'skills');
    const configFile = options.configFile || path.join(currentRoot, 'skills.config.json');
    const stateFile =
        options.stateFile || path.join(currentRoot, '.github', 'upstream-sync-state.json');
    const ignoreFile = options.ignoreFile || path.join(currentRoot, 'sync.ignore');
    const dryRun = Boolean(options.dryRun);
    const fetcher = options.fetcher || fetch;
    const gitRunner = options.gitRunner || runGit;
    const now = options.now || new Date().toISOString();

    // Carga estado previo para evitar trabajo cuando no hay cambios upstream.
    const state = readJsonIfExists(stateFile, {
        source,
        lastSyncedSha: '',
        lastSyncedAt: '',
    });
    const upstreamSha = options.upstreamSha || (await getUpstreamSha(source, fetcher));
    if (state.lastSyncedSha && state.lastSyncedSha === upstreamSha) {
        return {
            changed: false,
            reason: 'up-to-date',
            upstreamSha,
            added: [],
            updated: [],
            removedUpstream: [],
            ignored: [],
            localOnly: [],
        };
    }

    const ignoredIds = loadIgnoreList(ignoreFile);
    const config = ensurePendingCategory(
        readJsonIfExists(configFile, { 'Por asignar': [] }),
        'Por asignar'
    );

    // Usa directorio upstream inyectado en pruebas o hace sparse checkout en ejecución real.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-hub-sync-'));
    let upstreamSkillsDir = options.upstreamSkillsDirectory;
    try {
        if (!upstreamSkillsDir) {
            upstreamSkillsDir = checkoutUpstreamSkills(source, tempDir, gitRunner);
        }

        const upstreamIds = listSkillIds(upstreamSkillsDir);
        const localIds = listSkillIds(skillsDirectory);
        const upstreamSet = new Set(upstreamIds);
        const localSet = new Set(localIds);

        const added = [];
        const updated = [];
        const ignored = [];
        const removedUpstream = localIds.filter((id) => !upstreamSet.has(id));
        const localOnly = removedUpstream.filter((id) => !ignoredIds.has(id));

        // Aplica cambios de upstream sobre skills comunes y nuevas.
        for (const skillId of upstreamIds) {
            const sourceDir = path.join(upstreamSkillsDir, skillId);
            const targetDir = path.join(skillsDirectory, skillId);
            const existsLocally = localSet.has(skillId);

            if (ignoredIds.has(skillId)) {
                ignored.push(skillId);
                continue;
            }

            if (!existsLocally) {
                if (!dryRun) replaceDirectory(sourceDir, targetDir);
                addSkillToCategory(config, skillId, 'Por asignar');
                added.push(skillId);
                continue;
            }

            if (directoriesDiffer(sourceDir, targetDir)) {
                if (!dryRun) replaceDirectory(sourceDir, targetDir);
                updated.push(skillId);
            }
        }

        const changed =
            added.length > 0 ||
            updated.length > 0 ||
            !state.lastSyncedSha ||
            state.lastSyncedSha !== upstreamSha;

        if (!dryRun && changed) {
            writeJsonFile(configFile, config);
            // Regenera manifest para reflejar nuevas skills/categorías.
            runBuildManifest({
                skillsDirectory,
                configFile,
                manifestFile: options.manifestFile || path.join(currentRoot, 'manifest.json'),
            });
            writeJsonFile(stateFile, {
                source,
                lastSyncedSha: upstreamSha,
                lastSyncedAt: now,
            });
        }

        return {
            changed,
            reason: changed ? 'updated' : 'no-local-changes',
            upstreamSha,
            added,
            updated,
            removedUpstream,
            ignored,
            localOnly,
        };
    } finally {
        // Limpia checkout temporal para no dejar residuos.
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Descripción: Parsea argumentos CLI simples para la sincronización.
 * Args:
 *    - argv: (Obligatorio) Lista de argumentos de proceso.
 * Returns:
 *    Objeto con flags soportadas.
 */
export function parseArgs(argv) {
    // Parser mínimo para evitar dependencias adicionales.
    return {
        dryRun: argv.includes('--dry-run'),
        json: argv.includes('--json'),
    };
}

/**
 * Descripción: Ejecuta la sincronización desde CLI y muestra un resumen.
 * Args:
 *    - argv: (Opcional) Argumentos CLI.
 * Returns:
 *    Promesa con el resumen de sincronización.
 */
export async function runCli(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const summary = await syncUpstreamSkills({ dryRun: args.dryRun });
    if (args.json) {
        console.log(JSON.stringify(summary, null, 2));
        return summary;
    }

    // Imprime resumen legible para ejecución manual o logs de CI.
    console.log(`upstreamSha: ${summary.upstreamSha}`);
    console.log(`changed: ${summary.changed}`);
    console.log(`added: ${summary.added.length}`);
    console.log(`updated: ${summary.updated.length}`);
    console.log(`removedUpstream: ${summary.removedUpstream.length}`);
    console.log(`ignored: ${summary.ignored.length}`);
    return summary;
}

const isDirectExecution =
    process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectExecution) {
    runCli().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
