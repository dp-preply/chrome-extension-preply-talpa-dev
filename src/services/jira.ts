// src/services/jira.ts

const JIRA_BASE = 'https://preply.atlassian.net/rest/api/3';

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
    const variantStringId = `${detectedLoc.id}_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;

    const description = [
        `## Experiment: ${experimentName}`,
        '',
        `**String ID:** ${detectedLoc.id}`,
        `**Variant string ID:** ${variantStringId}`,
        `**Variant copy:** ${variantCopy}`,
        `**Original copy:** ${detectedLoc.defaultMessage ?? detectedLoc.text}`,
        `**Current language:** ${detectedLoc.lang}`,
        `**Page URL:** ${pageUrl ?? 'unknown'}`,
        '',
        '## Implementation tasks',
        `- [ ] BE: Create waffle flag \`${experimentName}\` in Apollo`,
        `- [ ] FE: Wrap \`FormattedMessage id="${detectedLoc.id}"\` with flag condition, show variant copy (id="${variantStringId}") when flag is on`,
    ].join('\n');

    const body = {
        fields: {
            summary: `[Experiment] ${experimentName}`,
            issuetype: { name: 'Task' },
            labels: ['claude', 'repo:apollo'],
            description: {
                type: 'doc',
                version: 1,
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: description }],
                    },
                ],
            },
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
    return `https://preply.atlassian.net/browse/${json.key}`;
}
