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
// executeScript funcs must be self-contained — no imports allowed.
async function handleGenerateExperimentInPage(
    tabId: number,
    data: ExperimentData,
): Promise<ExperimentResult> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [data as unknown as Record<string, unknown>],
        func: async (data: {
            detectedLoc: { id: string | null; defaultMessage: string | null; text: string; lang: string };
            variantCopy: string;
            experimentName: string;
            pageUrl?: string;
        }) => {

            const JIRA_HOST = 'https://preply.atlassian.net';
            const JIRA_BASE = `${JIRA_HOST}/rest/api/3`;
            const SLACK_BASE = 'https://slack.com/api';

            // --- Jira ---
            const jiraSession = await fetch(`${JIRA_BASE}/myself`, { credentials: 'include' });
            if (jiraSession.status === 401) {
                throw new Error('You need to be logged into Jira. Open jira.preply.com and try again.');
            }
            if (!jiraSession.ok) {
                throw new Error(`Jira session check failed: ${jiraSession.status}`);
            }

            const { detectedLoc, variantCopy, experimentName, pageUrl } = data;
            if (!detectedLoc.id) {
                throw new Error('Cannot create experiment ticket: string ID is missing.');
            }
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

            const jiraBody = {
                fields: {
                    project: { key: 'BOOK' },
                    summary: `[Experiment] ${experimentName}`,
                    issuetype: { name: 'Task' },
                    labels: ['claude', 'repo:apollo'],
                    description: adfDescription,
                },
            };

            const jiraRes = await fetch(`${JIRA_BASE}/issue`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jiraBody),
            });

            if (jiraRes.status === 401) {
                throw new Error('You need to be logged into Jira. Open jira.preply.com and try again.');
            }
            if (!jiraRes.ok) {
                const text = await jiraRes.text();
                throw new Error(`Failed to create Jira ticket: ${text}`);
            }

            const jiraJson = (await jiraRes.json()) as { key: string };
            const jiraUrl = `${JIRA_HOST}/browse/${jiraJson.key}`;

            // --- Slack ---
            const channelName = `proj_${experimentName.toLowerCase().replace(/\s+/g, '_')}`;

            const slackPost = async (method: string, payload: Record<string, unknown>) => {
                const res = await fetch(`${SLACK_BASE}/${method}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error(`Slack HTTP error: ${res.status}`);
                const json = (await res.json()) as { ok: boolean; error?: string; [key: string]: unknown };
                if (!json.ok) {
                    if (json.error === 'not_authed' || json.error === 'invalid_auth') {
                        throw new Error('You need to be logged into Slack. Open slack.com and try again.');
                    }
                    if (json.error === 'name_taken') {
                        throw new Error(`A Slack channel named ${channelName} already exists. Try a different experiment name.`);
                    }
                    throw new Error(`Slack API error (${method}): ${json.error}`);
                }
                return json;
            };

            const createJson = (await slackPost('conversations.create', {
                name: channelName,
                is_private: false,
            })) as { channel: { id: string } };

            await slackPost('chat.postMessage', {
                channel: createJson.channel.id,
                text: `Experiment *${experimentName}* created. Jira ticket: ${jiraUrl}`,
            });

            return { jiraUrl, slackChannel: channelName };
        },
    });

    const result = results[0];
    if (result.error) throw new Error(String(result.error));
    return result.result as ExperimentResult;
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
