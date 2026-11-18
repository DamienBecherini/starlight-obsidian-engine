// @ts-check
/**
 * Command and arguments to run `npm <args>` with spawnSync **without a shell**.
 *
 * With `shell: true`, Node concatenates the arguments into one command line without escaping them: a commit
 * message such as "two words" or "Fix; rm -rf x" passed through `--commit-message` would be split or executed
 * by the shell (Node 24 warns with DEP0190). Under `npm run`, npm exposes its own CLI script in
 * `npm_execpath`; running it with the current Node binary needs no shell on any OS.
 *
 * Outside npm (a script started directly with `node`), Linux and macOS call `npm` without a shell. On Windows
 * `npm` is `npm.cmd`, which Node can only start through cmd.exe: plain arguments are passed as is, and an
 * argument holding a character cmd.exe would interpret is refused rather than escaped imperfectly.
 *
 * @param {string[]} args arguments after `npm`
 * @param {NodeJS.ProcessEnv} [env]
 * @param {NodeJS.Platform} [platform]
 * @returns {{ command: string, args: string[], shell: boolean }}
 */
export function npmCommand(args, env = process.env, platform = process.platform) {
    const npmCli = env.npm_execpath;
    if (npmCli && /\.c?js$/i.test(npmCli)) {
        return { command: process.execPath, args: [npmCli, ...args], shell: false };
    }
    if (platform !== 'win32') {
        return { command: 'npm', args, shell: false };
    }
    const unsafe = args.find((a) => !/^[\w./:=@,+-]*$/.test(a));
    if (unsafe !== undefined) {
        throw new Error(
            `Argument ${JSON.stringify(unsafe)} cannot be passed safely to npm.cmd. Run this script through ` +
                '`npm run …` instead of `node …`.',
        );
    }
    return { command: 'npm', args, shell: true };
}
