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
async function openTab(url: string): Promise<number> {
    const tab = await chrome.tabs.create({ url, active: false });
    if (!tab.id) throw new Error(`Failed to open tab for ${url}`);
    await new Promise<void>((resolve) => {
        const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
            if (id === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
    return tab.id;
}

async function execInTab<T>(tabId: number, args: unknown[], func: (...args: never[]) => Promise<{ ok: true; value: T } | { ok: false; error: string }>): Promise<T> {
    // Kick off async work; store result in window.__TALPA_RESULT__ because
    // Chrome MV3 doesn't reliably return async executeScript values.
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: args as Record<string, unknown>[],
        func: func as (...args: never[]) => Promise<unknown>,
    });
    // Poll until the result is available (max 60s).
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const poll = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => (window as Window & { __TALPA_RESULT__?: unknown }).__TALPA_RESULT__,
        });
        if (poll[0]?.result !== undefined) {
            const outcome = poll[0].result as { ok: true; value: T } | { ok: false; error: string };
            if (!outcome.ok) throw new Error(outcome.error);
            return outcome.value;
        }
    }
    throw new Error('Timed out waiting for result');
}

async function handleGenerateExperimentInPage(
    _tabId: number,
    data: ExperimentData,
): Promise<ExperimentResult> {
    const { detectedLoc, variantCopy, experimentName, pageUrl } = data;

    // Step 1: Create Jira ticket from preply.atlassian.net tab.
    const jiraTabId = await openTab('https://preply.atlassian.net/jira');
    let jiraUrl: string;
    try {
        jiraUrl = await execInTab<string>(
            jiraTabId,
            [{ detectedLoc, variantCopy, experimentName, pageUrl }],
            async (d: { detectedLoc: { id: string | null; defaultMessage: string | null; text: string; lang: string }; variantCopy: string; experimentName: string; pageUrl?: string }) => {
                try {
                    const JIRA_HOST = 'https://preply.atlassian.net';
                    const JIRA_BASE = `${JIRA_HOST}/rest/api/3`;

                    const session = await fetch(`${JIRA_BASE}/myself`, { credentials: 'include' });
                    if (session.status === 401) return { ok: false as const, error: 'You need to be logged into Jira. Open preply.atlassian.net and try again.' };
                    if (!session.ok) return { ok: false as const, error: `Jira session check failed: ${session.status}` };

                    if (!d.detectedLoc.id) return { ok: false as const, error: 'Cannot create experiment: string ID is missing.' };
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
                    if (jiraRes.status === 401) return { ok: false as const, error: 'You need to be logged into Jira. Open preply.atlassian.net and try again.' };
                    if (!jiraRes.ok) return { ok: false as const, error: `Failed to create Jira ticket: ${await jiraRes.text()}` };

                    const { key } = (await jiraRes.json()) as { key: string };
                    const result = `${JIRA_HOST}/browse/${key}`;
                    (window as Window & { __TALPA_RESULT__?: unknown }).__TALPA_RESULT__ = { ok: true, value: result };
                    return { ok: true as const, value: result };
                } catch (err) {
                    const r = { ok: false as const, error: (err as Error).message ?? String(err) };
                    (window as Window & { __TALPA_RESULT__?: unknown }).__TALPA_RESULT__ = r;
                    return r;
                }
            },
        );
    } finally {
        chrome.tabs.remove(jiraTabId);
    }

    // Step 2: Create Slack channel from preply.slack.com tab.
    const channelName = `proj_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;
    const slackTabId = await openTab('https://preply.slack.com/messages');
    let slackChannel: string;
    try {
        slackChannel = await execInTab<string>(
            slackTabId,
            [{ channelName, experimentName, jiraUrl }],
            async (d: { channelName: string; experimentName: string; jiraUrl: string }) => {
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
                    const r = { ok: true as const, value: d.channelName };
                    (window as Window & { __TALPA_RESULT__?: unknown }).__TALPA_RESULT__ = r;
                    return r;
                } catch (err) {
                    const r = { ok: false as const, error: (err as Error).message ?? String(err) };
                    (window as Window & { __TALPA_RESULT__?: unknown }).__TALPA_RESULT__ = r;
                    return r;
                }
            },
        );
    } finally {
        chrome.tabs.remove(slackTabId);
    }

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
