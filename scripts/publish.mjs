// @ts-check
/**
 * Publish workflow: git (optional) → build → remote upload (FTPS/SFTP).
 *
 * Deploy credentials live in the vault `.env` (one deploy target per vault).
 *
 * Run from the engine:  npm run publish
 * Run from the vault:   npm run publish  (delegates to the engine)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot } from '../config/vault.mjs';
import { resolveVaultGitRoot, prepareDeployConfig, runBuild, uploadDist } from './lib/deploy.mjs';

/** @typedef {'commit' | 'skip-git' | 'cancel'} DirtyChoice */

/**
 * @typedef {Object} CliOptions
 * @property {boolean} skipGit
 * @property {string | null} commitMessage
 * @property {boolean} mirror
 * @property {boolean} assumeYes
 * @property {boolean} help
 */

/**
 * @typedef {Object} RepoTarget
 * @property {string} label
 * @property {string} path
 */

function printUsage() {
    console.log(`
Usage: npm run publish [-- [options]]

Full workflow: git sync (optional) → build → remote upload (FTPS/SFTP).
Deploy credentials are read from the vault .env (see vault .env.example).

Options:
  --skip-git                 Build + upload only (no git operations)
  --commit-message "text"    Auto-commit dirty repos with this message, then push
  --no-mirror, --additive    Keep remote-only files (default mirrors: deletes them)
  --yes, -y                  Skip the upload confirmation prompt
  --help                     Show this help

Related commands:
  npm run deploy             Build + remote upload (no git)
  npm run upload             Remote upload only (existing dist/, no git, no build)

Interactive mode (default when stdin is a TTY):
  For each repo with uncommitted changes, choose:
    1) Cancel
    2) Auto-commit (prompts for commit message)
    3) Publish anyway (skip git for that repo; deploy local files)

Run from the vault with npm run publish — delegates to the engine (vault .env: ENGINE_PATH).
`);
}

/** @param {string[]} argv @returns {CliOptions} */
function parseArgs(argv) {
    /** @type {CliOptions} */
    const opts = { skipGit: false, commitMessage: null, mirror: true, assumeYes: false, help: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') opts.help = true;
        else if (arg === '--skip-git') opts.skipGit = true;
        else if (arg === '--no-mirror' || arg === '--additive') opts.mirror = false;
        else if (arg === '--yes' || arg === '-y') opts.assumeYes = true;
        else if (arg === '--commit-message') {
            const value = argv[++i];
            if (!value) {
                console.error('❌ --commit-message requires a value.');
                process.exit(1);
            }
            opts.commitMessage = value;
        } else {
            console.error(`❌ Unknown option: ${arg}`);
            printUsage();
            process.exit(1);
        }
    }
    return opts;
}

/** @param {string} repoPath @returns {boolean} */
function isGitRepo(repoPath) {
    return fs.existsSync(path.join(repoPath, '.git'));
}

/** @param {string} repoPath @returns {boolean} */
function gitDirty(repoPath) {
    const result = spawnSync('git', ['status', '--porcelain'], {
        cwd: repoPath,
        encoding: 'utf-8',
    });
    if (result.status !== 0) return false;
    return (result.stdout ?? '').trim().length > 0;
}

/** @param {string} repoPath @returns {boolean} */
function gitHasUpstream(repoPath) {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', '@{u}'], {
        cwd: repoPath,
        encoding: 'utf-8',
    });
    return result.status === 0;
}

/** @param {string} repoPath @returns {number} */
function gitAheadCount(repoPath) {
    const result = spawnSync('git', ['rev-list', '--count', '@{u}..HEAD'], {
        cwd: repoPath,
        encoding: 'utf-8',
    });
    if (result.status !== 0) return 0;
    return parseInt(result.stdout?.trim() ?? '0', 10) || 0;
}

/** @param {string} repoPath @param {string} message */
function gitCommit(repoPath, message) {
    const add = spawnSync('git', ['add', '-A'], { cwd: repoPath, stdio: 'inherit' });
    if (add.status !== 0) process.exit(add.status ?? 1);
    const commit = spawnSync('git', ['commit', '-m', message], { cwd: repoPath, stdio: 'inherit' });
    if (commit.status !== 0) process.exit(commit.status ?? 1);
}

/** @param {string} repoPath */
function gitPush(repoPath) {
    const push = spawnSync('git', ['push'], { cwd: repoPath, stdio: 'inherit' });
    if (push.status !== 0) process.exit(push.status ?? 1);
}

/** @returns {RepoTarget[]} */
function repoTargets() {
    return [
        { label: 'Vault', path: resolveVaultGitRoot() },
        { label: 'Engine', path: projectRoot },
    ];
}

/** @param {string} label @returns {Promise<DirtyChoice>} */
async function promptDirtyChoice(label) {
    const rl = readline.createInterface({ input, output });
    try {
        console.log(`\n${label} has uncommitted changes. What do you want to do?`);
        console.log('  1) Cancel');
        console.log('  2) Auto-commit (then push)');
        console.log('  3) Publish anyway (skip git for this repo)');
        const answer = (await rl.question('\n> ')).trim();
        switch (answer) {
            case '1':
                return 'cancel';
            case '2':
                return 'commit';
            case '3':
                return 'skip-git';
            default:
                console.log('Invalid choice, treating as Cancel.');
                return 'cancel';
        }
    } finally {
        rl.close();
    }
}

/** @returns {Promise<string>} */
async function promptCommitMessage() {
    const rl = readline.createInterface({ input, output });
    try {
        return (await rl.question('Commit message: ')).trim();
    } finally {
        rl.close();
    }
}

/**
 * @param {RepoTarget} repo
 * @param {CliOptions & { interactive: boolean }} opts
 * @returns {Promise<boolean>} false = abort entire publish
 */
async function handleRepoGit(repo, opts) {
    if (opts.skipGit) return true;

    if (!isGitRepo(repo.path)) {
        console.warn(`⚠️  ${repo.label}: not a git repository (${repo.path}), skipping git.`);
        return true;
    }

    const dirty = gitDirty(repo.path);
    if (!dirty) {
        if (gitHasUpstream(repo.path) && gitAheadCount(repo.path) > 0) {
            console.log(`\n📤 ${repo.label}: pushing ${gitAheadCount(repo.path)} commit(s)…`);
            gitPush(repo.path);
        } else {
            console.log(`✓ ${repo.label}: clean, nothing to push.`);
        }
        return true;
    }

    let skipGitForRepo = false;

    if (opts.commitMessage) {
        console.log(`\n📝 ${repo.label}: auto-committing…`);
        gitCommit(repo.path, opts.commitMessage);
    } else if (opts.interactive) {
        const choice = await promptDirtyChoice(repo.label);
        if (choice === 'cancel') return false;
        if (choice === 'skip-git') {
            skipGitForRepo = true;
            console.warn(
                `⚠️  ${repo.label}: publishing local changes without commit/push (GitHub will be behind).`,
            );
        } else {
            const message = await promptCommitMessage();
            if (!message) {
                console.error('❌ Commit message is required.');
                return false;
            }
            gitCommit(repo.path, message);
        }
    } else {
        console.error(
            `❌ ${repo.label} has uncommitted changes.\n` +
                '   Run interactively, or use --commit-message "…", or --skip-git.',
        );
        return false;
    }

    if (!skipGitForRepo) {
        if (gitHasUpstream(repo.path)) {
            console.log(`\n📤 ${repo.label}: pushing…`);
            gitPush(repo.path);
        } else {
            console.warn(`⚠️  ${repo.label}: no upstream branch configured, skipping push.`);
        }
    }

    return true;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        printUsage();
        return;
    }

    const interactive = Boolean(process.stdin.isTTY) && !opts.commitMessage && !opts.skipGit;

    console.log('📦 Publish — starlight-obsidian-engine');
    console.log(`   Engine: ${projectRoot}`);
    console.log(`   Vault:  ${resolveVaultGitRoot()}`);

    // Validate deploy config before any git push or build (fail-fast).
    const config = prepareDeployConfig();

    for (const repo of repoTargets()) {
        const ok = await handleRepoGit(repo, { ...opts, interactive });
        if (!ok) {
            console.log('\nPublish cancelled.');
            process.exit(0);
        }
    }

    runBuild();
    const confirm = Boolean(process.stdin.isTTY) && !opts.assumeYes;
    await uploadDist(config, { mirror: opts.mirror, confirm });
}

main();
