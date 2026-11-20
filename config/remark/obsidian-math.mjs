// @ts-check

/**
 * `$…$` formulas read as Obsidian reads them.
 *
 * `remark-math` takes any text between two single dollars of a paragraph for a formula, so a page that gives two
 * prices (« 1 999 $ … 27 800 $ », "$5,499 … $6,950") shows the words between them as math. Obsidian follows the rule
 * of Pandoc: the opening `$` is followed by a character that is not a space, the closing `$` follows a character
 * that is not a space and is not followed by a digit. With this plugin the site reads the same pages the same way.
 *
 * Formulas between double dollars (`$$…$$`, inline or as a block) are not concerned.
 */

const DOLLAR = 36;
const SPACE = 32;
const DIGIT_0 = 48;
const DIGIT_9 = 57;
const PROBE = 'obsidianMathProbe';

/**
 * End of the text, a space, a tab or the end of a line (micromark gives negative codes to the last two).
 * @param {number | null} code
 */
const isBlank = (code) => code === null || code < 0 || code === SPACE;

/** @param {number | null} code */
const isLineEnding = (code) => code !== null && code < -2;

/** @param {number | null} code */
const isDigit = (code) => code !== null && code >= DIGIT_0 && code <= DIGIT_9;

/**
 * Reads ahead, as the math tokenizer of micromark would, and says whether Obsidian would take what starts here for a
 * formula. Used with `effects.check`: nothing it reads is kept.
 *
 * @param {any} effects
 * @param {any} ok
 * @param {any} nok
 */
function tokenizeProbe(effects, ok, nok) {
    let opening = 0;
    let closing = 0;
    let afterBlank = false;
    let closesAfterBlank = false;
    return start;

    /**
     * @param {number | null} code
     * @returns {any} the next state
     */
    function start(code) {
        effects.enter(PROBE);
        return open(code);
    }

    /**
     * @param {number | null} code
     * @returns {any} the next state
     */
    function open(code) {
        if (code === DOLLAR) {
            effects.consume(code);
            opening++;
            return open;
        }
        // Two dollars or more: the rule is about single dollars only.
        if (opening > 1) return done(code);
        if (isBlank(code)) return nok(code);
        return inside(code);
    }

    /**
     * @param {number | null} code
     * @returns {any} the next state
     */
    function inside(code) {
        if (code === null) return nok(code);
        if (code === DOLLAR) {
            closing = 0;
            closesAfterBlank = afterBlank;
            return close(code);
        }
        if (isLineEnding(code)) {
            effects.exit(PROBE);
            effects.enter('lineEnding');
            effects.consume(code);
            effects.exit('lineEnding');
            effects.enter(PROBE);
            afterBlank = true;
            return inside;
        }
        effects.consume(code);
        afterBlank = isBlank(code);
        return inside;
    }

    /**
     * @param {number | null} code
     * @returns {any} the next state
     */
    function close(code) {
        if (code === DOLLAR) {
            effects.consume(code);
            closing++;
            return close;
        }
        // More dollars than at the opening: micromark reads them as content and goes on.
        if (closing !== opening) {
            afterBlank = false;
            return inside(code);
        }
        if (closesAfterBlank || isDigit(code)) return nok(code);
        return done(code);
    }

    /**
     * @param {number | null} code
     * @returns {any} the next state
     */
    function done(code) {
        effects.exit(PROBE);
        return ok(code);
    }
}

const probe = { tokenize: tokenizeProbe, partial: true };

/**
 * The same construct, tried only where Obsidian would see a formula.
 * @param {any} construct
 */
function guarded(construct) {
    if (construct?.name !== 'mathText') return construct;
    return {
        ...construct,
        /**
         * @this {any}
         * @param {any} effects
         * @param {any} ok
         * @param {any} nok
         */
        tokenize(effects, ok, nok) {
            return effects.check(probe, construct.tokenize.call(this, effects, ok, nok), nok);
        },
    };
}

/**
 * A micromark math extension (the one `remark-math` registers) with its inline construct guarded.
 * @param {any} extension
 */
export function withObsidianDollars(extension) {
    const constructs = extension?.text?.[DOLLAR];
    if (!constructs) return extension;
    const next = Array.isArray(constructs) ? constructs.map(guarded) : guarded(constructs);
    return { ...extension, text: { ...extension.text, [DOLLAR]: next } };
}

/**
 * Remark plugin, to list right after `remark-math`.
 * @this {any}
 */
export function remarkObsidianMath() {
    const data = this.data();
    data.micromarkExtensions = (data.micromarkExtensions ?? []).map(withObsidianDollars);
}
