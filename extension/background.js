// Helper to generate a simple hash of a string
async function hashContent(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Normalize contest ID and problem index into a storage key
function getStorageKey(contestId, problemIndex) {
    return `tutorial_${contestId}`; // Editorials are usually per-contest, not per-problem
}

// ---- OFFSCREEN LIFECYCLE MANAGEMENT ----
let creating = null;
async function ensureOffscreenAlive() {
    if (await chrome.offscreen.hasDocument()) return;
    if (creating) {
        await creating;
        return;
    }
    creating = chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['WORKERS'], // Valid Reason
        justification: 'WebGPU LLM Inference'
    });
    await creating;
    creating = null;
}

// ---- PORT PROXYING ----
chrome.runtime.onConnect.addListener((uiPort) => {
    if (uiPort.name === "ui-to-background") {
        let offscreenPort = null;
        
        uiPort.onMessage.addListener(async (msg) => {
            const { backend = 'server' } = await chrome.storage.local.get('backend');
            
            if (backend === 'server') {
                if (msg.action === "LOAD_MODEL") {
                    try {
                        const response = await fetch("http://127.0.0.1:8000/health");
                        if (response.ok) {
                            uiPort.postMessage({ type: "loaded" });
                        } else {
                            uiPort.postMessage({ type: "error", reason: "Local Server is not ready." });
                        }
                    } catch (e) {
                        uiPort.postMessage({ type: "error", reason: "Could not connect to Local Server." });
                    }
                } else if (msg.action === "GENERATE_HINT") {
                    try {
                        const response = await fetch("http://127.0.0.1:8000/generate_hint", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(msg.payload)
                        });
                        if (!response.ok) throw new Error("Server returned " + response.status);
                        const data = await response.json();
                        
                        uiPort.postMessage({ type: "token", text: data.hint });
                        uiPort.postMessage({ type: "done" });
                    } catch (e) {
                        uiPort.postMessage({ type: "error", reason: "Generation failed: " + e.message });
                    }
                }
            } else {
                // WebGPU Offscreen Routing
                await ensureOffscreenAlive();
                if (!offscreenPort) {
                    offscreenPort = chrome.runtime.connect({ name: "offscreen-engine" });
                    offscreenPort.onMessage.addListener((m) => {
                        if (m.type !== 'keepalive') uiPort.postMessage(m);
                    });
                }
                offscreenPort.postMessage(msg);
            }
        });
        
        uiPort.onDisconnect.addListener(() => {
            if (offscreenPort) offscreenPort.disconnect();
        });
    }
});

// ---- MESSAGE LISTENERS ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "STORE_TUTORIAL") {
        (async () => {
            const { contestId, problems } = message.payload;
            if (!contestId || !problems || Object.keys(problems).length === 0) {
                sendResponse({ success: false, error: "Missing contestId or empty problems" });
                return;
            }

            try {
                const contentStr = JSON.stringify(problems);
                const contentHash = await hashContent(contentStr);
                const storageKey = getStorageKey(contestId);
                
                const dataToStore = {};
                dataToStore[storageKey] = {
                    problems: problems,
                    hash: contentHash,
                    timestamp: Date.now()
                };

                await chrome.storage.local.set(dataToStore);
                sendResponse({ success: true, hash: contentHash });
            } catch (err) {
                sendResponse({ success: false, error: err.toString() });
            }
        })();
        return true; // Keep message channel open for async response
    }

    if (message.action === "GET_TUTORIAL") {
        const { contestId } = message.payload;
        const storageKey = getStorageKey(contestId);
        
        chrome.storage.local.get([storageKey], (result) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else if (result[storageKey]) {
                sendResponse({ success: true, data: result[storageKey] });
            } else {
                sendResponse({ success: false, error: "Tutorial not found in storage" });
            }
        });
        return true;
    }
});
