// src/services/jira.ts

const JIRA_HOST = 'https://preply.atlassian.net';
const JIRA_BASE = `${JIRA_HOST}/rest/api/3`;

export class JiraAuthError extends Error {
    constructor() {
        super('You need to be logged into Jira. Open jira.preply.com and try again.');
        this.name = 'JiraAuthError';
    }
}

async function checkSession(): Promise<void> {
    const res = await fetch(`${JIRA_BASE}/myself`, {
        credentials: 'include',
    });
    if (res.status === 401) throw new JiraAuthError();
    if (!res.ok) throw new Error(`Jira session check failed: ${res.status}`);
}

export async function createExperimentTicket(data: ExperimentData): Promise<string> {
    await checkSession();

    const { detectedLoc, variantCopy, experimentName, pageUrl } = data;
    if (!detectedLoc.id) throw new Error('Cannot create experiment ticket: string ID is missing.');
    const variantStringId = `${detectedLoc.id}_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;

    const adfDescription = {
        type: 'doc',
        version: 1,
        content: [
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: `Experiment: ${experimentName}` }],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'String ID: ', marks: [{ type: 'strong' }] },
                    { type: 'text', text: detectedLoc.id },
                ],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Variant string ID: ', marks: [{ type: 'strong' }] },
                    { type: 'text', text: variantStringId },
                ],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Variant copy: ', marks: [{ type: 'strong' }] },
                    { type: 'text', text: variantCopy },
                ],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Original copy: ', marks: [{ type: 'strong' }] },
                    { type: 'text', text: detectedLoc.defaultMessage ?? detectedLoc.text },
                ],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Current language: ', marks: [{ type: 'strong' }] },
                    { type: 'text', text: detectedLoc.lang },
                ],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Page URL: ', marks: [{ type: 'strong' }] },
                    { type: 'text', text: pageUrl ?? 'unknown' },
                ],
            },
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Implementation tasks' }],
            },
            {
                type: 'taskList',
                attrs: { localId: 'task-list-1' },
                content: [
                    {
                        type: 'taskItem',
                        attrs: { localId: 'task-1', state: 'TODO' },
                        content: [{ type: 'text', text: `BE: Create waffle flag "${experimentName}" in Apollo` }],
                    },
                    {
                        type: 'taskItem',
                        attrs: { localId: 'task-2', state: 'TODO' },
                        content: [{ type: 'text', text: `FE: Wrap FormattedMessage id="${detectedLoc.id}" with flag condition, show variant copy (id="${variantStringId}") when flag is on` }],
                    },
                ],
            },
        ],
    };

    const body = {
        fields: {
            project: { key: 'BOOK' },
            summary: `[Experiment] ${experimentName}`,
            issuetype: { name: 'Task' },
            labels: ['claude', 'repo:apollo'],
            description: adfDescription,
        },
    };

    const res = await fetch(`${JIRA_BASE}/issue`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (res.status === 401) throw new JiraAuthError();
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create Jira ticket: ${text}`);
    }

    const json = (await res.json()) as { key: string };
    return `${JIRA_HOST}/browse/${json.key}`;
}
