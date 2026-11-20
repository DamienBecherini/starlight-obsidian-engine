// @ts-check
// What a reader's opinion becomes: the text shown before it is sent, a prefilled GitHub issue, a prefilled mail.
// Pure functions, used by the page (src/components/SiteFeedback.astro) and by the tests. The site sends nothing:
// the reader does, with their own mail program or their own GitHub account.

/**
 * @typedef {Object} FeedbackAnswer
 * @property {number} rating 1 to 5, 0 when none.
 * @property {'site' | 'page'} scope What the opinion is about.
 * @property {string[]} topics Ids of FEEDBACK_TOPICS.
 * @property {string} message
 */

/**
 * @typedef {Object} FeedbackContext
 * @property {string} siteTitle
 * @property {string} pageTitle
 * @property {string} pageUrl
 */

/** What an opinion can be about, in the order shown. */
export const FEEDBACK_TOPICS = ['writing', 'outdated', 'mistake', 'structure', 'look', 'subject'];

/** The longest address an issue form and a mail program take. */
export const FEEDBACK_MAX = { issue: 8000, mail: 1800 };

const STARS = ['', '★☆☆☆☆ 1/5', '★★☆☆☆ 2/5', '★★★☆☆ 3/5', '★★★★☆ 4/5', '★★★★★ 5/5'];

const LABELS = {
    fr: {
        cardTitle: 'Votre avis compte',
        cardText: 'Une note, une remarque sur le fond ou la forme, une page dépassée : dites-le en une minute.',
        open: 'Donner mon avis',
        intro: "Tout est facultatif : une seule réponse suffit. Ce site n'envoie rien : c'est vous qui envoyez, par le moyen de votre choix.",
        rating: 'Votre note',
        ratingOf: (/** @type {number} */ n) => `${n} sur 5`,
        noRating: 'Pas de note',
        clear: 'retirer la note',
        scope: 'Votre avis porte sur',
        scopeSite: 'Le site entier',
        scopePage: 'Cette page',
        topicsLegend: 'Sur quoi ? (plusieurs choix possibles)',
        topics: {
            writing: 'La rédaction',
            outdated: 'Un contenu dépassé',
            mistake: 'Une erreur ou une incohérence',
            structure: 'La structure, la navigation',
            look: "L'apparence",
            subject: 'Le sujet lui-même',
        },
        message: 'Votre message',
        placeholder: 'Ce qui vous a plu, ce qui vous a gêné, ce qui manque.',
        preview: 'Ce qui sera envoyé',
        email: 'Envoyer par e-mail',
        emailHelp: (/** @type {string} */ a) => `Privé, sans compte : ouvre votre messagerie avec le message prêt, pour ${a}.`,
        github: 'Ouvrir un ticket GitHub',
        githubHelp: 'Public, avec un compte GitHub. Vous relisez le ticket avant de le publier.',
        copy: 'Copier le texte',
        copied: 'Copié',
        copyHelp: 'Pour le coller où vous voulez.',
        needs: 'Donnez au moins une note, un sujet ou un message pour pouvoir envoyer.',
        cut: 'Le message est trop long pour être transmis en entier par ce moyen : il sera coupé. « Copier le texte » le garde entier.',
        close: 'Fermer',
        textRating: 'Note',
        textAbout: 'Porte sur',
        textSite: 'le site entier',
        textPage: 'la page',
        textTopics: 'Sujets',
        textMessage: 'Message',
        colon: ' : ',
        subject: (/** @type {string} */ site) => `Avis sur ${site}`,
    },
    en: {
        cardTitle: 'Your opinion matters',
        cardText: 'A note, a remark on the content or the form, an outdated page: say it in a minute.',
        open: 'Give my opinion',
        intro: 'Everything is optional: one answer is enough. This site sends nothing: you send it, the way you choose.',
        rating: 'Your note',
        ratingOf: (/** @type {number} */ n) => `${n} out of 5`,
        noRating: 'No note',
        clear: 'remove the note',
        scope: 'Your opinion is about',
        scopeSite: 'The whole site',
        scopePage: 'This page',
        topicsLegend: 'About what? (several choices possible)',
        topics: {
            writing: 'The writing',
            outdated: 'Outdated content',
            mistake: 'A mistake or an inconsistency',
            structure: 'The structure, the navigation',
            look: 'The look',
            subject: 'The subject itself',
        },
        message: 'Your message',
        placeholder: 'What you liked, what got in your way, what is missing.',
        preview: 'What will be sent',
        email: 'Send by e-mail',
        emailHelp: (/** @type {string} */ a) => `Private, no account: opens your mail program with the message ready, for ${a}.`,
        github: 'Open a GitHub issue',
        githubHelp: 'Public, with a GitHub account. You read the issue again before you publish it.',
        copy: 'Copy the text',
        copied: 'Copied',
        copyHelp: 'To paste it wherever you want.',
        needs: 'Give at least a note, a subject or a message to be able to send.',
        cut: 'The message is too long to be sent whole this way: it will be cut. « Copy the text » keeps all of it.',
        close: 'Close',
        textRating: 'Rating',
        textAbout: 'About',
        textSite: 'the whole site',
        textPage: 'the page',
        textTopics: 'Subjects',
        textMessage: 'Message',
        colon: ': ',
        subject: (/** @type {string} */ site) => `Feedback on ${site}`,
    },
};

/** @typedef {typeof LABELS.fr} FeedbackLabels */

/**
 * Built-in labels for a page language (BCP 47 tag such as `fr` or `en-US`); other languages get English.
 * @param {string | undefined} lang
 * @returns {FeedbackLabels}
 */
export function feedbackLabels(lang) {
    return (lang ?? '').toLowerCase().split('-')[0] === 'fr' ? LABELS.fr : LABELS.en;
}

/**
 * Something to send: a note, a subject or a message (what the opinion is about says nothing alone).
 * @param {FeedbackAnswer} answer
 */
export function feedbackReady(answer) {
    return answer.rating > 0 || answer.topics.length > 0 || answer.message.trim() !== '';
}

/**
 * The opinion as a text: what the preview shows, what the mail and the issue hold, what is copied.
 * @param {FeedbackAnswer} answer
 * @param {FeedbackContext} context
 * @param {FeedbackLabels} labels
 * @param {string} [message] The message to use instead of the answer's (a shortened one).
 */
export function feedbackText(answer, context, labels, message = answer.message.trim()) {
    const about =
        answer.scope === 'page'
            ? `${labels.textPage} « ${context.pageTitle} » (${context.pageUrl})`
            : labels.textSite;
    const topics = FEEDBACK_TOPICS.filter((id) => answer.topics.includes(id)).map(
        (id) => labels.topics[/** @type {keyof FeedbackLabels['topics']} */ (id)],
    );
    const head = [
        answer.rating > 0 ? `${labels.textRating}${labels.colon}${STARS[answer.rating]}` : '',
        `${labels.textAbout}${labels.colon}${about}`,
        topics.length > 0 ? `${labels.textTopics}${labels.colon}${topics.join(', ')}` : '',
    ].filter(Boolean);
    const body = message ? `${labels.textMessage}${labels.colon.trimEnd()}\n${message}` : '';
    return [head.join('\n'), body].filter(Boolean).join('\n\n');
}

/**
 * Subject of the mail and title of the issue: « Avis sur Mon guide · 4/5 ».
 * @param {FeedbackAnswer} answer
 * @param {FeedbackContext} context
 * @param {FeedbackLabels} labels
 */
export function feedbackSubject(answer, context, labels) {
    return labels.subject(context.siteTitle) + (answer.rating > 0 ? ` · ${answer.rating}/5` : '');
}

/**
 * The address `build` gives with the whole message when it fits under `max`, else with the longest beginning of
 * the message that fits, followed by « […] » (found by halving; a character is never cut in two).
 * @param {string} message
 * @param {(message: string) => string} build
 * @param {number} max
 * @returns {{ url: string, cut: boolean }}
 */
export function fitMessage(message, build, max) {
    const whole = build(message);
    if (whole.length <= max || message === '') return { url: whole, cut: false };
    const chars = Array.from(message);
    const shortened = (/** @type {number} */ n) => build(`${chars.slice(0, n).join('').trimEnd()}\n\n[…]`);
    let low = 0;
    let high = chars.length - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (shortened(middle).length <= max) low = middle;
        else high = middle - 1;
    }
    return { url: shortened(low), cut: true };
}

/**
 * A new issue of the GitHub repository, its title and its body filled in.
 * @param {string} repository `owner/name`
 * @param {FeedbackAnswer} answer
 * @param {FeedbackContext} context
 * @param {FeedbackLabels} labels
 */
export function feedbackIssueUrl(repository, answer, context, labels) {
    const title = encodeURIComponent(feedbackSubject(answer, context, labels));
    return fitMessage(
        answer.message.trim(),
        (message) =>
            `https://github.com/${repository}/issues/new?title=${title}&body=${encodeURIComponent(
                feedbackText(answer, context, labels, message),
            )}`,
        FEEDBACK_MAX.issue,
    );
}

/**
 * A `mailto:` link to the address, its subject and its body filled in (RFC 6068: line breaks as CRLF).
 * @param {string} email
 * @param {FeedbackAnswer} answer
 * @param {FeedbackContext} context
 * @param {FeedbackLabels} labels
 */
export function feedbackMailUrl(email, answer, context, labels) {
    const encode = (/** @type {string} */ text) => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'));
    const subject = encode(feedbackSubject(answer, context, labels));
    return fitMessage(
        answer.message.trim(),
        (message) => `mailto:${email}?subject=${subject}&body=${encode(feedbackText(answer, context, labels, message))}`,
        FEEDBACK_MAX.mail,
    );
}
