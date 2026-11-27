import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    buildCategoryIndex,
    buildManifest,
    checkManifest,
    loadSkills,
    normalizeManifestForComparison,
    parseFrontmatter,
    runBuildManifest,
} from '../scripts/build-manifest.mjs';

async function createTempDir(prefix) {
    // Crea un directorio temporal aislado para cada caso de prueba.
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSkill(baseDir, skillId, frontmatter, body = '') {
    // Escribe una skill mínima con frontmatter para pruebas.
    const skillDir = path.join(baseDir, skillId);
    await fs.mkdir(skillDir, { recursive: true });
    const content = `---\n${frontmatter}\n---\n${body}`;
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf8');
}

test('parseFrontmatter extrae campos simples y normaliza comillas', () => {
    // Verifica el parser simple usado por el generador de manifest.
    const content = [
        '---',
        'name: python-pro',
        'description: "Skill de Python"',
        'domain: language',
        '---',
        '# Body',
    ].join('\n');
    const frontmatter = parseFrontmatter(content);
    assert.deepEqual(frontmatter, {
        name: 'python-pro',
        description: 'Skill de Python',
        domain: 'language',
    });
});

test('parseFrontmatter retorna objeto vacío sin frontmatter', () => {
    // Evita fallos cuando un archivo no tiene metadatos.
    assert.deepEqual(parseFrontmatter('# Sin frontmatter'), {});
});

test('buildCategoryIndex soporta formato agrupado por categoría', () => {
    // Valida el formato nuevo solicitado para skills.config.json.
    const index = buildCategoryIndex({
        Lenguajes: ['python-pro', 'typescript-pro'],
        Backend: ['nestjs-expert'],
    });
    assert.equal(index.get('python-pro'), 'Lenguajes');
    assert.equal(index.get('nestjs-expert'), 'Backend');
});

test('buildCategoryIndex soporta formato legado skill->categoría', () => {
    // Mantiene compatibilidad con configuraciones anteriores.
    const index = buildCategoryIndex({
        'python-pro': 'Lenguajes',
        'nestjs-expert': 'Backend',
    });
    assert.equal(index.get('python-pro'), 'Lenguajes');
    assert.equal(index.get('nestjs-expert'), 'Backend');
});

test('buildCategoryIndex ignora configuraciones inválidas', () => {
    // Protege la ejecución ante formatos inesperados.
    assert.equal(buildCategoryIndex(null).size, 0);
    assert.equal(buildCategoryIndex([]).size, 0);
    assert.equal(buildCategoryIndex('texto').size, 0);
});

test('loadSkills carga skills válidas, ignora ocultos y asigna Otros', async () => {
    // Cubre carga desde disco, exclusiones y categoría por defecto.
    const skillsDir = await createTempDir('skills-load-');
    try {
        await writeSkill(skillsDir, 'python-pro', 'name: python-pro\ndescription: Python');
        await writeSkill(skillsDir, 'nestjs-expert', 'name: nestjs-expert\ndescription: Nest');
        await fs.mkdir(path.join(skillsDir, '.hidden-skill'), { recursive: true });
        await fs.mkdir(path.join(skillsDir, 'invalid-skill'), { recursive: true });

        const categoryIndex = buildCategoryIndex({ Lenguajes: ['python-pro'] });
        const skills = loadSkills(skillsDir, categoryIndex);

        assert.equal(skills.length, 2);
        const pythonSkill = skills.find((skill) => skill.id === 'python-pro');
        const nestSkill = skills.find((skill) => skill.id === 'nestjs-expert');
        assert.equal(pythonSkill.category, 'Lenguajes');
        assert.equal(nestSkill.category, 'Otros');
    } finally {
        await fs.rm(skillsDir, { recursive: true, force: true });
    }
});

test('buildManifest crea estructura versionada y estable', () => {
    // Confirma el contrato del manifest consumido por instaladores.
    const manifest = buildManifest(
        [{ id: 'a', name: 'a', description: '', category: 'Otros' }],
        '2026-01-01T00:00:00.000Z'
    );
    assert.deepEqual(manifest, {
        version: 1,
        generated: '2026-01-01T00:00:00.000Z',
        skills: [{ id: 'a', name: 'a', description: '', category: 'Otros' }],
    });
});

test('runBuildManifest genera manifest.json desde rutas personalizadas', async () => {
    // Prueba integración del flujo completo de generación.
    const baseDir = await createTempDir('build-manifest-run-');
    const skillsDir = path.join(baseDir, 'skills');
    const configFile = path.join(baseDir, 'skills.config.json');
    const manifestFile = path.join(baseDir, 'manifest.json');
    await fs.mkdir(skillsDir, { recursive: true });
    await writeSkill(skillsDir, 'python-pro', 'name: python-pro\ndescription: Python');
    await fs.writeFile(configFile, JSON.stringify({ Lenguajes: ['python-pro'] }, null, 4));

    try {
        const result = runBuildManifest({
            skillsDirectory: skillsDir,
            configFile,
            manifestFile,
            generatedAt: '2026-01-01T00:00:00.000Z',
        });
        assert.equal(result.count, 1);
        const written = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
        assert.equal(written.version, 1);
        assert.equal(written.skills[0].category, 'Lenguajes');
    } finally {
        await fs.rm(baseDir, { recursive: true, force: true });
    }
});

test('runBuildManifest falla si no existe el directorio de skills', async () => {
    // Asegura un error claro ante prerequisitos faltantes.
    const baseDir = await createTempDir('build-manifest-missing-');
    try {
        assert.throws(
            () =>
                runBuildManifest({
                    skillsDirectory: path.join(baseDir, 'missing-skills'),
                    configFile: path.join(baseDir, 'skills.config.json'),
                    manifestFile: path.join(baseDir, 'manifest.json'),
                }),
            /No existe el directorio skills/
        );
    } finally {
        await fs.rm(baseDir, { recursive: true, force: true });
    }
});

test('normalizeManifestForComparison ignora generated', () => {
    // La fecha de generación no debe afectar la paridad lógica del manifest.
    const normalized = normalizeManifestForComparison({
        version: 1,
        generated: '2026-01-01T00:00:00.000Z',
        skills: [],
    });
    assert.deepEqual(normalized, { version: 1, skills: [] });
});

test('checkManifest reporta paridad cuando manifest está en línea', async () => {
    // Verifica el modo guardia en un entorno controlado.
    const baseDir = await createTempDir('build-manifest-check-ok-');
    const skillsDir = path.join(baseDir, 'skills');
    const configFile = path.join(baseDir, 'skills.config.json');
    const manifestFile = path.join(baseDir, 'manifest.json');
    await fs.mkdir(skillsDir, { recursive: true });
    await writeSkill(skillsDir, 'python-pro', 'name: python-pro\ndescription: Python');
    await fs.writeFile(configFile, JSON.stringify({ Lenguajes: ['python-pro'] }, null, 4));

    try {
        runBuildManifest({ skillsDirectory: skillsDir, configFile, manifestFile });
        const result = checkManifest({ skillsDirectory: skillsDir, configFile, manifestFile });
        assert.equal(result.ok, true);
        assert.equal(result.reason, 'in-sync');
    } finally {
        await fs.rm(baseDir, { recursive: true, force: true });
    }
});

test('checkManifest falla cuando manifest está fuera de línea', async () => {
    // Detecta disparidad de categorías/contenido sin considerar generated.
    const baseDir = await createTempDir('build-manifest-check-bad-');
    const skillsDir = path.join(baseDir, 'skills');
    const configFile = path.join(baseDir, 'skills.config.json');
    const manifestFile = path.join(baseDir, 'manifest.json');
    await fs.mkdir(skillsDir, { recursive: true });
    await writeSkill(skillsDir, 'python-pro', 'name: python-pro\ndescription: Python');
    await fs.writeFile(configFile, JSON.stringify({ Lenguajes: ['python-pro'] }, null, 4));

    try {
        runBuildManifest({ skillsDirectory: skillsDir, configFile, manifestFile });
        const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
        manifest.skills[0].category = 'Otra';
        await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 4)}\n`);
        const result = checkManifest({ skillsDirectory: skillsDir, configFile, manifestFile });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'out-of-sync');
    } finally {
        await fs.rm(baseDir, { recursive: true, force: true });
    }
});

test('checkManifest valida paridad del repositorio real', () => {
    // Garantiza que skills.config.json y manifest.json estén en línea antes de merge.
    const result = checkManifest();
    assert.equal(result.ok, true, result.reason);
});
