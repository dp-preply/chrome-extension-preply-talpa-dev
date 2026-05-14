// src/services/slack.ts

const SLACK_BASE = 'https://slack.com/api';

export class SlackAuthError extends Error {
    constructor() {
        super('You need to be logged into Slack. Open slack.com and try again.');
        this.name = 'SlackAuthError';
    }
}

async function slackPost(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${SLACK_BASE}/${method}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Slack HTTP error: ${res.status}`);
    const json = (await res.json()) as { ok: boolean; error?: string; [key: string]: unknown };
    if (!json.ok) {
        if (json.error === 'not_authed' || json.error === 'invalid_auth') throw new SlackAuthError();
        if (json.error === 'name_taken') throw new Error('SLACK_NAME_TAKEN');
        throw new Error(`Slack API error (${method}): ${json.error}`);
    }
    return json;
}

export async function createExperimentChannel(
    experimentName: string,
    jiraUrl: string,
): Promise<string> {
    const channelName = `proj_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;

    // Create channel
    let channelId: string;
    try {
        const createJson = (await slackPost('conversations.create', {
            name: channelName,
            is_private: false,
        })) as { channel: { id: string } };
        channelId = createJson.channel.id;
    } catch (err) {
        if ((err as Error).message === 'SLACK_NAME_TAKEN') {
            throw new Error(`A Slack channel named ${channelName} already exists. Try a different experiment name.`);
        }
        throw err;
    }

    // Post Jira ticket link
    await slackPost('chat.postMessage', {
        channel: channelId,
        text: `Experiment *${experimentName}* created. Jira ticket: ${jiraUrl}`,
    });

    return channelName;
}
