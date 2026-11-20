// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFeedbackBlock } from '../config/feedback.mjs';
import {
    FEEDBACK_MAX,
    FEEDBACK_TOPICS,
    feedbackIssueUrl,
    feedbackLabels,
    feedbackMailUrl,
    feedbackReady,
    feedbackSubject,
    feedbackText,
    fitMessage,
} from '../src/lib/feedback.mjs';

const context = { siteTitle: 'Mon guide', pageTitle: 'Choisir un GPU', pageUrl: 'https://docs.example.com/gpu/' };
const fr = feedbackLabels('fr-FR');
const en = feedbackLabels('de');
/** @type {import('../src/lib/feedback.mjs').FeedbackAnswer} */
const empty = { rating: 0, scope: 'site', topics: [], message: '' };

test('parseFeedbackBlock renders nothing without a valid address or repository', () => {
    assert.equal(parseFeedbackBlock(undefined), null);
    assert.equal(parseFeedbackBlock('me@example.com'), null);
    assert.equal(parseFeedbackBlock({}), null);
    assert.equal(parseFeedbackBlock({ email: 'not an address', repository: 'no-slash' }), null);
    assert.equal(parseFeedbackBlock({ email: 'a@b.c"><script>', repository: 'a/b/c' }), null);
});

test('parseFeedbackBlock keeps what is valid and asks for a note and subjects by default', () => {
    assert.deepEqual(parseFeedbackBlock({ email: ' me@example.com ', repository: 'owner/my-guide' }), {
        email: 'me@example.com',
        repository: 'owner/my-guide',
        rating: true,
        topics: true,
    });
    assert.deepEqual(parseFeedbackBlock({ email: 'me@example.com', repository: 42, rating: false, topics: false }), {
        email: 'me@example.com',
        repository: '',
        rating: false,
        topics: false,
    });
    assert.equal(parseFeedbackBlock({ repository: 'owner/name' })?.email, '');
});

test('labels are French for a French page, English for any other language', () => {
    assert.equal(fr.open, 'Donner mon avis');
    assert.equal(en.open, 'Give my opinion');
    assert.equal(feedbackLabels(undefined).open, 'Give my opinion');
    assert.deepEqual(Object.keys(fr.topics), FEEDBACK_TOPICS);
    assert.deepEqual(Object.keys(en.topics), FEEDBACK_TOPICS);
});

test('an opinion can be sent once it holds a note, a subject or a message', () => {
    assert.equal(feedbackReady(empty), false);
    assert.equal(feedbackReady({ ...empty, scope: 'page' }), false);
    assert.equal(feedbackReady({ ...empty, message: '  \n ' }), false);
    assert.equal(feedbackReady({ ...empty, rating: 3 }), true);
    assert.equal(feedbackReady({ ...empty, topics: ['look'] }), true);
    assert.equal(feedbackReady({ ...empty, message: 'Bravo' }), true);
});

test('the text says the note, what it is about, the subjects in their order, then the message', () => {
    const answer = { rating: 4, scope: /** @type {const} */ ('page'), topics: ['look', 'outdated', 'unknown'], message: ' Les prix datent de mars. ' };
    assert.equal(
        feedbackText(answer, context, fr),
        'Note : ★★★★☆ 4/5\n' +
            'Porte sur : la page « Choisir un GPU » (https://docs.example.com/gpu/)\n' +
            "Sujets : Un contenu dépassé, L'apparence\n\n" +
            'Message :\nLes prix datent de mars.',
    );
    assert.equal(feedbackText({ ...empty, message: 'Thanks' }, context, en), 'About: the whole site\n\nMessage:\nThanks');
    assert.equal(feedbackText({ ...empty, rating: 5 }, context, en), 'Rating: ★★★★★ 5/5\nAbout: the whole site');
    assert.equal(feedbackSubject(answer, context, fr), 'Avis sur Mon guide · 4/5');
    assert.equal(feedbackSubject(empty, context, en), 'Feedback on Mon guide');
});

test('a mail and an issue are filled in, nothing else is added to their address', () => {
    const answer = { rating: 2, scope: /** @type {const} */ ('site'), topics: ['writing'], message: 'Ligne 1\nLigne 2 & fin' };
    const mail = feedbackMailUrl('me@example.com', answer, context, fr);
    assert.equal(mail.cut, false);
    const url = new URL(mail.url);
    assert.equal(url.protocol, 'mailto:');
    assert.equal(url.pathname, 'me@example.com');
    assert.deepEqual([...url.searchParams.keys()], ['subject', 'body']);
    assert.equal(url.searchParams.get('subject'), 'Avis sur Mon guide · 2/5');
    assert.equal(url.searchParams.get('body'), feedbackText(answer, context, fr).replace(/\n/g, '\r\n'));
    assert.ok(!mail.url.includes('+'), 'spaces are %20: a mail program would show a +');

    const issue = feedbackIssueUrl('owner/my-guide', answer, context, fr);
    const target = new URL(issue.url);
    assert.equal(target.origin + target.pathname, 'https://github.com/owner/my-guide/issues/new');
    assert.deepEqual([...target.searchParams.keys()], ['title', 'body']);
    assert.equal(target.searchParams.get('body'), feedbackText(answer, context, fr));
});

test('a message too long for an address is cut at a whole character, and said', () => {
    const long = { ...empty, message: '🙂 très long. '.repeat(600) };
    const mail = feedbackMailUrl('me@example.com', long, context, fr);
    assert.equal(mail.cut, true);
    assert.ok(mail.url.length <= FEEDBACK_MAX.mail && mail.url.length > FEEDBACK_MAX.mail - 60, 'as long as it can be');
    const body = new URL(mail.url).searchParams.get('body') ?? '';
    assert.ok(body.endsWith('[…]') && !body.includes('�'), 'ends with the mark, no broken character');
    const issue = feedbackIssueUrl('owner/name', long, context, fr);
    assert.ok(issue.cut && issue.url.length <= FEEDBACK_MAX.issue);
    assert.deepEqual(fitMessage('', (m) => `x${m}`, 0), { url: 'x', cut: false }, 'nothing to cut in an empty message');
    assert.deepEqual(fitMessage('abc', (m) => m, 10), { url: 'abc', cut: false });
});
