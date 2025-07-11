// Initialize on installation
chrome.runtime.onInstalled.addListener((details) => {
    // Initialize storage if needed
    chrome.storage.local.get(['clips'], (result) => {
        if (!result.clips) {
            chrome.storage.local.set({ clips: [] });
        }
    });

    // Set default copy shortcut if not set
    chrome.storage.sync.get(['copyShortcut'], (data) => {
        if (!data.copyShortcut) {
            chrome.storage.sync.set({ copyShortcut: 'Alt+C' });
        }
    });

    chrome.contextMenus.create({
        id: 'copyToSmartClipboard',
        title: 'Copy to Smart Clipboard',
        contexts: ['selection']
    });
});

// Handle extension reload/update
chrome.runtime.onStartup.addListener(() => {
    // Restore data from local storage
    chrome.storage.local.get(['clips'], (result) => {
        if (!result.clips) {
            chrome.storage.local.set({ clips: [] });
        }
    });
});

// Keep service worker active
chrome.runtime.onConnect.addListener(function(port) {
    port.onDisconnect.addListener(function() {
        // Reconnect if disconnected
        chrome.runtime.connect({ name: 'keepAlive' });
    });
});

// Keep the service worker alive
setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
}, 20000);

// Listen for messages from popup and other components
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PING') {
        sendResponse({ status: 'READY' });
        return;
    }
    
    if (request.type === 'GET_SELECTION') {
        // Handle selection requests from popup
        handleClipboardCopy();
        sendResponse({ success: true });
        return;
    }
    
    if (request.type === 'COPY_TO_CLIPBOARD') {
        handleClipboardCopy();
        sendResponse({ success: true });
        return;
    }
    
    if (request.type === 'SAVE_SELECTION') {
        // Handle selection from optional content script
        saveSelectionFromContentScript(request, sendResponse);
        return true; // Will respond asynchronously
    }
    
    if (request.type === 'ACTIVATE_ENHANCED_MODE') {
        // Inject optional content script for enhanced features
        activateEnhancedMode(sender.tab.id, sendResponse);
        return true; // Will respond asynchronously
    }
    
    return false; // For any other message types
});

// Save selection from content script
function saveSelectionFromContentScript(request, sendResponse) {
    const clip = {
        id: Date.now().toString(),
        content: request.content,
        timestamp: Date.now(),
        source: {
            title: request.pageInfo.title,
            url: request.pageInfo.url
        }
    };

    chrome.storage.local.get(['clips'], (data) => {
        const clips = data.clips || [];
        
        // Check for duplicates
        const isDuplicate = clips.some(c => c.content === clip.content);
        if (!isDuplicate) {
            clips.unshift(clip);
            if (clips.length > 50) clips.pop();
            chrome.storage.local.set({ clips }, () => {
                sendResponse({ success: true, message: 'Text saved to clipboard manager' });
            });
        } else {
            sendResponse({ success: true, message: 'Text already in clipboard' });
        }
    });
}

// Activate enhanced mode by injecting optional content script
async function activateEnhancedMode(tabId, sendResponse) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content-optional.js']
        });
        
        sendResponse({ success: true, message: 'Enhanced mode activated' });
    } catch (error) {
        console.error('Failed to activate enhanced mode:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'copy-to-clipboard') {
        handleClipboardCopy();
    }
});

// Handle clipboard copy with modern approach
async function handleClipboardCopy() {
    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.error('No active tab found');
            return;
        }

        // Only inject script when needed, not permanently
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                const selection = window.getSelection().toString();
                return {
                    text: selection || '',
                    title: document.title,
                    url: window.location.href
                };
            }
        });

        const result = results[0].result;
        
        // If there's selected text, save it
        if (result.text) {
            const clip = {
                id: Date.now().toString(),
                content: result.text,
                timestamp: Date.now(),
                source: {
                    title: result.title || 'Unknown',
                    url: result.url
                }
            };

            // Save to storage
            chrome.storage.local.get(['clips'], (data) => {
                const clips = data.clips || [];
                
                // Check for duplicates
                const isDuplicate = clips.some(c => c.content === clip.content);
                if (!isDuplicate) {
                    clips.unshift(clip);
                    if (clips.length > 50) clips.pop();
                    chrome.storage.local.set({ clips });
                    
                    // Show success notification
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon48.png',
                        title: 'Smart Clipboard',
                        message: 'Text saved to clipboard manager',
                        priority: 1,
                        silent: true
                    });
                }
            });
        }
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
    }
}

// Handle context menu clicks with injection
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'copyToSmartClipboard' && info.selectionText) {
        const clip = {
            id: Date.now().toString(),
            content: info.selectionText,
            timestamp: Date.now(),
            source: {
                title: tab.title || 'Unknown',
                url: tab.url
            }
        };

        chrome.storage.local.get(['clips'], (result) => {
            const clips = result.clips || [];
            
            // Check for duplicates
            const isDuplicate = clips.some(c => c.content === clip.content);
            if (!isDuplicate) {
                clips.unshift(clip);
                if (clips.length > 50) clips.pop();
                chrome.storage.local.set({ clips });
                
                // Show success notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Smart Clipboard',
                    message: 'Text saved via context menu',
                    priority: 1,
                    silent: true
                });
            }
        });
    }
});

// Handle extension icon click - show current clips count
chrome.action.onClicked.addListener((tab) => {
    chrome.storage.local.get(['clips'], (result) => {
        const clipCount = (result.clips || []).length;
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Smart Clipboard Manager',
            message: `You have ${clipCount} saved clips. Click the extension popup to manage them.`,
            priority: 1,
            silent: true
        });
    });
});

// Error handling for storage operations
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let key in changes) {
        console.log(`Storage key "${key}" in namespace "${namespace}" changed:`, changes[key]);
    }
});
