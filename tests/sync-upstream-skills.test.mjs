import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    addSkillToCategory,
    collectFiles,
    directoriesDiffer,
    ensurePendingCategory,
    loadIgnoreList,
    parseArgs,
    syncUpstreamSkills,
} from '../scripts/sync-upstream-skills.mjs';

async function createTempDir(prefix) {
    // Crea directorios temporales aislados para pruebas de sincronización.
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSkill(baseDir, skillId, content = '# Skill') {
    // Crea una skill mínima con archivos para validar copia y diff.
    const skillDir = path.join(baseDir, skillId);
    await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf8');
    await fs.writeFile(path.join(skillDir, 'references', 'ref.md'), `ref-${skillId}`, 'utf8');
}

async function setupSyncFixture() {
    // Prepara un entorno mínimo con skills locales/upstream y archivos de estado.
    const baseDir = await createTempDir('sync-fixture-');
    const localSkillsDir = path.join(baseDir, 'skills');
    const upstreamSkillsDir = path.join(baseDir, 'upstream-skills');
    const configFile = path.join(baseDir, 'skills.config.json');
    const stateFile = path.join(baseDir, '.github', 'upstream-sync-state.json');
    const ignoreFile = path.join(baseDir, 'sync.ignore');
    const manifestFile = path.join(baseDir, 'manifest.json');

    await fs.mkdir(localSkillsDir, { recursive: true });
    await fs.mkdir(upstreamSkillsDir, { recursive: true });
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(configFile, JSON.stringify({ Lenguajes: ['python-pro'] }, null, 4));
    await fs.writeFile(ignoreFile, '', 'utf8');
    await fs.writeFile(
        stateFile,
        JSON.stringify(
            {
                source: {
                    repository: 'Jeffallan/claude-skills',
                    ref: 'main',
                    path: 'plugin/skills',
                },
                lastSyncedSha: 'old-sha',
                lastSyncedAt: '2026-01-01T00:00:00.000Z',
            },
            null,
            4
        )
    );

    return {
        baseDir,
        localSkillsDir,
        upstreamSkillsDir,
        configFile,
        stateFile,
        ignoreFile,
        manifestFile,
    };
}

test('loadIgnoreList ignora comentarios y líneas vacías', async () => {
    // Verifica el formato simple del archivo sync.ignore.
    const dir = await createTempDir('sync-ignore-');
    const ignoreFile = path.join(dir, 'sync.ignore');
    await fs.writeFile(ignoreFile, '# comentario\n\npython-pro\n  api-designer  \n', 'utf8');
    try {
        const ignored = loadIgnoreList(ignoreFile);
        assert.deepEqual([...ignored].sort(), ['api-designer', 'python-pro']);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('parseArgs detecta flags soportadas', () => {
    // Asegura que el CLI exponga dry-run y salida JSON.
    assert.deepEqual(parseArgs(['--dry-run', '--json']), { dryRun: true, json: true });
    assert.deepEqual(parseArgs([]), { dryRun: false, json: false });
});

test('addSkillToCategory evita duplicados y ordena', () => {
    // Garantiza que una skill nueva solo se agregue una vez.
    const config = ensurePendingCategory({ Backend: ['nestjs-expert'], 'Por asignar': [] });
    assert.equal(addSkillToCategory(config, 'python-pro', 'Por asignar'), true);
    assert.equal(addSkillToCategory(config, 'python-pro', 'Por asignar'), false);
    assert.equal(addSkillToCategory(config, 'nestjs-expert', 'Por asignar'), false);
    assert.deepEqual(config['Por asignar'], ['python-pro']);
});

test('directoriesDiffer detecta cambios en archivos', async () => {
    // La comparación debe detectar diferencias reales de contenido.
    const dir = await createTempDir('sync-diff-');
    const a = path.join(dir, 'a');
    const b = path.join(dir, 'b');
    await fs.mkdir(a, { recursive: true });
    await fs.mkdir(b, { recursive: true });
    await fs.writeFile(path.join(a, 'SKILL.md'), 'uno', 'utf8');
    await fs.writeFile(path.join(b, 'SKILL.md'), 'dos', 'utf8');
    try {
        assert.equal(directoriesDiffer(a, b), true);
        await fs.writeFile(path.join(b, 'SKILL.md'), 'uno', 'utf8');
        assert.equal(directoriesDiffer(a, b), false);
        assert.deepEqual(collectFiles(a), ['SKILL.md']);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('syncUpstreamSkills no crea cambios cuando el SHA upstream no cambia', async () => {
    // Evita PRs innecesarios cuando no hay actualizaciones en upstream.
    const fx = await setupSyncFixture();
    try {
        const summary = await syncUpstreamSkills({
            root: fx.baseDir,
            skillsDirectory: fx.localSkillsDir,
            configFile: fx.configFile,
            stateFile: fx.stateFile,
            ignoreFile: fx.ignoreFile,
            manifestFile: fx.manifestFile,
            upstreamSha: 'old-sha',
            upstreamSkillsDirectory: fx.upstreamSkillsDir,
        });
        assert.equal(summary.changed, false);
        assert.equal(summary.reason, 'up-to-date');
    } finally {
        await fs.rm(fx.baseDir, { recursive: true, force: true });
    }
});

test('syncUpstreamSkills agrega nuevas, actualiza comunes, preserva locales y reporta eliminadas upstream', async () => {
    // Cubre las reglas principales acordadas para la sincronización.
    const fx = await setupSyncFixture();
    try {
        await writeSkill(fx.localSkillsDir, 'python-pro', 'local-old');
        await writeSkill(fx.localSkillsDir, 'local-only', 'local-only');
        await writeSkill(fx.upstreamSkillsDir, 'python-pro', 'upstream-new');
        await writeSkill(fx.upstreamSkillsDir, 'firebase-expert', 'firebase');

        const summary = await syncUpstreamSkills({
            root: fx.baseDir,
            skillsDirectory: fx.localSkillsDir,
            configFile: fx.configFile,
            stateFile: fx.stateFile,
            ignoreFile: fx.ignoreFile,
            manifestFile: fx.manifestFile,
            upstreamSha: 'new-sha',
            upstreamSkillsDirectory: fx.upstreamSkillsDir,
            now: '2026-11-26T00:00:00.000Z',
        });

        assert.equal(summary.changed, true);
        assert.deepEqual(summary.added, ['firebase-expert']);
        assert.deepEqual(summary.updated, ['python-pro']);
        assert.deepEqual(summary.removedUpstream, ['local-only']);
        assert.deepEqual(summary.localOnly, ['local-only']);
        assert.equal(
            await fs.readFile(path.join(fx.localSkillsDir, 'python-pro', 'SKILL.md'), 'utf8'),
            'upstream-new'
        );
        assert.equal(
            await fs.readFile(path.join(fx.localSkillsDir, 'local-only', 'SKILL.md'), 'utf8'),
            'local-only'
        );
        const config = JSON.parse(await fs.readFile(fx.configFile, 'utf8'));
        assert.deepEqual(config['Por asignar'], ['firebase-expert']);
        const state = JSON.parse(await fs.readFile(fx.stateFile, 'utf8'));
        assert.equal(state.lastSyncedSha, 'new-sha');
    } finally {
        await fs.rm(fx.baseDir, { recursive: true, force: true });
    }
});

test('syncUpstreamSkills respeta sync.ignore para skills comunes', async () => {
    // Protege ediciones manuales locales cuando el usuario las excluye explícitamente.
    const fx = await setupSyncFixture();
    try {
        await writeSkill(fx.localSkillsDir, 'python-pro', 'local-custom');
        await writeSkill(fx.upstreamSkillsDir, 'python-pro', 'upstream-new');
        await fs.writeFile(fx.ignoreFile, 'python-pro\n', 'utf8');

        const summary = await syncUpstreamSkills({
            root: fx.baseDir,
            skillsDirectory: fx.localSkillsDir,
            configFile: fx.configFile,
            stateFile: fx.stateFile,
            ignoreFile: fx.ignoreFile,
            manifestFile: fx.manifestFile,
            upstreamSha: 'new-sha',
            upstreamSkillsDirectory: fx.upstreamSkillsDir,
        });

        assert.deepEqual(summary.ignored, ['python-pro']);
        assert.deepEqual(summary.updated, []);
        assert.equal(
            await fs.readFile(path.join(fx.localSkillsDir, 'python-pro', 'SKILL.md'), 'utf8'),
            'local-custom'
        );
    } finally {
        await fs.rm(fx.baseDir, { recursive: true, force: true });
    }
});

test('syncUpstreamSkills en dry-run no escribe cambios', async () => {
    // Permite validar la sincronización sin modificar archivos del repositorio.
    const fx = await setupSyncFixture();
    try {
        await writeSkill(fx.localSkillsDir, 'python-pro', 'local-old');
        await writeSkill(fx.upstreamSkillsDir, 'python-pro', 'upstream-new');

        const summary = await syncUpstreamSkills({
            root: fx.baseDir,
            skillsDirectory: fx.localSkillsDir,
            configFile: fx.configFile,
            stateFile: fx.stateFile,
            ignoreFile: fx.ignoreFile,
            manifestFile: fx.manifestFile,
            upstreamSha: 'new-sha',
            upstreamSkillsDirectory: fx.upstreamSkillsDir,
            dryRun: true,
        });

        assert.equal(summary.changed, true);
        assert.deepEqual(summary.updated, ['python-pro']);
        assert.equal(
            await fs.readFile(path.join(fx.localSkillsDir, 'python-pro', 'SKILL.md'), 'utf8'),
            'local-old'
        );
        const state = JSON.parse(await fs.readFile(fx.stateFile, 'utf8'));
        assert.equal(state.lastSyncedSha, 'old-sha');
    } finally {
        await fs.rm(fx.baseDir, { recursive: true, force: true });
    }
});
