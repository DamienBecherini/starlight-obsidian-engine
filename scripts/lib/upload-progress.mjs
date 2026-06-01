// @ts-check
import { stdout } from 'node:process';

const isTTY = Boolean(stdout.isTTY);

/**
 * @param {number} completed
 * @param {number} total
 * @returns {number}
 */
export function uploadFraction(completed, total) {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(1, completed / total));
}

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
 * @param {number} max
 * @returns {string}
 */
function truncateEnd(value, max) {
    if (!value || max <= 0) return '';
    if (value.length <= max) return value;
    if (max <= 1) return '…';
    return `…${value.slice(-(max - 1))}`;
}

/** Bar + percent prefix length for `   [${bar}] ${pct}%  `. */
const PROGRESS_PREFIX_COLS = 38;

/**
 * Bytes/file counts are never truncated; only the filename tail may be clipped.
 * @param {string} statsPart e.g. `4.7 MB / 7.7 MB` or `12 / 274 files`
 * @param {string} [fileName]
 * @param {number} [lineBudget]
 * @returns {string}
 */
export function formatProgressSuffix(statsPart, fileName = '', lineBudget = 42) {
    const stats = statsPart.trim();
    const name = fileName.trim();
    if (!stats && !name) return '';
    if (!name) return stats;
    const sep = stats ? '  ' : '';
    const nameMax = Math.max(0, lineBudget - stats.length - sep.length);
    const clipped = nameMax >= 8 ? truncateEnd(name, nameMax) : nameMax >= 1 ? truncateEnd(name, nameMax) : '';
    return `${stats}${sep}${clipped}`;
}

/**
 * Single-line upload progress bar. No-op rendering when stdout is not a TTY
 * (keeps CI / piped logs clean); callers still print their own start/end lines.
 *
 * @param {{ totalBytes?: number, totalFiles?: number }} [opts]
 */
export function createUploadProgress({ totalBytes = 0, totalFiles = 0 } = {}) {
    let lastLength = 0;
    let lastRenderMs = 0;
    /** Monotonic byte counter (chunked FTPS may report overlapping ranges). */
    let highWaterBytes = 0;
    let highWaterFiles = 0;
    const linePrefix = process.platform === 'win32' ? '\x1b[2K\r' : '\r';

    const lineBudget = () => {
        const cols = typeof stdout.columns === 'number' && stdout.columns > 0 ? stdout.columns : 80;
        return Math.max(24, cols - PROGRESS_PREFIX_COLS);
    };

    /**
     * @param {number} fraction
     * @param {string} statsPart
     * @param {string} [fileName]
     */
    const render = (fraction, statsPart, fileName = '') => {
        if (!isTTY) return;
        const now = Date.now();
        if (now - lastRenderMs < 80 && fraction > 0 && fraction < 1) return;
        lastRenderMs = now;
        const pct = `${Math.round(fraction * 100)}`.padStart(3);
        const suffix = formatProgressSuffix(statsPart, fileName, lineBudget());
        const line = `   [${renderBar(fraction)}] ${pct}%  ${suffix}`;
        stdout.write(`${linePrefix}${line}`);
        lastLength = line.length;
    };

    return {
        /**
         * Byte-based update (basic-ftp trackProgress).
         * @param {number} bytesCompleted bytes already transferred in this deploy run
         * @param {string} [name]
         */
        onBytes(bytesCompleted, name) {
            const capped =
                totalBytes > 0 ? Math.min(bytesCompleted, totalBytes) : Math.max(0, bytesCompleted);
            highWaterBytes = Math.max(highWaterBytes, capped);
            const fraction = uploadFraction(highWaterBytes, totalBytes);
            const statsPart = totalBytes
                ? `${humanBytes(highWaterBytes)} / ${humanBytes(totalBytes)}`
                : '';
            render(fraction, statsPart, name ?? '');
        },
        /**
         * File-count update (ssh2-sftp-client 'upload' event).
         * @param {number} filesDone
         * @param {string} [name]
         */
        onFile(filesDone, name) {
            highWaterFiles = Math.max(highWaterFiles, filesDone);
            const fraction = totalFiles ? highWaterFiles / totalFiles : 0;
            render(fraction, `${highWaterFiles} / ${totalFiles} files`, name ?? '');
        },
        /** Clears the progress line so the next log starts fresh. */
        finish() {
            if (!isTTY) return;
            if (totalBytes > 0) {
                render(1, `${humanBytes(totalBytes)} / ${humanBytes(totalBytes)}`, '');
            }
            if (lastLength) {
                stdout.write(`${linePrefix}${' '.repeat(lastLength)}${linePrefix}`);
            }
        },
    };
}
