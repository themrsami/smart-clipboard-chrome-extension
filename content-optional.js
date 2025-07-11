// Optional content script - only injected when specifically needed
// This script provides enhanced clipboard functionality when manually injected

let clipboardManagerActive = false;

// Initialize only when explicitly called
function initializeClipboardManager() {
    if (clipboardManagerActive) return;
    clipboardManagerActive = true;

    // Listen for copy events when active
    document.addEventListener('copy', handleCopyEvent);
    
    // Listen for keyboard shortcuts when active
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    console.log('Smart Clipboard Manager: Enhanced mode activated for this page');
    
    // Show activation notification
    showNotification('Smart Clipboard enhanced mode activated', 'success');
}

function handleCopyEvent(e) {
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText) {
        const pageInfo = {
            title: document.title,
            url: window.location.href
        };
        
        // Send to background script
        chrome.runtime.sendMessage({
            type: 'SAVE_SELECTION',
            content: selectedText,
            pageInfo: pageInfo
        });
    }
}

function handleKeyboardShortcut(e) {
    // Check for custom clipboard shortcut (Alt+C by default)
    if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            const pageInfo = {
                title: document.title,
                url: window.location.href
            };
            
            chrome.runtime.sendMessage({
                type: 'SAVE_SELECTION',
                content: selectedText,
                pageInfo: pageInfo
            });
            
            showNotification('Text saved to Smart Clipboard', 'success');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 300px;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ACTIVATE_ENHANCED_MODE') {
        initializeClipboardManager();
        sendResponse({ success: true });
    } else if (message.type === 'GET_SELECTION') {
        const selectedText = window.getSelection().toString().trim();
        sendResponse({ 
            text: selectedText,
            pageInfo: {
                title: document.title,
                url: window.location.href
            }
        });
    }
});

// Check if this script should auto-activate (only if user has enabled it)
chrome.storage.sync.get(['enhancedModeEnabled'], (result) => {
    if (result.enhancedModeEnabled) {
        initializeClipboardManager();
    }
});
