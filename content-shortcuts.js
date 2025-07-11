// Minimal content script for keyboard shortcuts only
// This script only handles keyboard events and doesn't access page content automatically

// Check if extension should be active - removed since we handle this per-action now
// Listen for storage changes - removed since we check settings dynamically

// Listen for keyboard shortcuts only
document.addEventListener('keydown', function(e) {
    // Handle custom shortcuts from storage (these always work regardless of auto-save setting)
    chrome.storage.sync.get(['copyShortcut'], function(data) {
        if (data.copyShortcut) {
            const keys = data.copyShortcut.split('+').map(k => k.trim());
            const pressedKeys = [];

            // Build array of currently pressed keys
            if (e.ctrlKey) pressedKeys.push('Ctrl', 'Control');
            if (e.altKey) pressedKeys.push('Alt');
            if (e.shiftKey) pressedKeys.push('Shift');
            if (!['Control', 'Alt', 'Shift'].includes(e.key)) {
                pressedKeys.push(e.key === ' ' ? 'Space' : e.key);
            }

            // Check if pressed keys match the shortcut
            const match = keys.length === pressedKeys.length &&
                keys.every(key => pressedKeys.some(pressed => 
                    pressed.toLowerCase() === key.toLowerCase() || 
                    (key === 'Ctrl' && pressed === 'Control')
                ));

            if (match) {
                e.preventDefault();
                handleShortcutCopy();
            }
        }
    });
});

// Listen for copy events (Ctrl+C) when monitoring is enabled
document.addEventListener('copy', function(e) {
    // Small delay to ensure clipboard is updated
    setTimeout(() => {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            chrome.storage.sync.get(['autoSave'], (result) => {
                const autoSave = result.autoSave !== false; // Default to true
                
                if (autoSave) {
                    // Auto-save without asking and show confirmation
                    sendToBackground(selectedText);
                    showNotification('Text saved to Smart Clipboard');
                } else {
                    // Show save/discard notification
                    showSaveNotification(selectedText);
                }
            });
        }
    }, 50);
});

function handleShortcutCopy() {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        sendToBackground(selectedText);
        showNotification('Text saved to Smart Clipboard');
    }
}

function sendToBackground(text) {
    chrome.runtime.sendMessage({
        type: 'SAVE_SELECTION',
        content: text,
        pageInfo: {
            title: document.title,
            url: window.location.href
        }
    }).catch(() => {
        // Ignore errors if background script isn't ready
    });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
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
    
    // Remove after 2 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function showSaveNotification(text) {
    // Remove any existing save notifications
    const existing = document.querySelector('.smart-clipboard-save-notification');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'smart-clipboard-save-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        color: #333;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 14px;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        border-left: 4px solid #3b82f6;
        max-width: 300px;
    `;
    
    const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    
    notification.innerHTML = `
        <div style="margin-bottom: 12px;">
            <strong>Save to Smart Clipboard?</strong>
            <div style="color: #666; font-size: 12px; margin-top: 4px;">"${preview}"</div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button id="saveClipBtn" style="
                background: #3b82f6; 
                color: white; 
                border: none; 
                padding: 6px 12px; 
                border-radius: 4px; 
                cursor: pointer;
                font-size: 12px;
            ">Save</button>
            <button id="discardClipBtn" style="
                background: #6b7280; 
                color: white; 
                border: none; 
                padding: 6px 12px; 
                border-radius: 4px; 
                cursor: pointer;
                font-size: 12px;
            ">Discard</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Handle button clicks
    const saveBtn = notification.querySelector('#saveClipBtn');
    const discardBtn = notification.querySelector('#discardClipBtn');
    
    saveBtn.addEventListener('click', () => {
        sendToBackground(text);
        showNotification('Text saved to Smart Clipboard');
        notification.remove();
    });
    
    discardBtn.addEventListener('click', () => {
        notification.remove();
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (document.contains(notification)) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }
    }, 10000);
}

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SELECTION') {
        const selectedText = window.getSelection().toString().trim();
        sendResponse({ 
            text: selectedText,
            pageInfo: {
                title: document.title,
                url: window.location.href
            }
        });
    }
    return true;
});
