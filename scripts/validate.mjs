#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const isTty = process.stdout.isTTY;
const useColor = isTty && !process.env.NO_COLOR;
const color = {
    green: (text) => (useColor ? `\x1b[32m${text}\x1b[0m` : text),
    red: (text) => (useColor ? `\x1b[31m${text}\x1b[0m` : text),
    cyan: (text) => (useColor ? `\x1b[36m${text}\x1b[0m` : text),
    dim: (text) => (useColor ? `\x1b[2m${text}\x1b[0m` : text),
    bold: (text) => (useColor ? `\x1b[1m${text}\x1b[0m` : text),
};
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const okMark = color.green('✔');
const failMark = color.red('✖');

/**
 * Descripción: Escapa un argumento para ejecutarlo mediante cmd.exe en Windows.
 * Args:
 *    - arg: (Obligatorio) Argumento a escapar.
 * Returns:
 *    Argumento escapado y seguro para cmd.exe.
 */
function quoteCmdArg(arg) {
    // Encierra argumentos con espacios o caracteres especiales para cmd.exe.
    if (arg === '') return '""';
    if (!/[ \t"&()<>|^]/.test(arg)) return arg;
    return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Descripción: Resuelve el ejecutable real para comandos npm/pnpm en Windows.
 * Args:
 *    - command: (Obligatorio) Nombre del comando solicitado.
 * Returns:
 *    Ruta o nombre del ejecutable a usar.
 */
function resolveCommand(command) {
    // Busca el ejecutable en PATH para invocarlo sin shell:true.
    if (process.platform !== 'win32') return command;

    const extensions = ['.cmd', '.exe', '.bat', ''];
    const pathEntries = (process.env.PATH || '').split(path.delimiter);
    for (const entry of pathEntries) {
        for (const extension of extensions) {
            const candidate = path.join(entry, `${command}${extension}`);
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return command;
}

/**
 * Descripción: Ejecuta un comando y captura su salida para mostrarla solo si falla.
 * Args:
 *    - command: (Obligatorio) Comando a ejecutar.
 *    - args: (Obligatorio) Argumentos del comando.
 *    - options: (Opcional) Opciones adicionales de ejecución.
 * Returns:
 *    Promesa con código de salida, salida estándar y salida de error.
 */
function runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
        const executable = resolveCommand(command);
        const isWindowsBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
        const child = isWindowsBatch
            ? spawn(
                  process.env.ComSpec || 'cmd.exe',
                  ['/d', '/s', '/c', [executable, ...args].map(quoteCmdArg).join(' ')],
                  {
                      cwd: options.cwd || process.cwd(),
                      env: process.env,
                      shell: false,
                      stdio: ['ignore', 'pipe', 'pipe'],
                  }
              )
            : spawn(executable, args, {
                  cwd: options.cwd || process.cwd(),
                  env: process.env,
                  shell: false,
                  stdio: ['ignore', 'pipe', 'pipe'],
              });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (error) => {
            resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
        });
        child.on('close', (code) => {
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
}

/**
 * Descripción: Inicia una animación de carga para una fase en ejecución.
 * Args:
 *    - label: (Obligatorio) Texto descriptivo de la fase.
 * Returns:
 *    Objeto con la función para detener la animación.
 */
function startSpinner(label) {
    let index = 0;
    let active = true;
    const render = () => {
        if (!active) return;
        const frame = color.cyan(frames[index % frames.length]);
        const line = `${frame} ${label}`;
        if (isTty) {
            process.stdout.write(`\r\x1b[2K${line}`);
        }
        index += 1;
    };

    render();
    const timer = isTty ? setInterval(render, 80) : null;
    if (!isTty) {
        console.log(`... ${label}`);
    }

    return {
        stop(success, detail = '') {
            active = false;
            if (timer) clearInterval(timer);
            const mark = success ? okMark : failMark;
            const suffix = detail ? ` ${color.dim(detail)}` : '';
            const line = `${mark} ${label}${suffix}`;
            if (isTty) {
                process.stdout.write(`\r\x1b[2K${line}\n`);
            } else {
                console.log(line);
            }
        },
    };
}

/**
 * Descripción: Ejecuta una fase con animación y muestra salida solo ante errores.
 * Args:
 *    - label: (Obligatorio) Nombre visible de la fase.
 *    - task: (Obligatorio) Función asíncrona que ejecuta la fase.
 * Returns:
 *    Promesa con el resultado de la fase.
 */
async function runPhase(label, task) {
    const spinner = startSpinner(label);
    const result = await task();
    spinner.stop(result.ok, result.detail);
    if (!result.ok) {
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        if (output) {
            console.error(`\n${color.red('Detalle del error:')}\n${output}\n`);
        }
    }
    return result;
}

/**
 * Descripción: Extrae el bloque visible de pruebas, ocultando casos y dejando el resumen.
 * Args:
 *    - output: (Obligatorio) Salida completa de pruebas.
 * Returns:
 *    Bloque de texto con el resumen final de pruebas.
 */
function extractTestBlock(output) {
    const lines = output.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim().startsWith('ℹ tests'));
    const end = lines.findIndex((line) => line.trim().startsWith('ℹ duration_ms'));
    if (start === -1 || end === -1 || end < start) return '';
    return lines
        .slice(start, end + 1)
        .join('\n')
        .trim();
}

/**
 * Descripción: Imprime un cuadro final de aprobación centrado y alineado.
 * Args:
 *    - message: (Obligatorio) Mensaje a mostrar dentro del cuadro.
 * Returns:
 *    void
 */
function printApprovalBox(message) {
    const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
    const visibleLength = (text) => text.replace(ansiPattern, '').length;
    const width = Math.max(visibleLength(message) + 8, 34);
    const inner = width - 2;
    const left = Math.floor((inner - visibleLength(message)) / 2);
    const right = inner - visibleLength(message) - left;
    const top = `┌${'─'.repeat(inner)}┐`;
    const middle = `│${' '.repeat(left)}${message}${' '.repeat(right)}│`;
    const bottom = `└${'─'.repeat(inner)}┘`;
    console.log('');
    console.log(color.green(top));
    console.log(color.green(middle));
    console.log(color.green(bottom));
}

/**
 * Descripción: Ejecuta la validación completa del repositorio por fases.
 * Args:
 *    - Sin argumentos.
 * Returns:
 *    Promesa que finaliza con código de salida según el resultado.
 */
async function main() {
    const phases = [
        {
            label: 'Fase 1: Instalación de dependencias',
            run: async () => {
                const result = await runCommand('pnpm', ['install']);
                return { ok: result.code === 0, ...result };
            },
        },
        {
            label: 'Fase 2: Validación y check con Biome',
            run: async () => {
                const build = await runCommand('pnpm', ['run', 'build:manifest']);
                if (build.code !== 0) return { ok: false, ...build };
                const check = await runCommand('pnpm', ['run', 'check']);
                return {
                    ok: check.code === 0,
                    stdout: [build.stdout, check.stdout].filter(Boolean).join('\n'),
                    stderr: [build.stderr, check.stderr].filter(Boolean).join('\n'),
                };
            },
        },
        {
            label: 'Fase 3: Tests',
            run: async () => {
                const result = await runCommand('pnpm', ['run', 'test']);
                return { ok: result.code === 0, ...result, showTests: true };
            },
        },
    ];

    for (const phase of phases) {
        const result = await runPhase(phase.label, phase.run);
        if (!result.ok) {
            process.exitCode = 1;
            return;
        }
        if (phase.label.startsWith('Fase 3') && result.stdout) {
            const block = extractTestBlock(result.stdout);
            if (block) console.log(block);
        }
    }

    printApprovalBox(color.bold('Aprobado'));
}

main().catch((error) => {
    console.error(color.red(`Error inesperado: ${error.message}`));
    process.exitCode = 1;
});
