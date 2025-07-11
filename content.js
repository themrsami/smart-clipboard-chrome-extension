// Function to display the reload message
function showReloadMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background-color: rgba(255, 255, 255, 0.9);
        color: #333;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        font-size: 16px;
        font-family: sans-serif;
    `;
    messageDiv.innerHTML = `
        <p>Smart Clipboard Extension:</p>
        <p>Please reload this tab for the extension to function correctly.</p>
    `;
    document.body.appendChild(messageDiv);

    // Remove the message after 5 seconds
    setTimeout(() => {
        if (document.body.contains(messageDiv)) {
            document.body.removeChild(messageDiv);
        }
    }, 5000);
}

// Function to check if the background script is ready
function isBackgroundReady(callback) {
    chrome.runtime.sendMessage({ type: 'PING' }, response => {
        if (response && response.status === 'READY') {
            callback(true);
        } else {
            callback(false);
        }
    });
}

// Listen for copy events
document.addEventListener('copy', function(e) {
    try {
        // Get the selected text
        const selectedText = window.getSelection().toString().trim();

        // Only proceed if there's actually text selected
        if (selectedText) {
            // Get the current page title and URL
            const pageInfo = {
                title: document.title,
                url: window.location.href
            };

            // Check if background is ready before sending message
            isBackgroundReady(ready => {
                if (ready) {
                    // Send message to background script
                    chrome.runtime.sendMessage({
                        type: 'newClip',
                        content: selectedText,
                        pageInfo: pageInfo
                    }, function(response) {
                        // Handle response if needed
                    });
                } else {
                    console.warn("Background script not ready, showing reload message.");
                    showReloadMessage();
                }
            });
        }
    } catch (error) {
        console.error("Content script error:", error);
        showReloadMessage();
    }
});

// Listen for paste events to confirm storage
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'clipSaved') {
        console.log('Clip saved successfully:', message.content);
    }
});

// Listen for keyboard events
document.addEventListener('keydown', function(e) {
    console.log('Key pressed:', e.key);

    // Check if chrome and chrome.storage are available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        try {
            // Access chrome.storage.sync safely
            chrome.storage.sync.get(['copyShortcut'], function(data) {
                console.log('Stored shortcut:', data.copyShortcut);

                if (data.copyShortcut) {
                    const keys = data.copyShortcut.split('+').map(k => k.trim());
                    console.log('Parsed shortcut keys:', keys);

                    const pressedKeys = [];

                    // Build array of currently pressed keys
                    if (e.ctrlKey) pressedKeys.push('Control');
                    if (e.altKey) pressedKeys.push('Alt');
                    if (e.shiftKey) pressedKeys.push('Shift');
                    if (!['Control', 'Alt', 'Shift'].includes(e.key)) {
                        pressedKeys.push(e.key === ' ' ? 'Space' : e.key);
                    }

                    console.log('Currently pressed keys:', pressedKeys);

                    // Check if pressed keys match the shortcut
                    const match = keys.length === pressedKeys.length &&
                        keys.every(key => pressedKeys.includes(key));

                    console.log('Keys match?', match);

                    if (match) {
                        e.preventDefault();
                        const selectedText = window.getSelection().toString();
                        console.log('Selected text:', selectedText);

                        if (selectedText) {
                            // Get the source information
                            const source = {
                                title: document.title,
                                url: window.location.href
                            };

                            // Save to clipboard storage
                            chrome.runtime.sendMessage({
                                type: 'newClip',
                                content: selectedText,
                                pageInfo: source
                            }, (response) => {
                                console.log('Clip added response:', response);
                                if (response && response.success) {
                                    // Copy to system clipboard as well
                                    navigator.clipboard.writeText(selectedText)
                                        .catch(err => console.error('Failed to copy:', err));
                                }
                            });
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Error accessing chrome.storage.sync:", error);
            showReloadMessage();
        }
    } else {
        console.warn("chrome.storage.sync is not available.");
        showReloadMessage();
    }
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSelectedText') {
        const selectedText = window.getSelection().toString();
        if (selectedText) {
            const source = {
                title: document.title,
                url: window.location.href
            };
            sendResponse({ text: selectedText, source: source });
        }
    }
    return true; // Required for async sendResponse
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'REMOVE_FLOATING_CLIP') {
        const clipElement = document.querySelector(`.floating-clip-card[data-id="${request.clipId}"]`);
        if (clipElement) {
            // Instead of directly removing, send a message to background to delete
            chrome.runtime.sendMessage({
                type: 'DELETE_CLIP',
                clipId: request.clipId
            });
        }
    }
});

// Initialize floating clips container
let container = document.querySelector('.floating-clips-container');
if (!container) {
    container = document.createElement('div');
    container.className = 'floating-clips-container';
    document.body.appendChild(container);
}

// Listen for messages to update floating clips
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'UPDATE_FLOATING_CLIPS') {
        updateFloatingClips(request.clips);
    }
});
