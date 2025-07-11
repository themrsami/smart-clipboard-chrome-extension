document.addEventListener('DOMContentLoaded', () => {
    const clipsContainer = document.getElementById('clipsContainer');
    const trashContainer = document.getElementById('trashContainer');
    const emptyState = document.getElementById('emptyState');
    const emptyTrash = document.getElementById('emptyTrash');
    const searchInput = document.getElementById('searchInput');
    const clearAllBtn = document.getElementById('clearAll');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
    const restoreAllBtn = document.getElementById('restoreAllBtn');
    const autoSaveCheckbox = document.getElementById('autoSave');

    // Tab elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    let clips = [];
    let trashedClips = [];

    // Load clips and trashed clips from storage
    function loadClips() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['clips', 'trashedClips'], (result) => {
                clips = result.clips || [];
                trashedClips = result.trashedClips || [];
                if (!Array.isArray(clips)) clips = [];
                if (!Array.isArray(trashedClips)) trashedClips = [];
                
                // Ensure each clip has an id and pinned status
                clips = clips.map((clip, index) => ({
                    ...clip,
                    id: clip.id || Date.now() + index,
                    pinned: !!clip.pinned,
                    floatingPinned: !!clip.floatingPinned,
                    isEncrypted: !!clip.isEncrypted
                }));
                
                // Ensure each trashed clip has an id
                trashedClips = trashedClips.map((clip, index) => ({
                    ...clip,
                    id: clip.id || Date.now() + index + '_trashed'
                }));
                
                renderClips();
                renderTrashedClips();
                resolve({ clips, trashedClips });
            });
        });
    }

    // Initial load
    loadClips();
    
    // Show info box only on first visit
    showInfoBoxIfFirstTime();

    // Handle info box close button
    const closeInfoBtn = document.getElementById('closeInfoBtn');
    if (closeInfoBtn) {
        closeInfoBtn.addEventListener('click', () => {
            const usageInfo = document.getElementById('usageInfo');
            if (usageInfo) {
                usageInfo.style.display = 'none';
            }
        });
    }

    // Handle info button in header
    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            const usageInfo = document.getElementById('usageInfo');
            if (usageInfo) {
                usageInfo.style.display = 'block';
            }
        });
    }

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.clips || changes.trashedClips)) {
            loadClips();
        }
    });

    // Listen for messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'UPDATE_CLIPS') {
            loadClips();  
            sendResponse({ success: true });
        }
        return false; 
    });

    // Tab functionality
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            
            // Remove active class from all buttons and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            btn.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');

            // If switching to trash tab, render trashed clips
            if (tabName === 'trash') {
                renderTrashedClips();
            }
        });
    });

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        
        if (activeTab === 'clips') {
            const filteredClips = clips.filter(clip => 
                clip.content && clip.content.toLowerCase().includes(searchTerm)
            );
            renderClips(filteredClips);
        } else if (activeTab === 'trash') {
            const filteredTrash = trashedClips.filter(clip => 
                clip.content && clip.content.toLowerCase().includes(searchTerm)
            );
            renderTrashedClips(filteredTrash);
        }
    });

    // Delete clip (move to trash)
    function deleteClip(clipId) {
        const clipIndex = clips.findIndex(clip => clip.id === clipId);
        if (clipIndex === -1) return;
        
        // Move clip to trash with deletion timestamp
        const trashedClip = {
            ...clips[clipIndex],
            deletedAt: Date.now(),
            id: Date.now() + '_' + clipIndex // Ensure unique ID
        };
        
        // Remove from active clips
        clips.splice(clipIndex, 1);
        
        // Update trashedClips array
        const updatedTrashedClips = [trashedClip, ...trashedClips];
        
        // Save both arrays
        chrome.storage.local.set({ 
            clips: clips,
            trashedClips: updatedTrashedClips 
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving to storage:', chrome.runtime.lastError);
                return;
            }
            // Update local array after successful save
            trashedClips = updatedTrashedClips;
            renderClips();
            renderTrashedClips();
            showToast('Clip moved to trash');

            // Notify content script to remove floating clip
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'UPDATE_FLOATING_CLIPS',
                        clipId: clipId
                    });
                }
            });
        });
    }

    // Restore clip from trash
    function restoreClip(clipId) {
        const clipIndex = trashedClips.findIndex(clip => clip.id === clipId);
        if (clipIndex === -1) return;

        // Move clip back to active clips
        const restoredClip = { ...trashedClips[clipIndex] };
        delete restoredClip.deletedAt;
        clips.unshift(restoredClip);

        // Remove from trash
        trashedClips.splice(clipIndex, 1);

        // Save both arrays
        chrome.storage.local.set({ clips, trashedClips }, () => {
            renderTrashedClips();
            showToast('Clip restored');
        });
    }

    // Restore all clips from trash
    restoreAllBtn.addEventListener('click', async () => {
        if (!trashedClips.length) {
            showToast('No clips to restore');
            return;
        }

        const confirmed = await showConfirmModal(
            'Restore All Clips',
            'Are you sure you want to restore all clips from trash?'
        );

        if (confirmed) {
            // Move all trashed clips back to clips array
            const restoredClips = trashedClips.map(clip => {
                const { deletedAt, ...clipWithoutDeletedAt } = clip;
                return {
                    ...clipWithoutDeletedAt,
                    id: Date.now() + '_' + clip.id // Ensure unique ID
                };
            });
            
            clips = [...restoredClips, ...clips];
            trashedClips = [];
            
            chrome.storage.local.set({ clips, trashedClips }, () => {
                renderClips();
                renderTrashedClips();
                showToast('All clips restored');
            });
        }
    });

    // Modal functions
    const modal = document.getElementById('confirmModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalCancel = document.getElementById('modalCancel');

    function showConfirmModal(title, message) {
        return new Promise((resolve) => {
            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modal.classList.add('show');

            const handleConfirm = () => {
                modal.classList.remove('show');
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                modal.classList.remove('show');
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                modalConfirm.removeEventListener('click', handleConfirm);
                modalCancel.removeEventListener('click', handleCancel);
            };

            modalConfirm.addEventListener('click', handleConfirm);
            modalCancel.addEventListener('click', handleCancel);
        });
    }

    // Permanently delete all trashed clips
    permanentDeleteBtn.addEventListener('click', async () => {
        if (!trashedClips.length) {
            showToast('Trash is already empty');
            return;
        }

        const confirmed = await showConfirmModal(
            'Empty Trash',
            'Are you sure you want to permanently delete all items in trash?'
        );

        if (confirmed) {
            trashedClips = [];
            chrome.storage.local.set({ trashedClips }, () => {
                renderTrashedClips();
                showToast('Trash emptied permanently');
            });
        }
    });

    // Permanently delete a single trashed clip
    async function permanentlyDeleteClip(clipId) {
        const confirmed = await showConfirmModal(
            'Delete Clip',
            'Are you sure you want to permanently delete this clip?'
        );

        if (confirmed) {
            const clipIndex = trashedClips.findIndex(clip => clip.id === clipId);
            if (clipIndex === -1) return;
            
            trashedClips.splice(clipIndex, 1);
            
            chrome.storage.local.set({ trashedClips }, () => {
                renderTrashedClips();
                showToast('Clip permanently deleted');
            });
        }
    }

    // Clear all clips
    clearAllBtn.addEventListener('click', async () => {
        if (!clips.length) {
            showToast('No clips to clear');
            return;
        }

        const confirmed = await showConfirmModal(
            'Clear All Clips',
            'Are you sure you want to move all clips to trash?'
        );

        if (confirmed) {
            // Move all clips to trash
            const newTrashedClips = clips.map(clip => ({
                ...clip,
                deletedAt: Date.now(),
                id: Date.now() + '_' + clip.id
            }));
            
            trashedClips = [...newTrashedClips, ...trashedClips];
            clips = [];
            
            chrome.storage.local.set({ clips, trashedClips }, () => {
                renderClips();
                renderTrashedClips();
                showToast('All clips moved to trash');
            });
        }
    });

    // Copy all clips
    copyAllBtn.addEventListener('click', () => {
        if (!clips || clips.length === 0) {
            showToast('No clips to copy');
            return;
        }

        const allContent = clips
            .map(clip => clip.content)
            .filter(content => content)
            .join('\n\n');

        navigator.clipboard.writeText(allContent)
            .then(() => {
                showToast(`Copied ${clips.length} clips to clipboard`);
            })
            .catch(err => {
                console.error('Failed to copy all clips:', err);
                showToast('Failed to copy clips', 'error');
            });
    });

    // Render clips
    function renderClips(clipsToRender = clips) {
        const container = document.getElementById('clipsContainer');
        const emptyState = document.getElementById('emptyState');
        
        if (!clipsToRender || clipsToRender.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        container.style.display = 'block';
        emptyState.style.display = 'none';
        container.innerHTML = '';

        // Sort clips to show floating pinned ones first, then regular pinned
        const sortedClips = [...clipsToRender].sort((a, b) => {
            if (a.floatingPinned && !b.floatingPinned) return -1;
            if (!a.floatingPinned && b.floatingPinned) return 1;
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.timestamp - a.timestamp;
        });

        sortedClips.forEach((clip) => {
            const clipElement = document.createElement('div');
            clipElement.className = `clip-item ${clip.floatingPinned ? 'floating-pinned' : ''} ${clip.pinned ? 'pinned' : ''}`;
            clipElement.dataset.id = clip.id;
            
            // Add floating pin indicator if it's a floating pin
            if (clip.floatingPinned) {
                const floatingPinIndicator = document.createElement('div');
                floatingPinIndicator.className = 'floating-pin-indicator';
                floatingPinIndicator.innerHTML = '&#x1F4CC;';
                floatingPinIndicator.title = 'Floating Pinned';
                clipElement.appendChild(floatingPinIndicator);
            }
            
            const contentElement = document.createElement('div');
            contentElement.className = 'clip-content collapsed';
            
            const textDirection = getTextDirection(clip.content);
            contentElement.dir = textDirection;
            contentElement.textContent = clip.content || '';

            const timestamp = new Date(clip.timestamp).toLocaleString();
            const sourceText = formatSource(clip.source);
            
            const metaElement = document.createElement('div');
            metaElement.className = 'clip-meta';
            metaElement.innerHTML = `
                <span class="clip-time">&#x1F552; ${timestamp}</span>
                ${sourceText ? `<span class="clip-source">&#x1F4D6; ${sourceText}</span>` : ''}
            `;

            const actionsElement = document.createElement('div');
            actionsElement.className = 'clip-actions';

            // Floating pin button
            const floatingPinBtn = document.createElement('button');
            floatingPinBtn.className = `action-btn floating-pin-btn ${clip.floatingPinned ? 'active' : ''}`;
            floatingPinBtn.textContent = clip.floatingPinned ? '🌟 On' : '🌟 Float';
            floatingPinBtn.title = clip.floatingPinned ? 'Remove from floating' : 'Make floating';
            floatingPinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const updatedClips = [...clips];
                const clipIndex = updatedClips.findIndex(c => c.id === clip.id);
                if (clipIndex !== -1) {
                    updatedClips[clipIndex] = {
                        ...updatedClips[clipIndex],
                        floatingPinned: !updatedClips[clipIndex].floatingPinned
                    };
                    chrome.storage.local.set({ clips: updatedClips }, () => {
                        clips = updatedClips;
                        renderClips();
                        // Send message to content script to update floating clips
                        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                            if (tabs[0]) {
                                chrome.tabs.sendMessage(tabs[0].id, {
                                    type: 'UPDATE_FLOATING_CLIPS',
                                    clips: updatedClips.filter(c => c.floatingPinned)
                                });
                            }
                        });
                        showToast(updatedClips[clipIndex].floatingPinned ? 'Added to floating clips' : 'Removed from floating clips');
                    });
                }
            });

            // Regular pin button
            const pinBtn = document.createElement('button');
            pinBtn.className = `action-btn pin-btn ${clip.pinned ? 'pinned' : ''}`;
            pinBtn.textContent = clip.pinned ? '📌 On' : '📌 Pin';
            pinBtn.title = clip.pinned ? 'Unpin' : 'Pin';
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePinClip(clip.id);
            });

            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.textContent = '📋 Copy';
            copyBtn.title = 'Copy to clipboard';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (clip.content) {
                    copyToClipboard(clip.content);
                }
            });

            // Protect button
            const protectBtn = document.createElement('button');
            protectBtn.className = 'action-btn';
            protectBtn.textContent = '🔒 Protect';
            protectBtn.title = 'Protect with password';
            protectBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const password = prompt('Enter password to protect this clip:');
                if (!password) return;
                
                try {
                    const clipToEncrypt = {...clip};
                    const encryptedContent = await EncryptionUtil.encryptClip(clipToEncrypt.content, password);
                    clipToEncrypt.content = encryptedContent;
                    clipToEncrypt.isEncrypted = true;
                    
                    chrome.storage.local.get(['clips'], (result) => {
                        const clips = result.clips || [];
                        const clipIndex = clips.findIndex(c => c.id === clipToEncrypt.id);
                        if (clipIndex !== -1) {
                            clips[clipIndex] = clipToEncrypt;
                            chrome.storage.local.set({ clips }, () => {
                                showToast('Clip protected');
                                renderClips();
                            });
                        }
                    });
                } catch (error) {
                    console.error('Protection error:', error);
                    showToast('Failed to protect clip: ' + error.message);
                }
            });

            // Unlock button if clip is encrypted
            if (clip.isEncrypted) {
                const unlockBtn = document.createElement('button');
                unlockBtn.className = 'action-btn';
                unlockBtn.textContent = '🔓 Unlock';
                unlockBtn.title = 'Unlock clip';
                unlockBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const password = prompt('Enter password to unlock:');
                    if (!password) return;
                    
                    // Store original content before any changes
                    const originalContent = contentElement.innerHTML;
                    
                    try {
                        const decryptedContent = await EncryptionUtil.decryptClip(clip.content, password);
                        
                        // Only proceed if decryption was successful
                        if (decryptedContent) {
                            // Create temporary element to show decrypted content
                            const tempContent = document.createElement('div');
                            tempContent.textContent = decryptedContent;
                            tempContent.style.padding = '10px';
                            tempContent.style.margin = '10px 0';
                            tempContent.style.backgroundColor = '#f0f0f0';
                            tempContent.style.borderRadius = '4px';
                            
                            // Function to restore original content
                            const restoreContent = () => {
                                if (contentElement) {
                                    contentElement.innerHTML = originalContent;
                                }
                            };
                            
                            // Clear and append new content
                            contentElement.innerHTML = '';
                            contentElement.appendChild(tempContent);
                            
                            // Add copy button
                            const copyDecrypted = document.createElement('button');
                            copyDecrypted.textContent = 'Copy';
                            copyDecrypted.className = 'action-btn';
                            copyDecrypted.style.marginLeft = '10px';
                            copyDecrypted.addEventListener('click', () => {
                                navigator.clipboard.writeText(decryptedContent);
                                showToast('Copied to clipboard');
                            });
                            tempContent.appendChild(copyDecrypted);
                            
                            // Add close button
                            const closeBtn = document.createElement('button');
                            closeBtn.textContent = '✕';
                            closeBtn.className = 'action-btn';
                            closeBtn.style.marginLeft = '5px';
                            closeBtn.addEventListener('click', restoreContent);
                            tempContent.appendChild(closeBtn);
                            
                            // Auto-hide after 30 seconds
                            const timer = setTimeout(restoreContent, 30000);
                            
                            // Clear timer if content is manually restored
                            closeBtn.addEventListener('click', () => clearTimeout(timer));
                            
                            showToast('Clip unlocked');
                        }
                    } catch (error) {
                        // Only show toast notification for user-facing errors
                        showToast(error.message);
                    }
                });
                
                // Remove Protection button
                const removeProtectionBtn = document.createElement('button');
                removeProtectionBtn.className = 'action-btn remove-protection-btn';
                removeProtectionBtn.textContent = '🔓 Remove';
                removeProtectionBtn.title = 'Permanently remove password protection';
                removeProtectionBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    
                    // Confirm action
                    const confirmed = await showConfirmModal(
                        'Remove Protection',
                        'Enter password to permanently remove protection from this clip. The clip will become unencrypted.'
                    );
                    
                    if (!confirmed) return;
                    
                    const password = prompt('Enter password to remove protection:');
                    if (!password) return;
                    
                    try {
                        // Decrypt the content first
                        const decryptedContent = await EncryptionUtil.decryptClip(clip.content, password);
                        
                        if (decryptedContent) {
                            // Update the clip to remove encryption
                            const clipIndex = clips.findIndex(c => c.id === clip.id);
                            if (clipIndex !== -1) {
                                clips[clipIndex].content = decryptedContent;
                                clips[clipIndex].isEncrypted = false;
                                
                                // Save to storage
                                chrome.storage.local.set({ clips }, () => {
                                    showToast('Protection removed successfully');
                                    renderClips(); // Refresh the display
                                });
                            }
                        }
                    } catch (error) {
                        showToast('Failed to remove protection: ' + error.message);
                    }
                });
                
                actionsElement.appendChild(unlockBtn);
                actionsElement.appendChild(removeProtectionBtn);
            }

            actionsElement.appendChild(floatingPinBtn);
            actionsElement.appendChild(pinBtn);
            actionsElement.appendChild(copyBtn);
            actionsElement.appendChild(protectBtn);

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.textContent = '🗑️ Delete';
            deleteBtn.title = 'Move to trash';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = await showConfirmModal(
                    'Delete Clip',
                    'Are you sure you want to move this clip to trash?'
                );
                if (confirmed) {
                    deleteClip(clip.id);
                }
            });

            actionsElement.appendChild(deleteBtn);

            clipElement.appendChild(contentElement);
            clipElement.appendChild(metaElement);
            clipElement.appendChild(actionsElement);

            // Make the entire clip content area clickable to expand
            contentElement.addEventListener('click', () => {
                toggleClipContent(contentElement);
            });

            container.appendChild(clipElement);
        });
    }

    // Render trashed clips
    function renderTrashedClips(trashedClipsToRender = trashedClips) {
        if (!trashedClipsToRender || trashedClipsToRender.length === 0) {
            trashContainer.style.display = 'none';
            emptyTrash.style.display = 'block';
            return;
        }

        trashContainer.style.display = 'block';
        emptyTrash.style.display = 'none';
        trashContainer.innerHTML = '';

        trashedClipsToRender.forEach((clip) => {
            const clipElement = document.createElement('div');
            clipElement.className = 'clip-item trashed';
            clipElement.dataset.id = clip.id;
            
            const contentElement = document.createElement('div');
            contentElement.className = 'clip-content collapsed';
            contentElement.dir = getTextDirection(clip.content);
            contentElement.textContent = clip.content || '';

            const metaElement = document.createElement('div');
            metaElement.className = 'clip-meta';
            const deletedDate = new Date(clip.deletedAt).toLocaleString();
            metaElement.innerHTML = `
                <span class="clip-time">&#x1F552; Deleted: ${deletedDate}</span>
                ${clip.source ? `<span class="clip-source">&#x1F4D6; ${formatSource(clip.source)}</span>` : ''}
            `;

            const actionsElement = document.createElement('div');
            actionsElement.className = 'clip-actions';

            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'action-btn restore-btn';
            restoreBtn.innerHTML = `<span class="btn-icon">&#x1F4CC;</span> Restore`;
            restoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                restoreClip(clip.id);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.innerHTML = `<span class="btn-icon">&#x1F5D1;</span> Delete`;
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = await showConfirmModal(
                    'Delete Clip',
                    'Are you sure you want to permanently delete this clip?'
                );
                if (confirmed) {
                    permanentlyDeleteClip(clip.id);
                }
            });

            actionsElement.appendChild(restoreBtn);
            actionsElement.appendChild(deleteBtn);
            clipElement.appendChild(contentElement);
            clipElement.appendChild(metaElement);
            clipElement.appendChild(actionsElement);

            clipElement.appendChild(contentElement);
            clipElement.appendChild(metaElement);
            clipElement.appendChild(actionsElement);

            // Make content clickable to expand
            contentElement.addEventListener('click', () => {
                toggleClipContent(contentElement);
            });

            trashContainer.appendChild(clipElement);
        });
    }

    // Toggle pin status of a clip
    function togglePinClip(clipId) {
        const clipIndex = clips.findIndex(clip => clip.id === clipId);
        if (clipIndex === -1) return;

        const updatedClips = [...clips];
        updatedClips[clipIndex] = {
            ...updatedClips[clipIndex],
            pinned: !updatedClips[clipIndex].pinned
        };

        chrome.storage.local.set({ clips: updatedClips }, () => {
            clips = updatedClips;
            renderClips();
            showToast(updatedClips[clipIndex].pinned ? 'Clip pinned' : 'Clip unpinned');
        });
    }

    // Helper function to escape HTML
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Copy to clipboard
    function copyToClipboard(text) {
        if (!text) return;
        
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast('Copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
                showToast('Failed to copy text', 'error');
            });
    }

    // Show toast notification
    function showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        const existingToast = toastContainer.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // Detect text direction
    function getTextDirection(text) {
        if (!text) return 'ltr';
        const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
        return rtlRegex.test(text) ? 'rtl' : 'ltr';
    }

    // Format source info
    function formatSource(source) {
        if (!source) return '';
        const title = source.title || 'Untitled';
        const url = source.url || '#';
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="source-link" title="${url}">${title}</a>`;
    }

    // Toggle clip content expansion
    function toggleClipContent(contentElement) {
        contentElement.classList.toggle('collapsed');
    }

    // Protect a clip with password
    async function protectClip(clipId) {
        const password = prompt('Enter password to protect this clip:');
        if (!password) return;

        chrome.storage.local.get(['clips'], async (result) => {
            const clips = result.clips || [];
            const clip = clips.find(c => c.id === clipId);
            
            if (clip) {
                try {
                    const encryptedContent = await EncryptionUtil.encryptClip(clip.content, password);
                    clip.content = encryptedContent;
                    clip.protected = true;
                    
                    chrome.storage.local.set({ clips }, () => {
                        showToast('Clip protected successfully');
                        renderClips();
                    });
                } catch (error) {
                    showToast('Failed to protect clip: ' + error.message);
                }
            }
        });
    }

    // Render clip with protect button
    function renderClip(clip) {
        const clipElement = document.createElement('div');
        clipElement.className = 'clip';
        clipElement.setAttribute('data-id', clip.id);

        const contentPreview = clip.protected ? '🔒 Protected Content' : clip.content;
        
        clipElement.innerHTML = `
            <div class="clip-content">${contentPreview}</div>
            <div class="clip-actions">
                <button class="copy-btn" title="Copy to clipboard">📋</button>
                <button class="protect-btn" title="${clip.protected ? 'Unlock clip' : 'Protect clip'}">${clip.protected ? '🔓' : '🔒'}</button>
                <button class="delete-btn" title="Move to trash">🗑️</button>
            </div>
        `;

        // Add click handlers
        const copyBtn = clipElement.querySelector('.copy-btn');
        const protectBtn = clipElement.querySelector('.protect-btn');
        const deleteBtn = clipElement.querySelector('.delete-btn');

        copyBtn.addEventListener('click', () => {
            if (!clip.protected) {
                copyToClipboard(clip.content);
            } else {
                showToast('Unlock the clip first to copy it');
            }
        });

        protectBtn.addEventListener('click', () => {
            if (clip.protected) {
                unlockClip(clip.id);
            } else {
                protectClip(clip.id);
            }
        });

        deleteBtn.addEventListener('click', () => moveToTrash(clip.id));

        return clipElement;
    }

    // Unlock a clip
    async function unlockClip(clipId) {
        const password = prompt('Enter password to unlock:');
        if (!password) return;

        chrome.storage.local.get(['clips'], async (result) => {
            const clips = result.clips || [];
            const clip = clips.find(c => c.id === clipId);
            
            if (clip) {
                try {
                    const decryptedContent = await EncryptionUtil.decryptClip(clip.content, password);
                    clip.content = decryptedContent;
                    clip.protected = false;
                    
                    chrome.storage.local.set({ clips }, () => {
                        showToast('Clip unlocked successfully');
                        renderClips();
                    });
                } catch (error) {
                    showToast('Failed to unlock clip: ' + error.message);
                }
            }
        });
    }

    // Settings functionality
    let recording = false;
    let currentKeys = new Set();

    document.getElementById('copyShortcut').addEventListener('focus', function() {
        recording = true;
        this.value = '';
        this.classList.add('recording');
        currentKeys.clear();
    });

    document.getElementById('copyShortcut').addEventListener('blur', function() {
        recording = false;
        this.classList.remove('recording');
    });

    document.addEventListener('keydown', function(e) {
        if (!recording) return;
        e.preventDefault();

        // Handle special keys
        if (e.key === 'Escape') {
            recording = false;
            document.getElementById('copyShortcut').blur();
            return;
        }

        // Map key names to more readable format
        let key = e.key;
        if (e.key === ' ') key = 'Space';
        if (e.key === 'Control') key = 'Ctrl';
        if (e.key === 'Meta') key = 'Command';

        currentKeys.add(key);

        const shortcut = Array.from(currentKeys).join('+');
        document.getElementById('copyShortcut').value = shortcut;

        // Save the shortcut
        chrome.storage.sync.set({ copyShortcut: shortcut });
    });

    document.getElementById('clearShortcut').addEventListener('click', function() {
        document.getElementById('copyShortcut').value = '';
        chrome.storage.sync.remove('copyShortcut');
    });

    // Load saved settings
    chrome.storage.sync.get(['copyShortcut', 'autoSave'], function(data) {
        if (data.copyShortcut) {
            document.getElementById('copyShortcut').value = data.copyShortcut;
        }
        autoSaveCheckbox.checked = data.autoSave !== false; // Default to true
    });

    // Autosave Functionality
    autoSaveCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({ autoSave: this.checked });
    });
    
    // Function to show info box only on first visit
    function showInfoBoxIfFirstTime() {
        chrome.storage.local.get(['hasSeenInfo'], (result) => {
            if (!result.hasSeenInfo) {
                // First time user - show info box
                const usageInfo = document.getElementById('usageInfo');
                if (usageInfo) {
                    usageInfo.style.display = 'block';
                }
                
                // Mark as seen
                chrome.storage.local.set({ hasSeenInfo: true });
            }
        });
    }
});
