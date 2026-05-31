// @ts-check
import { stdout } from 'node:process';

const isTTY = Boolean(stdout.isTTY);

/**
 * @param {number} bytes
 * @returns {string}
 */
export function humanBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * @param {number} fraction 0..1
 * @param {number} [width]
 * @returns {string}
 */
function renderBar(fraction, width = 24) {
    const clamped = Math.max(0, Math.min(1, fraction));
    const filled = Math.round(clamped * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

/**
 * @param {string} value
 * @param {number} [max]
 * @returns {string}
 */
function truncate(value, max = 38) {
    if (!value) return '';
    return value.length <= max ? value : `…${value.slice(-(max - 1))}`;
}

/**
 * Single-line upload progress bar. No-op rendering when stdout is not a TTY
 * (keeps CI / piped logs clean); callers still print their own start/end lines.
 *
 * @param {{ totalBytes?: number, totalFiles?: number }} [opts]
 */
export function createUploadProgress({ totalBytes = 0, totalFiles = 0 } = {}) {
    let lastLength = 0;

    /**
     * @param {number} fraction
     * @param {string} suffix
     */
    const render = (fraction, suffix) => {
        if (!isTTY) return;
        const pct = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}`.padStart(3);
        const line = `   [${renderBar(fraction)}] ${pct}%  ${suffix}`;
        stdout.write(`\r${line.padEnd(lastLength)}`);
        lastLength = line.length;
    };

    return {
        /**
         * Byte-based update (basic-ftp trackProgress).
         * @param {number} bytesOverall
         * @param {string} [name]
         */
        onBytes(bytesOverall, name) {
            const fraction = totalBytes ? bytesOverall / totalBytes : 0;
            render(
                fraction,
                `${humanBytes(bytesOverall)} / ${humanBytes(totalBytes)}  ${truncate(name ?? '')}`,
            );
        },
        /**
         * File-count update (ssh2-sftp-client 'upload' event).
         * @param {number} filesDone
         * @param {string} [name]
         */
        onFile(filesDone, name) {
            const fraction = totalFiles ? filesDone / totalFiles : 0;
            render(fraction, `${filesDone} / ${totalFiles} files  ${truncate(name ?? '')}`);
        },
        /** Clears the progress line so the next log starts fresh. */
        finish() {
            if (isTTY && lastLength) {
                stdout.write(`\r${' '.repeat(lastLength)}\r`);
            }
        },
    };
}
