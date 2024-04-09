import { createRoot } from 'react-dom/client';
import Sidebar from './Sidebar';

function init(data: DetectedLoc) {
    const appContainer = document.querySelector('#app-container');
    if (!appContainer) {
        throw new Error('Can not find #app-container, yep');
    }
    const root = createRoot(appContainer);
    root.render(<Sidebar data={data} />);
}

window.addEventListener('message', function (message: MessageEvent) {
    init(JSON.parse(message.data) as DetectedLoc);
});
