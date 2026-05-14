import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Sidebar from './Sidebar';

type SidebarMessage = DetectedLoc & { mode?: 'identify' | 'experiment'; pageUrl?: string };

function init(message: SidebarMessage) {
    const { mode, pageUrl, ...data } = message;
    const appContainer = document.querySelector('#app-container');
    if (!appContainer) {
        throw new Error('Can not find #app-container, yep');
    }
    const root = createRoot(appContainer);
    root.render(
        <StrictMode>
            <Sidebar data={data} mode={mode ?? 'identify'} pageUrl={pageUrl} />
        </StrictMode>,
    );
}

window.addEventListener('message', function (event: MessageEvent) {
    init(JSON.parse(event.data as string) as SidebarMessage);
});
