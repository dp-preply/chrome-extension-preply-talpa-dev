const triggerElementPicker = (tabId: number) => {
    const EXT_ID = chrome.runtime.id;
    chrome.scripting.executeScript({
        target: { tabId },
        args: [EXT_ID],
        func: (EXT_ID: string) => {
            window.__PREPLY_LOC__ = EXT_ID;
        },
        // we need access to global scope
        world: 'MAIN',
    });

    chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/scripts/content.js'],
        // we need access to global scope
        world: 'MAIN',
    });
};

function injectSidebar(
    tabId: number,
    message: DetectedLoc,
    mode: 'identify' | 'experiment',
    pageUrl: string | undefined,
) {
    const sidebarUrl = chrome.runtime.getURL('src/sidebar/index.html');
    const extensionOrigin = new URL(sidebarUrl).origin;

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [
            sidebarUrl,
            extensionOrigin,
            JSON.stringify({ ...message, mode, pageUrl, tabId }),
        ],
        func: (sidebarUrl: string, extensionOrigin: string, messageJson: string) => {
            const oldIframe = document.getElementById('preply-loc-iframe-sidebar');
            if (oldIframe) {
                oldIframe.remove();
                return;
            }

            const iframe = document.createElement('iframe');
            iframe.setAttribute('id', 'preply-loc-iframe-sidebar');
            iframe.setAttribute(
                'style',
                'top: 0; right: 0; width: 100%; height: 100%; z-index: 2147483650; border: none; position:fixed;',
            );
            iframe.setAttribute('allow', 'clipboard-write');
            iframe.src = sidebarUrl;

            iframe.addEventListener('load', () => {
                iframe.contentWindow?.postMessage(messageJson, sidebarUrl);
                const originalOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';

                const onMessage = (event: MessageEvent) => {
                    if (event.origin === extensionOrigin) {
                        window.removeEventListener('message', onMessage);
                        iframe.remove();
                        document.body.style.overflow = originalOverflow;

                        if (event.data === 'close') {
                            chrome.runtime.sendMessage(
                                window.__PREPLY_LOC__,
                                'preply-talpa-close',
                            );
                        }
                    }
                };
                window.addEventListener('message', onMessage);
            });

            document.body.appendChild(iframe);
        },
    });
}

// Runs all Jira + Slack fetches from the page's MAIN world to avoid CORS restrictions.
type ScriptResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function getOrOpenTab(origin: string): Promise<{ tabId: number; opened: boolean }> {
    const existing = await chrome.tabs.query({ url: `${origin}/*` });
    if (existing.length > 0 && existing[0].id) {
        return { tabId: existing[0].id, opened: false };
    }
    const tab = await chrome.tabs.create({ url: origin, active: false });
    if (!tab.id) throw new Error(`Failed to open tab for ${origin}`);
    await new Promise<void>((resolve) => {
        const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
            if (id === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
    return { tabId: tab.id, opened: true };
}

async function runInTab<T>(origin: string, args: unknown[], func: (...args: never[]) => Promise<ScriptResult<T>>): Promise<T> {
    const { tabId, opened } = await getOrOpenTab(origin);
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            args: args as Record<string, unknown>[],
            func: func as (...args: never[]) => Promise<ScriptResult<T>>,
        });
        const result = results[0];
        if (result.error) throw new Error(`executeScript failed: ${JSON.stringify(result.error)}`);
        const outcome = result.result as ScriptResult<T>;
        if (!outcome.ok) throw new Error(outcome.error);
        return outcome.value;
    } finally {
        if (opened) chrome.tabs.remove(tabId);
    }
}

async function handleGenerateExperimentInPage(
    _tabId: number,
    data: ExperimentData,
): Promise<ExperimentResult> {
    const { detectedLoc, variantCopy, experimentName, pageUrl } = data;

    // Step 1: Create Jira ticket from preply.atlassian.net tab.
    const jiraUrl = await runInTab<string>(
        'https://preply.atlassian.net',
        [{ detectedLoc, variantCopy, experimentName, pageUrl }],
        async (d: { detectedLoc: { id: string | null; defaultMessage: string | null; text: string; lang: string }; variantCopy: string; experimentName: string; pageUrl?: string }): Promise<ScriptResult<string>> => {
            try {
                const JIRA_HOST = 'https://preply.atlassian.net';
                const JIRA_BASE = `${JIRA_HOST}/rest/api/3`;

                const session = await fetch(`${JIRA_BASE}/myself`, { credentials: 'include' });
                if (session.status === 401) return { ok: false, error: 'You need to be logged into Jira. Open preply.atlassian.net and try again.' };
                if (!session.ok) return { ok: false, error: `Jira session check failed: ${session.status}` };

                if (!d.detectedLoc.id) return { ok: false, error: 'Cannot create experiment: string ID is missing.' };
                const variantStringId = `${d.detectedLoc.id}_${d.experimentName.toLowerCase().replace(/\s+/g, '_')}`;

                const adfDescription = {
                    type: 'doc', version: 1,
                    content: [
                        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Experiment: ${d.experimentName}` }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'String ID: ', marks: [{ type: 'strong' }] }, { type: 'text', text: d.detectedLoc.id }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'Variant string ID: ', marks: [{ type: 'strong' }] }, { type: 'text', text: variantStringId }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'Variant copy: ', marks: [{ type: 'strong' }] }, { type: 'text', text: d.variantCopy }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'Original copy: ', marks: [{ type: 'strong' }] }, { type: 'text', text: d.detectedLoc.defaultMessage ?? d.detectedLoc.text }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'Current language: ', marks: [{ type: 'strong' }] }, { type: 'text', text: d.detectedLoc.lang }] },
                        { type: 'paragraph', content: [{ type: 'text', text: 'Page URL: ', marks: [{ type: 'strong' }] }, { type: 'text', text: d.pageUrl ?? 'unknown' }] },
                        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Implementation tasks' }] },
                        { type: 'taskList', attrs: { localId: 'task-list-1' }, content: [
                            { type: 'taskItem', attrs: { localId: 'task-1', state: 'TODO' }, content: [{ type: 'text', text: `BE: Create waffle flag "${d.experimentName}" in Apollo` }] },
                            { type: 'taskItem', attrs: { localId: 'task-2', state: 'TODO' }, content: [{ type: 'text', text: `FE: Wrap FormattedMessage id="${d.detectedLoc.id}" with flag condition, show variant copy (id="${variantStringId}") when flag is on` }] },
                        ]},
                    ],
                };

                const jiraRes = await fetch(`${JIRA_BASE}/issue`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: { project: { key: 'BOOK' }, summary: `[Experiment] ${d.experimentName}`, issuetype: { name: 'd-task' }, labels: ['claude', 'repo:apollo'], description: adfDescription } }),
                });
                if (jiraRes.status === 401) return { ok: false, error: 'You need to be logged into Jira. Open preply.atlassian.net and try again.' };
                if (!jiraRes.ok) return { ok: false, error: `Failed to create Jira ticket: ${await jiraRes.text()}` };

                const { key } = (await jiraRes.json()) as { key: string };
                return { ok: true, value: `${JIRA_HOST}/browse/${key}` };
            } catch (err) {
                return { ok: false, error: (err as Error).message ?? String(err) };
            }
        },
    );

    // Step 2: Create Slack channel from app.slack.com tab.
    const channelName = `proj_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;
    const slackChannel = await runInTab<string>(
        'https://app.slack.com',
        [{ channelName, experimentName, jiraUrl }],
        async (d: { channelName: string; experimentName: string; jiraUrl: string }): Promise<ScriptResult<string>> => {
            try {
                const SLACK_BASE = 'https://slack.com/api';
                const post = async (method: string, payload: Record<string, unknown>) => {
                    const res = await fetch(`${SLACK_BASE}/${method}`, {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json; charset=utf-8' },
                        body: JSON.stringify(payload),
                    });
                    if (!res.ok) throw new Error(`Slack HTTP error: ${res.status}`);
                    const json = (await res.json()) as { ok: boolean; error?: string; [key: string]: unknown };
                    if (!json.ok) {
                        if (json.error === 'not_authed' || json.error === 'invalid_auth') throw new Error('You need to be logged into Slack. Open slack.com and try again.');
                        if (json.error === 'name_taken') throw new Error(`Slack channel "${d.channelName}" already exists. Try a different experiment name.`);
                        throw new Error(`Slack API error (${method}): ${json.error}`);
                    }
                    return json;
                };
                const created = (await post('conversations.create', { name: d.channelName, is_private: false })) as { channel: { id: string } };
                await post('chat.postMessage', { channel: created.channel.id, text: `Experiment *${d.experimentName}* created. Jira ticket: ${d.jiraUrl}` });
                return { ok: true, value: d.channelName };
            } catch (err) {
                return { ok: false, error: (err as Error).message ?? String(err) };
            }
        },
    );

    return { jiraUrl, slackChannel };
}

chrome.action.onClicked.addListener(tab => {
    if (!tab.id) {
        return;
    }
    triggerElementPicker(tab.id);
});

chrome.runtime.onMessage.addListener(
    (
        message: string | { type: string; data: ExperimentData },
        sender: chrome.runtime.MessageSender,
        sendResponse,
    ) => {
        if (typeof message === 'string') {
            sendResponse();
            if (sender.tab?.id && message === 'preply-talpa-close') {
                triggerElementPicker(sender.tab.id);
            }
            return;
        }
        if (message.type === 'generateExperiment') {
            const tabId = message.data.tabId;
            if (!tabId) {
                sendResponse({ ok: false, error: 'No tab ID available' });
                return true;
            }
            (async () => {
                try {
                    const result = await handleGenerateExperimentInPage(tabId, message.data);
                    sendResponse({ ok: true, result });
                } catch (err) {
                    sendResponse({ ok: false, error: (err as Error).message });
                }
            })();
            return true;
        }
    },
);

chrome.runtime.onMessageExternal.addListener(
    (
        message: DetectedLoc & { _mode?: string },
        sender: chrome.runtime.MessageSender,
        sendResponse,
    ) => {
        sendResponse();
        if (!sender?.tab?.id) return;

        const { _mode, ...detectedLoc } = message as DetectedLoc & { _mode?: string };
        const mode: 'identify' | 'experiment' = _mode === 'experiment' ? 'experiment' : 'identify';

        injectSidebar(sender.tab.id, detectedLoc, mode, sender.tab.url);
    },
);
