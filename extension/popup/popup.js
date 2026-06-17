let scannedData = null;

// Initialize settings
chrome.storage.local.get({ backend: 'server' }, (data) => {
    const radio = document.querySelector(`input[name="backend"][value="${data.backend}"]`);
    if (radio && !radio.disabled) {
        radio.checked = true;
    }
});

// Save settings when changed
document.querySelectorAll('input[name="backend"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        chrome.storage.local.set({ backend: e.target.value });
    });
});

document.getElementById('scan-btn').addEventListener('click', async () => {
    const statusText = document.getElementById('status-text');
    const errorMsg = document.getElementById('error-msg');
    
    try {
        errorMsg.classList.add('hidden');
        statusText.innerText = "Extracting...";
        
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Ask content script to scan
        chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_TUTORIAL" }, (response) => {
            if (chrome.runtime.lastError) {
                errorMsg.innerText = "Error: Cannot scan this page. Are you on a Codeforces tutorial?";
                errorMsg.classList.remove('hidden');
                statusText.innerText = "Scan failed.";
                return;
            }
            
            if (response && response.success) {
                scannedData = response.data;
                statusText.innerText = `Found tutorial for Contest ${scannedData.contestId}`;
                
                // Show preview
                document.getElementById('preview-container').classList.remove('hidden');
                document.getElementById('preview-text').innerText = `Problems extracted: ${Object.keys(scannedData.problems).join(', ')}`;
                
                // Show store button
                document.getElementById('scan-btn').classList.add('hidden');
                document.getElementById('store-btn').classList.remove('hidden');
            } else {
                errorMsg.innerText = response?.error || "Unknown error occurred.";
                errorMsg.classList.remove('hidden');
                statusText.innerText = "Scan failed.";
            }
        });
    } catch (err) {
        errorMsg.innerText = err.toString();
        errorMsg.classList.remove('hidden');
    }
});

document.getElementById('store-btn').addEventListener('click', () => {
    const statusText = document.getElementById('status-text');
    const errorMsg = document.getElementById('error-msg');
    
    if (!scannedData) return;
    
    statusText.innerText = "Saving to durable storage...";
    
    chrome.runtime.sendMessage({
        action: "STORE_TUTORIAL",
        payload: scannedData
    }, (response) => {
        if (response && response.success) {
            statusText.innerText = `Saved successfully! (Hash: ${response.hash.substring(0,8)}...)`;
            document.getElementById('store-btn').disabled = true;
            document.getElementById('store-btn').innerText = "Stored \u2713";
        } else {
            errorMsg.innerText = response?.error || "Failed to store.";
            errorMsg.classList.remove('hidden');
        }
    });
});
