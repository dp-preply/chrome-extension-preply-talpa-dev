import { createExperimentTicket } from '@src/services/jira';
import { createExperimentChannel } from '@src/services/slack';

const triggerElementPicker = (tabId: number) => {
    const EXT_ID = chrome.runtime.id;
    chrome.scripting.executeScript({
        target: { tabId },
        args: [EXT_ID],
        func: (EXT_ID: string) => {
            window.__PREPLY_LOC__ = EXT_ID;
            (window as Window & { __PREPLY_EXPERIMENT__?: boolean }).__PREPLY_EXPERIMENT__ = false;
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
            JSON.stringify({ ...message, mode, pageUrl }),
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

async function handleGenerateExperiment(data: ExperimentData): Promise<ExperimentResult> {
    const jiraUrl = await createExperimentTicket(data);
    const slackChannel = await createExperimentChannel(data.experimentName, jiraUrl);
    return { jiraUrl, slackChannel };
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
                    const result = await handleGenerateExperiment(message.data);
                    sendResponse({ ok: true, result });
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
