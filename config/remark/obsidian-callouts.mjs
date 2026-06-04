// @ts-check

const CALLOUT_RE = /^\[!([A-Za-z][\w-]*)\][+-]?\s*(.*)$/;

const TYPE_MAP = new Map([
    ['abstract', 'note'],
    ['attention', 'caution'],
    ['bug', 'danger'],
    ['caution', 'caution'],
    ['check', 'tip'],
    ['danger', 'danger'],
    ['done', 'tip'],
    ['error', 'danger'],
    ['example', 'note'],
    ['failure', 'danger'],
    ['fail', 'danger'],
    ['faq', 'note'],
    ['help', 'note'],
    ['hint', 'tip'],
    ['important', 'tip'],
    ['info', 'note'],
    ['missing', 'danger'],
    ['note', 'note'],
    ['question', 'note'],
    ['quote', 'note'],
    ['success', 'tip'],
    ['summary', 'note'],
    ['tip', 'tip'],
    ['todo', 'note'],
    ['tldr', 'note'],
    ['warning', 'caution'],
    ['warn', 'caution'],
]);

const DEFAULT_TITLES = {
    note: 'Note',
    tip: 'Astuce',
    caution: 'Attention',
    danger: 'Danger',
};

/**
 * @param {string} type
 * @returns {'note' | 'tip' | 'caution' | 'danger'}
 */
export function mapObsidianCalloutType(type) {
    const normalized = type.trim().toLowerCase();
    return /** @type {'note' | 'tip' | 'caution' | 'danger'} */ (TYPE_MAP.get(normalized) ?? 'note');
}

/**
 * @param {any} paragraph
 * @returns {{ type: string, title: string } | null}
 */
function parseCalloutMarker(paragraph) {
    if (paragraph?.type !== 'paragraph' || !Array.isArray(paragraph.children)) return null;

    const firstText = paragraph.children.find((child) => child?.type === 'text');
    if (!firstText || typeof firstText.value !== 'string') return null;

    const [firstLine, ...restLines] = firstText.value.split(/\r?\n/);
    const match = firstLine.match(CALLOUT_RE);
    if (!match) return null;

    firstText.value = restLines.join('\n');
    return {
        type: mapObsidianCalloutType(match[1]),
        title: match[2].trim(),
    };
}

/**
 * @param {any} paragraph
 * @returns {boolean}
 */
function isEmptyParagraph(paragraph) {
    return (
        paragraph?.type === 'paragraph' &&
        Array.isArray(paragraph.children) &&
        paragraph.children.every((child) => child?.type === 'text' && child.value.trim() === '')
    );
}

/**
 * @param {any[]} children
 * @returns {any[]}
 */
function stripMarkerParagraph(children) {
    if (!children.length) return children;
    const [first, ...rest] = children;
    if (isEmptyParagraph(first)) return rest;

    if (first?.type === 'paragraph' && Array.isArray(first.children)) {
        first.children = first.children.filter(
            (child) => !(child?.type === 'text' && child.value === ''),
        );
    }

    return children;
}

/**
 * @param {any} node
 * @returns {any}
 */
function transformNode(node) {
    if (!node || typeof node !== 'object') return node;

    if (Array.isArray(node.children)) {
        node.children = node.children.map(transformNode);
    }

    if (node.type !== 'blockquote' || !Array.isArray(node.children) || node.children.length === 0) {
        return node;
    }

    const marker = parseCalloutMarker(node.children[0]);
    if (!marker) return node;

    const title = marker.title || DEFAULT_TITLES[marker.type];
    const contentChildren = stripMarkerParagraph(node.children);

    return {
        type: 'obsidianCallout',
        data: {
            hName: 'aside',
            hProperties: {
                ariaLabel: title,
                className: ['starlight-aside', `starlight-aside--${marker.type}`],
            },
        },
        children: [
            {
                type: 'paragraph',
                data: {
                    hName: 'p',
                    hProperties: {
                        ariaHidden: 'true',
                        className: ['starlight-aside__title'],
                    },
                },
                children: [{ type: 'text', value: title }],
            },
            {
                type: 'obsidianCalloutContent',
                data: {
                    hName: 'div',
                    hProperties: { className: ['starlight-aside__content'] },
                },
                children: contentChildren,
            },
        ],
    };
}

/**
 * @param {any} tree
 * @returns {any}
 */
export function transformObsidianCallouts(tree) {
    return transformNode(tree);
}

export function remarkObsidianCallouts() {
    return transformObsidianCallouts;
}
