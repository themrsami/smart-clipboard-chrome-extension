// Initialize floating clips container
let floatingContainer = document.querySelector('.floating-clips-container');
if (!floatingContainer) {
    floatingContainer = document.createElement('div');
    floatingContainer.className = 'floating-clips-container';
    document.body.appendChild(floatingContainer);
}

function createFloatingClip(clip) {
    const clipElement = document.createElement('div');
    clipElement.className = 'floating-clip-card';
    clipElement.setAttribute('data-id', clip.id);

    // Create single resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    clipElement.appendChild(resizeHandle);

    // Set initial size if available
    if (clip.size) {
        clipElement.style.width = `${clip.size.width}px`;
        clipElement.style.height = `${clip.size.height}px`;
    }

    // Header section (for dragging)
    const headerSection = document.createElement('div');
    headerSection.className = 'clip-header';

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '&#8942;&#8942;';
    dragHandle.title = 'Drag to move';

    // Source link (webpage title)
    const sourceLink = document.createElement('a');
    sourceLink.className = 'clip-source-link';
    sourceLink.textContent = clip.source?.title || 'Untitled';
    sourceLink.href = clip.source?.url || '#';
    sourceLink.title = clip.source?.url || '';
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    
    // Timestamp
    const timestamp = document.createElement('div');
    timestamp.className = 'clip-timestamp';
    timestamp.textContent = new Date(clip.timestamp).toLocaleString();
    
    // Add elements to header
    headerSection.appendChild(dragHandle);
    headerSection.appendChild(sourceLink);
    headerSection.appendChild(timestamp);

    // Content
    const contentElement = document.createElement('div');
    contentElement.className = 'clip-content selectable';
    contentElement.textContent = clip.content;

    // Actions container
    const actionsElement = document.createElement('div');
    actionsElement.className = 'clip-actions';

    // Pin button
    const pinBtn = document.createElement('button');
    pinBtn.className = `action-btn pin-btn ${clip.pinned ? 'pinned' : ''}`;
    pinBtn.innerHTML = `<span class="btn-icon">${clip.pinned ? '&#128204;' : '&#128204;'}</span> ${clip.pinned ? 'Pinned' : 'Pin'}`;
    pinBtn.title = clip.pinned ? 'Unpin' : 'Pin';
    pinBtn.onclick = (e) => {
        e.stopPropagation();
        chrome.storage.local.get(['clips'], (result) => {
            const clips = result.clips || [];
            const clipIndex = clips.findIndex(c => c.id === clip.id);
            if (clipIndex !== -1) {
                clips[clipIndex].pinned = !clips[clipIndex].pinned;
                chrome.storage.local.set({ clips }, () => {
                    pinBtn.innerHTML = `<span class="btn-icon">${clips[clipIndex].pinned ? '&#128204;' : '&#128204;'}</span> ${clips[clipIndex].pinned ? 'Pinned' : 'Pin'}`;
                    pinBtn.classList.toggle('pinned');
                });
            }
        });
    };

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.innerHTML = '<span class="btn-icon">&#128465;</span> Delete';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        // Send message to background script to delete
        chrome.runtime.sendMessage({
            type: 'DELETE_CLIP',
            clipId: clip.id
        });
    };

    // Unfloat button
    const unfloatBtn = document.createElement('button');
    unfloatBtn.className = 'action-btn unfloat-btn';
    unfloatBtn.innerHTML = '<span class="btn-icon">&#10060;</span> Unfloat';
    unfloatBtn.onclick = (e) => {
        e.stopPropagation();
        clipElement.remove();
        chrome.storage.local.get(['clips'], (result) => {
            const clips = result.clips || [];
            const clipIndex = clips.findIndex(c => c.id === clip.id);
            if (clipIndex !== -1) {
                clips[clipIndex].floatingPinned = false;
                chrome.storage.local.set({ clips });
            }
        });
    };

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn copy-btn';
    copyBtn.innerHTML = '<span class="btn-icon">&#128203;</span> Copy';
    copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(clip.content).then(() => {
            copyBtn.innerHTML = '<span class="btn-icon">&#10004;</span> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = '<span class="btn-icon">&#128203;</span> Copy';
            }, 1000);
        });
    };

    actionsElement.appendChild(pinBtn);
    actionsElement.appendChild(copyBtn);
    actionsElement.appendChild(unfloatBtn);
    actionsElement.appendChild(deleteBtn);

    clipElement.appendChild(headerSection);
    clipElement.appendChild(contentElement);
    clipElement.appendChild(actionsElement);

    // Make draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    headerSection.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target === dragHandle || e.target === headerSection) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            clipElement.style.cursor = 'grabbing';
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            clipElement.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    }

    function dragEnd() {
        if (isDragging) {
            isDragging = false;
            clipElement.style.cursor = 'grab';
            
            // Save the new position
            chrome.storage.local.get(['clips'], (result) => {
                const clips = result.clips || [];
                const clipIndex = clips.findIndex(c => c.id === clip.id);
                if (clipIndex !== -1) {
                    clips[clipIndex].position = {
                        x: currentX,
                        y: currentY
                    };
                    chrome.storage.local.set({ clips });
                }
            });
        }
    }

    // Make resizable
    let isResizing = false;
    let startWidth, startHeight, startX, startY;

    resizeHandle.addEventListener('mousedown', initResize);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);

    function initResize(e) {
        isResizing = true;
        e.stopPropagation();

        // Store initial dimensions and cursor position
        const rect = clipElement.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        startX = e.clientX;
        startY = e.clientY;
    }

    function resize(e) {
        if (!isResizing) return;

        e.preventDefault();
        
        // Calculate the distance moved (reversed for bottom-right handle)
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Calculate new dimensions (moving right/down increases size)
        const newWidth = Math.min(800, Math.max(200, startWidth + deltaX));
        const newHeight = Math.min(600, Math.max(100, startHeight + deltaY));

        // Apply new dimensions
        clipElement.style.width = `${newWidth}px`;
        clipElement.style.height = `${newHeight}px`;

        // Save the new size
        chrome.storage.local.get(['clips'], (result) => {
            const clips = result.clips || [];
            const clipIndex = clips.findIndex(c => c.id === clip.id);
            if (clipIndex !== -1) {
                clips[clipIndex].size = {
                    width: newWidth,
                    height: newHeight
                };
                chrome.storage.local.set({ clips });
            }
        });
    }

    function stopResize() {
        isResizing = false;
    }

    return clipElement;
}

function updateFloatingClips(clips) {
    // Remove all existing floating clips
    const existingClips = document.querySelectorAll('.floating-clip-card');
    existingClips.forEach(clip => clip.remove());

    // Create new floating clips
    clips.forEach(clip => {
        if (clip.floatingPinned) {
            const clipElement = createFloatingClip(clip);
            floatingContainer.appendChild(clipElement);

            // Restore size if previously saved
            if (clip.size) {
                clipElement.style.width = `${clip.size.width}px`;
                clipElement.style.height = `${clip.size.height}px`;
            }
        }
    });
}

// Listen for messages to update floating clips
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'UPDATE_FLOATING_CLIPS') {
        updateFloatingClips(request.clips);
    }
});

// Remove any existing injected styles
const existingStyles = document.querySelector('style[data-source="floating-clips"]');
if (existingStyles) {
    existingStyles.remove();
}
