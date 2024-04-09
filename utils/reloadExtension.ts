// The content of this file will be infected into src/background.ts in DEV mode
function fetchUpdates() {
    const socket = new WebSocket('ws://localhost:3591/bundle-updates');

    socket.addEventListener('message', () => {
        chrome.runtime.reload();
    });

    socket.addEventListener('close', () => {
        setTimeout(() => {
            fetchUpdates();
        }, 1000);
    });

    socket.addEventListener('error', () => {
        socket.close();
    });
}
fetchUpdates();
