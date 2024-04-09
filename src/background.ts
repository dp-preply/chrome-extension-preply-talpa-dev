chrome.action.onClicked.addListener(tab => {
    if (!tab.id) {
        return;
    }
    const EXT_ID = chrome.runtime.id;
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [EXT_ID],
        func: EXT_ID => {
            window.__PREPLY_LOC__ = EXT_ID;
        },
        // we need access to global scope
        world: 'MAIN',
    });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/scripts/content.js'],
        // we need access to global scope
        world: 'MAIN',
    });
});

chrome.runtime.onMessageExternal.addListener(
    (message: DetectedLoc, sender: chrome.runtime.MessageSender, sendResponse) => {
        sendResponse();
        if (!sender?.tab?.id) {
            return;
        }
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            args: [message],
            func: message => {
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
                iframe.src = chrome.runtime.getURL('src/sidebar/index.html');

                iframe.addEventListener('load', () => {
                    iframe.contentWindow?.postMessage(
                        JSON.stringify(message),
                        chrome.runtime.getURL('src/sidebar/index.html'),
                    );
                    const originalOverflow = document.body.style.overflow;
                    document.body.style.overflow = 'hidden';

                    window.addEventListener('message', event => {
                        // Sidebar is closed
                        if (chrome.runtime.getURL('/').startsWith(event.origin)) {
                            iframe.remove();
                            document.body.style.overflow = originalOverflow;
                        }
                    });
                });

                document.body.appendChild(iframe);
            },
        });
    },
);
