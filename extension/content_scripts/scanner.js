// Scanner logic to extract editorial HTML with MathJax preservation and Problem Chunking

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "EXTRACT_TUTORIAL") {
        try {
            // Check if we are on an editorial/blog page
            if (!window.location.href.includes('/blog/entry') && !window.location.href.includes('/tutorial')) {
                sendResponse({ success: false, error: "Not a valid tutorial page. URL must contain /blog/entry or /tutorial" });
                return;
            }

            // Extract the main content area of the tutorial
            const typographyDivs = document.querySelectorAll('.ttypography');
            if (typographyDivs.length === 0) {
                sendResponse({ success: false, error: "Could not find .ttypography content div." });
                return;
            }

            // Clone the container to manipulate safely
            let contentContainer = typographyDivs[0].cloneNode(true);

            // Phase 1: MathJax Preservation
            // Codeforces MathJax elements often have script tags with type="math/tex" or type="math/tex; mode=display"
            const mathJaxScripts = contentContainer.querySelectorAll('script[type^="math/tex"]');
            mathJaxScripts.forEach(script => {
                const tex = script.innerText || script.textContent;
                const isDisplay = script.type.includes('mode=display');
                // CF uses $$$ for both inline and display often, or $ and $$
                const rawTex = isDisplay ? `$$$${tex}$$$` : `$${tex}$`; 
                
                // Replace the parent MathJax wrapper if it exists
                const wrapper = script.previousElementSibling;
                if (wrapper && wrapper.classList && (wrapper.classList.contains('MathJax') || wrapper.classList.contains('MathJax_Display'))) {
                    wrapper.outerHTML = rawTex;
                } else {
                    script.outerHTML = rawTex;
                }
            });

            // Remove any leftover MathJax elements that were already processed
            contentContainer.querySelectorAll('.MathJax, .MathJax_Display').forEach(el => el.remove());

            // Get Contest ID
            let contestId = "unknown";
            const links = document.querySelectorAll('a[href*="/contest/"]');
            for (let link of links) {
                const match = link.href.match(/\/contest\/(\d+)/);
                if (match) {
                    contestId = match[1];
                    break;
                }
            }
            
            if (contestId === "unknown") {
                const manualId = prompt("Could not automatically detect Contest ID. Please enter the Contest ID (e.g., 1098):");
                if (manualId && !isNaN(manualId)) {
                    contestId = manualId.trim();
                } else {
                    sendResponse({ success: false, error: "Contest ID is required to store the tutorial." });
                    return;
                }
            }

            // Phase 2: Problem Chunking
            let problems = {};
            let currentProblem = null;
            let currentContent = [];
            
            // Iterate over top-level children
            for (let i = 0; i < contentContainer.children.length; i++) {
                const child = contentContainer.children[i];
                
                // Check if this is a header linking to a problem
                const link = child.querySelector('a[href*="/problem/"]');
                if ((child.tagName === 'H3' || child.tagName === 'H4' || child.tagName === 'H5') && link) {
                    // Save previous problem
                    if (currentProblem && currentContent.length > 0) {
                        problems[currentProblem] = currentContent.map(el => el.outerHTML).join('\n');
                    }
                    
                    // Extract problem index from link e.g. /contest/2228/problem/A
                    const match = link.href.match(/\/problem\/([A-Z0-9]+)/i);
                    if (match) {
                        currentProblem = match[1];
                        currentContent = [child];
                    } else {
                        currentProblem = null;
                    }
                } else {
                    if (currentProblem) {
                        currentContent.push(child);
                    }
                }
            }
            
            // Save the last problem
            if (currentProblem && currentContent.length > 0) {
                problems[currentProblem] = currentContent.map(el => el.outerHTML).join('\n');
            }

            // Fallback: If no problems were successfully chunked, store the entire blob under "ALL"
            if (Object.keys(problems).length === 0) {
                problems["ALL"] = contentContainer.outerHTML;
            }

            sendResponse({
                success: true,
                data: {
                    contestId: contestId,
                    problems: problems
                }
            });
            
        } catch (err) {
            sendResponse({ success: false, error: err.toString() });
        }
    }
    return true;
});
