import { CreateMLCEngine } from "@mlc-ai/web-llm";

let engine = null;
let isLoaded = false;

// Pipeline Functions
function buildPrompt(level, editorial, problemIndex) {
    let instruction = "";
    if (level === 1) instruction = "Provide a high-level open question to guide the user towards the first observation. Do not give the answer.";
    if (level === 2) instruction = "Point out a key structural observation or invariant from the problem statement.";
    if (level === 3) instruction = "Provide the mathematical insight or specific algorithmic approach needed.";
    if (level === 4) instruction = "Name the exact algorithm or technique needed to solve the problem.";

    return `You are a competitive programming coach. You must follow the instruction strictly.
Context (Codeforces Problem ${problemIndex}):
${editorial}

Instruction:
${instruction}

Keep your answer to exactly one sentence. Do not include any code.`;
}

function runGuardrail(generatedText) {
    const forbidden = ["cin >>", "cout <<", "vector<", "#include", "int main", "O(N)"];
    for (let f of forbidden) {
        if (generatedText.includes(f)) {
            return { passed: false, reason: `Contains forbidden code leakage: ${f}` };
        }
    }
    return { passed: true };
}

async function generateHint(payload, port) {
    const { problem_html, editorial_clean_text, problem_index, hint_level } = payload;
    let retries = 0;
    
    while (retries < 3) {
        const prompt = buildPrompt(hint_level, editorial_clean_text, problem_index);
        
        try {
            const chunks = await engine.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                stream: true,
                temperature: 0.2,
            });

            let fullText = "";
            for await (const chunk of chunks) {
                const token = chunk.choices[0]?.delta?.content || "";
                fullText += token;
                port.postMessage({ type: 'token', text: token });
                
                // Keepalive during long generation
                port.postMessage({ type: 'keepalive' });
            }

            const guard = runGuardrail(fullText);
            if (guard.passed) {
                port.postMessage({ type: 'done', text: fullText });
                return;
            } else {
                port.postMessage({ type: 'retry', reason: guard.reason });
                retries++;
            }
        } catch (e) {
            port.postMessage({ type: 'error', reason: e.toString() });
            return;
        }
    }
    port.postMessage({ type: 'error', reason: "Failed to generate a hint without leaking code." });
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "offscreen-engine") {
        port.onMessage.addListener(async (msg) => {
            if (msg.action === "PING") {
                port.postMessage({ type: "PONG" });
            } else if (msg.action === "LOAD_MODEL") {
                if (!isLoaded) {
                    try {
                        engine = await CreateMLCEngine("Qwen2.5-0.5B-Instruct-q4f16_1-MLC", {
                            initProgressCallback: (progress) => {
                                port.postMessage({ type: 'progress', data: progress });
                            }
                        });
                        isLoaded = true;
                        port.postMessage({ type: 'loaded' });
                    } catch (e) {
                        port.postMessage({ type: 'error', reason: e.toString() });
                    }
                } else {
                    port.postMessage({ type: 'loaded' });
                }
            } else if (msg.action === "GENERATE_HINT") {
                if (!isLoaded) {
                    port.postMessage({ type: 'error', reason: "Model not loaded" });
                    return;
                }
                await generateHint(msg.payload, port);
            }
        });
    }
});
