// Platform Detection
const PLATFORM = (() => {
    const host = window.location.hostname;
    if (host.includes('leetcode.com')) return 'leetcode';
    if (host.includes('codeforces.com')) return 'codeforces';
    return 'unknown';
})();

function getLeetCodeSlug() {
    const match = window.location.pathname.match(/\/problems\/([\w-]+)/);
    return match ? match[1] : null;
}

function parseUrl() {
    const url = window.location.pathname;

    if (PLATFORM === 'leetcode') {
        let slug = getLeetCodeSlug();
        if (slug) return { platform: 'leetcode', titleSlug: slug };
    } else if (PLATFORM === 'codeforces') {
        let match = url.match(/\/contest\/(\d+)\/problem\/([A-Z0-9]+)/i);
        if (match) return { platform: 'codeforces', contestId: match[1], problemIndex: match[2] };

        match = url.match(/\/problemset\/problem\/(\d+)\/([A-Z0-9]+)/i);
        if (match) return { platform: 'codeforces', contestId: match[1], problemIndex: match[2] };
    }
    return null;
}

// Check if it's a live contest
function isLiveContest(platform) {
    if (platform === 'codeforces') {
        const countdown = document.querySelector('.countdown');
        return countdown !== null && countdown.innerText.trim() !== "";
    }
    return false;
}

function extractProblemHtml() {
    const problemStatement = document.querySelector('.problem-statement');
    return problemStatement ? problemStatement.outerHTML : document.body.outerHTML;
}

class HintSidebar {
    constructor(parsedUrl) {
        this.platform = parsedUrl.platform;
        this.contestId = parsedUrl.contestId;
        this.problemIndex = parsedUrl.problemIndex;
        this.titleSlug = parsedUrl.titleSlug;
        this.tutorialProblems = null;
        this.isModelLoaded = false;

        this.port = chrome.runtime.connect({ name: "ui-to-background" });
        this.port.onMessage.addListener((msg) => this.handlePortMessage(msg));

        this.container = document.createElement('div');
        this.container.id = 'cf-ai-hint-root';
        document.body.appendChild(this.container);

        this.shadow = this.container.attachShadow({ mode: 'open' });

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('styles/inject.css');
        this.shadow.appendChild(link);

        const icons = document.createElement('link');
        icons.rel = 'stylesheet';
        icons.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css';
        this.shadow.appendChild(icons);

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'hint-sidebar';
        this.shadow.appendChild(this.wrapper);

        this.init();
    }

    init() {
        this.renderState('checking', 'Connecting to WebGPU Engine...');

        if (isLiveContest(this.platform)) {
            this.renderState('live-contest');
            return;
        }

        // Trigger model load in the offscreen document
        this.port.postMessage({ action: "LOAD_MODEL" });
    }

    handlePortMessage(msg) {
        if (msg.type === "progress") {
            this.renderState('waking_up', msg.data.text || "Loading WebGPU Model...");
        } else if (msg.type === "loaded") {
            this.isModelLoaded = true;
            this.checkTutorial();
        } else if (msg.type === "error") {
            this.renderState('error', msg.reason);
        } else if (msg.type === "token") {
            this.appendToken(msg.text);
        } else if (msg.type === "done") {
            this.finishStreaming();
        } else if (msg.type === "retry") {
            this.renderState('waking_up', "Retrying... " + msg.reason);
        }
    }

    checkTutorial() {
        if (this.platform === 'leetcode') {
            this.renderState('ready'); // No local storage check needed for LeetCode
            return;
        }

        chrome.runtime.sendMessage({ action: "GET_TUTORIAL", payload: { contestId: this.contestId } }, (response) => {
            if (response && response.success) {
                this.tutorialProblems = response.data.problems;
                this.renderState('ready');
            } else {
                this.renderState('not-scanned');
            }
        });
    }

    renderState(state, extraData = null) {
        let topBarRight = '';
        if (state === 'checking') topBarRight = `<div class="status-dot dot-amber"></div><span class="status-label">Initializing</span>`;
        else if (state === 'waking_up') topBarRight = `<div class="status-dot dot-amber"></div><span class="status-label">Downloading</span>`;
        else if (state === 'ready' || state === 'streaming') topBarRight = `<div class="status-dot dot-green"></div><span class="status-label">Ready</span>`;
        else if (state === 'error' || state === 'not-scanned') topBarRight = `<div class="status-dot dot-red"></div><span class="status-label">Error</span>`;

        this.wrapper.innerHTML = `
            <div class="top-bar">
                <div class="brand">
                    <div class="brand-icon"><i class="ti ti-brain" style="font-size:13px;color:#fff;"></i></div>
                    <span class="brand-name">AlgoHint</span>
                </div>
                <div class="top-bar-right">
                    ${topBarRight}
                </div>
            </div>
            <div id="screen-content" style="display:flex; flex-direction:column; flex:1;"></div>
        `;

        const contentDiv = this.wrapper.querySelector('#screen-content');

        if (state === 'checking') {
            contentDiv.innerHTML = `
                <div class="error-content">
                    <div class="dl-title">Starting WebGPU...</div>
                    <div class="dl-sub">${extraData || 'Connecting to extension background...'}</div>
                </div>
            `;
        } else if (state === 'waking_up') {
            contentDiv.innerHTML = `
                <div class="download-content">
                    <div class="progress-ring-wrap">
                        <svg width="110" height="110" viewBox="0 0 110 110">
                            <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="7"/>
                            <circle cx="55" cy="55" r="46" fill="none" stroke="#7F77DD" stroke-width="7" stroke-dasharray="289" stroke-dashoffset="144" stroke-linecap="round"/>
                        </svg>
                        <div class="progress-center">
                            <i class="ti ti-download" style="font-size:24px; color:#e8e8e8;"></i>
                        </div>
                    </div>
                    <div class="dl-title">Downloading Model</div>
                    <div class="dl-sub">${extraData}</div>
                </div>
            `;
        } else if (state === 'live-contest' || state === 'not-scanned') {
            contentDiv.innerHTML = `
                <div class="error-content">
                    <div class="error-title">${state === 'live-contest' ? 'Live Contest' : 'Tutorial Not Scanned'}</div>
                    <div class="error-sub">${state === 'live-contest' ? 'Hints are disabled during live contests to prevent cheating.' : 'Please scan the tutorial page first.'}</div>
                </div>
            `;
        } else if (state === 'ready' || state === 'streaming') {
            const contextMeta = this.platform === 'leetcode' ? `LeetCode` : `Codeforces · ${this.contestId}`;
            const badgeClass = this.platform === 'leetcode' ? 'platform-badge lc' : 'context-badge';
            const contextBadge = this.platform === 'leetcode' ? this.titleSlug : `Problem ${this.problemIndex}`;

            contentDiv.innerHTML = `
                <div class="context-card" style="margin-top:10px;">
                    <div class="context-top">
                        <span class="context-meta">${contextMeta}</span>
                        <span class="${badgeClass}">${contextBadge}</span>
                    </div>
                    <div class="context-title">Ask for a Hint</div>
                </div>
                <div class="hint-level-row">
                    <button class="level-pill" data-level="1">Nudge</button>
                    <button class="level-pill" data-level="2">Observation</button>
                    <button class="level-pill" data-level="3">Math/Insight</button>
                    <button class="level-pill" data-level="4">Technique</button>
                </div>
                <div class="hint-zone" id="hint-zone">
                    ${state === 'ready'
                    ? `<div class="dl-sub" style="margin-top: 20px;">Select a level above to generate a hint.</div>`
                    : `
                            <div class="hint-card">
                                <div class="hint-card-label">Level ${extraData.level} hint</div>
                                <div class="hint-text" id="stream-text"><span class="cursor-blink"></span></div>
                            </div>
                            <div id="btn-container"></div>
                        `
                }
                </div>
                <div class="bottom-bar">
                    <span class="bottom-tip">Runs on your GPU · private</span>
                    <i class="ti ti-cpu" style="font-size:13px;color:#888;"></i>
                </div>
            `;

            this.wrapper.querySelectorAll('.level-pill').forEach(btn => {
                if (state === 'streaming' && extraData && extraData.level === parseInt(btn.dataset.level)) {
                    btn.classList.add('active');
                }
                btn.addEventListener('click', (e) => {
                    this.wrapper.querySelectorAll('.level-pill').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    this.generateHint(parseInt(e.target.dataset.level));
                });
            });
        } else if (state === 'error') {
            contentDiv.innerHTML = `
                <div class="error-content">
                    <div class="error-title">GPU Error</div>
                    <div class="error-sub">${extraData}</div>
                    <button class="get-hint-btn" id="back-btn" style="margin-top: 10px;">Go Back</button>
                </div>
            `;
            this.wrapper.querySelector('#back-btn').addEventListener('click', () => this.init());
        }
    }

    async generateHint(level) {
        this.renderState('streaming', { level });

        let payload;

        if (this.platform === 'leetcode') {
            const data = await fetchLeetCodePayload(this.titleSlug);
            payload = {
                platform: 'leetcode',
                title: data.title,
                difficulty: data.difficulty,
                problem_content: data.problemContent,
                editorial_content: data.editorialContent,
                editorial_source: data.editorialSource,
                problem_index: this.titleSlug,
                hint_level: level
            };
        } else {
            const specificEditorial = this.tutorialProblems[this.problemIndex] || this.tutorialProblems["ALL"] || "";
            payload = {
                platform: 'codeforces',
                problem_content: extractProblemHtml(),
                editorial_content: specificEditorial,
                problem_index: this.problemIndex,
                hint_level: level
            };
        }

        this.port.postMessage({ action: "GENERATE_HINT", payload });
    }

    appendToken(token) {
        const streamContainer = this.wrapper.querySelector('#stream-text');
        if (streamContainer) {
            streamContainer.innerText += token;
        }
    }

    finishStreaming() {
        const btnContainer = this.wrapper.querySelector('#btn-container');
        if (btnContainer) {
            btnContainer.innerHTML = `
                <div class="action-row" style="margin-top: 8px;">
                    <button class="action-btn" id="helpful-btn"><i class="ti ti-thumb-up" style="font-size:12px;"></i> Helpful</button>
                    <button class="action-btn" id="not-helpful-btn"><i class="ti ti-thumb-down" style="font-size:12px;"></i></button>
                    <button class="action-btn go-deeper" id="back-btn">Reset <i class="ti ti-refresh" style="font-size:11px;"></i></button>
                </div>
            `;
            this.wrapper.querySelector('#back-btn').addEventListener('click', () => this.renderState('ready'));

            // Remove cursor blink
            const blinker = this.wrapper.querySelector('.cursor-blink');
            if (blinker) blinker.remove();
        }
    }
}

// Bootstrapper
const parsed = parseUrl();
let sidebarInstance = null;
if (parsed) {
    sidebarInstance = new HintSidebar(parsed);
}

// SPA navigation watcher for LeetCode
if (PLATFORM === 'leetcode') {
    let lastSlug = getLeetCodeSlug();

    const observer = new MutationObserver(() => {
        const currentSlug = getLeetCodeSlug();

        if (currentSlug && currentSlug !== lastSlug) {
            lastSlug = currentSlug;
            // Re-initialize sidebar
            if (sidebarInstance) {
                sidebarInstance.container.remove();
            }
            const newParsed = parseUrl();
            if (newParsed) {
                sidebarInstance = new HintSidebar(newParsed);
            }
        }
    });

    observer.observe(document.querySelector('title') || document.head, { childList: true, subtree: true });
}
