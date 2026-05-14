import { createExperimentTicket } from '@src/services/jira';
import { createExperimentChannel } from '@src/services/slack';

const triggerElementPicker = (tabId: number) => {
    const EXT_ID = chrome.runtime.id;
    chrome.scripting.executeScript({
        target: { tabId },
        args: [EXT_ID],
        func: EXT_ID => {
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
    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [
            chrome.runtime.getURL('src/sidebar/index.html'),
            JSON.stringify({ ...message, mode, pageUrl }),
        ],
        func: (sidebarUrl: string, messageJson: string) => {
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
                iframe.contentWindow?.postMessage(
                    messageJson,
                    sidebarUrl,
                );
                const originalOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';

                const onMessage = (event: MessageEvent) => {
                    if (chrome.runtime.getURL('/').startsWith(event.origin)) {
                        window.removeEventListener('message', onMessage);
                        iframe.remove();
                        document.body.style.overflow = originalOverflow;

                        if (event.data === 'close') {
                            chrome.runtime.sendMessage('preply-talpa-close');
                        }
                    }
                };
                window.addEventListener('message', onMessage);
            });

            document.body.appendChild(iframe);
        },
    });
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'preply-talpa-create-experiment',
        title: 'Create Experiment',
        contexts: ['all'],
    });
});

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
            (async () => {
                try {
                    const jiraUrl = await createExperimentTicket(message.data);
                    const slackChannel = await createExperimentChannel(
                        message.data.experimentName,
                        jiraUrl,
                    );
                    sendResponse({ ok: true, result: { jiraUrl, slackChannel } });
                } catch (err) {
                    sendResponse({ ok: false, error: (err as Error).message });
                }
            })();
            return true;
        }
    },
);

chrome.contextMenus.onClicked.addListener((_info, tab) => {
    if (!tab?.id) return;
    const tabId = tab.id;

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [chrome.runtime.id],
        func: (extensionId: string) => {
            window.__PREPLY_LOC__ = extensionId;
            (window as Window & { __PREPLY_EXPERIMENT__?: boolean }).__PREPLY_EXPERIMENT__ = true;
        },
    });

    chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['src/scripts/content.js'],
    });
});

chrome.runtime.onMessageExternal.addListener(
    (
        message: (DetectedLoc & { _mode?: string }) | { type: string; data: ExperimentData },
        sender: chrome.runtime.MessageSender,
        sendResponse,
    ) => {
        if (
            typeof message === 'object' &&
            'type' in message &&
            message.type === 'generateExperiment'
        ) {
            (async () => {
                try {
                    const jiraUrl = await createExperimentTicket(message.data);
                    const slackChannel = await createExperimentChannel(
                        message.data.experimentName,
                        jiraUrl,
                    );
                    sendResponse({ ok: true, result: { jiraUrl, slackChannel } });
                } catch (err) {
                    sendResponse({ ok: false, error: (err as Error).message });
                }
            })();
            return true;
        }

        sendResponse();
        if (!sender?.tab?.id) return;

        const detectedLoc = message as DetectedLoc & { _mode?: string };
        const mode: 'identify' | 'experiment' =
            detectedLoc._mode === 'experiment' ? 'experiment' : 'identify';

        injectSidebar(sender.tab.id, detectedLoc, mode, sender.tab.url);
    },
);
