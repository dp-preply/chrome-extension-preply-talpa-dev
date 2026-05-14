import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './Sidebar';

type SidebarMessage = DetectedLoc & { mode?: 'identify' | 'experiment'; pageUrl?: string; tabId?: number };

function init(message: SidebarMessage) {
    const { mode, pageUrl, tabId, ...data } = message;
    const appContainer = document.querySelector('#app-container');
    if (!appContainer) {
        throw new Error('Can not find #app-container, yep');
    }
    const root = createRoot(appContainer);
    root.render(
        <StrictMode>
            <Sidebar data={data} mode={mode ?? 'identify'} pageUrl={pageUrl} tabId={tabId} />
        </StrictMode>,
    );
}

window.addEventListener('message', function (event: MessageEvent) {
    if (typeof event.data !== 'string' || !event.data.startsWith('{')) return;
    try {
        init(JSON.parse(event.data) as SidebarMessage);
    } catch {
        // ignore non-JSON messages (e.g. framebus traffic)
    }
});
