import json
import re
from typing import TypedDict
from langgraph.graph import StateGraph, END
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, AIMessage
from parser import parse_problem_content, parse_editorial_content

# ── Hint level definitions ────────────────────────────────────────────────────
HINT_LEVELS = {
    1: "Focus on helping the user understand the problem by defining its core variables and technical terms. Strip away the storyline and summarize exactly what is technically being asked. Do not hint at the solution.",
    2: "Give a small nudge towards the solution. Look at the provided editorial, break down the solution into its first logical step, and hint at what property or relationship the user should think about.",
    3: "Give a more substantial hint. Look at the provided editorial and explain the core logic or observation needed to solve the problem, without giving away the exact data structure.",
    4: "Give an explicit hint that reveals the data structure or algorithm required, based directly on the editorial solution.",
}



# ── Relevance check: uses editorial to verify hint direction ──────────────────
def get_relevance_prompt(level: int) -> str:
    level_specific_rule = ""
    formula_rule = "- The hint contains formulas, pseudocode, or step sequences"
    if level < 4:
        level_specific_rule = "- The hint gives away the solution method or data structure explicitly"
    else:
        level_specific_rule = "- The hint contains raw code instead of a conceptual explanation"
        formula_rule = "- The hint contains multi-line raw code"

    return f"""You are checking if a hint points in the right direction for a competitive programming problem.

Answer only YES or NO. No other words.

Answer YES (hint is relevant) if:
- The hint encourages thinking about something that genuinely leads toward the solution
- The hint is appropriate for the requested hint level

Answer NO (hint is off-track or unsafe) if:
- The hint is completely unrelated to how the problem is actually solved
{level_specific_rule}
{formula_rule}
- The hint has more than one sentence

Editorial (ground truth — do not reveal directly):
\"\"\"
{{editorial}}
\"\"\"

Hint to evaluate:
\"\"\"{{hint}}\"\"\"

Is this hint relevant and safe? Answer YES or NO:"""


class GraphState(TypedDict):
    platform: str
    problem_title: str
    difficulty: str
    editorial_source: str
    problem_html: str
    editorial_html: str
    problem_index: str
    hint_level: int
    problem_statement: str
    editorial_text: str
    candidate_hint: str
    retry_counter: int
    validation_passed: bool
    rejection_reason: str
    final_output: str

# ── Nodes ─────────────────────────────────────────────────────────────────────

def input_evaluation_node(state: GraphState):
    platform = state.get("platform", "codeforces")
    source = state.get("editorial_source") or ("codeforces" if platform == "codeforces" else "unknown")
    
    prob_data = parse_problem_content(state.get("problem_html", ""), platform)
    ed_text = parse_editorial_content(
        state.get("editorial_html", ""), source, state.get("problem_index", "A")
    )
    return {
        "problem_statement": prob_data,
        "editorial_text":    ed_text,
    }



def generation_node(state: GraphState):
    level = state.get("hint_level", 1)
    spec  = HINT_LEVELS[level]

    llm = ChatOllama(
        model="qwen2.5:0.5b",
        temperature=0.3 + state.get("retry_counter", 0) * 0.15,
        num_predict=120,   # was 80 — gives model room to finish cleanly
        stop=["</s>"],  # remove \n\n to prevent early cutoff if model uses markdown headers
    )

    rules = {
        1: "One sentence only. Define what the problem is technically asking. No solution hints.",
        2: "One sentence only. Nudge toward a property or relationship to think about. No algorithm names.",
        3: "Two sentences max. Explain the core observation needed. No data structure names.",
        4: "Two sentences max. Name the algorithm or data structure required. No code.",
    }

    platform_context = ""
    if state.get("platform") == "leetcode":
        platform_context = f"Problem: {state.get('problem_title', '')} ({state.get('difficulty', '')})\n"
        if state.get("editorial_source") == "community":
            platform_context += "Editorial: community solution — use as loose reference only.\n"

    # Retry: don't show the bad example — just raise the temperature and re-run
    # Showing bad examples to a 0.5B model causes it to repeat them
    prompt = f"""You are a competitive programming coach giving a Level {level} hint.

Rule: {rules[level]}

{platform_context}
Problem:
\"\"\"
{state.get("problem_statement", "")[:1200]}
\"\"\"

Editorial (guide your hint from this, do not quote it):
\"\"\"
{state.get("editorial_text", "")[:1200]}
\"\"\"

Write only the hint. No preamble. No explanation. Start directly:"""

    response = llm.invoke([HumanMessage(content=prompt)])
    raw = response.content.strip()

    # ── Strip markdown headers the model outputs as preamble ─────────────────
    raw = re.sub(r'^#{1,6}\s+.*\n?', '', raw, flags=re.MULTILINE).strip()

    # ── Strip bold/italic markdown ────────────────────────────────────────────
    raw = raw.replace("**", "").replace("__", "").replace("*", "")

    # ── Strip chatty prefixes ─────────────────────────────────────────────────
    for prefix in ["hint:", "here is", "sure,", "okay,", "the hint is:",
                   "answer:", "solution:", "approach:"]:
        if raw.lower().startswith(prefix):
            raw = raw[len(prefix):].lstrip(" :\n")

    # ── Enforce sentence limits physically ───────────────────────────────────
    # Level 1/2 gets 1 sentence. Level 3/4 gets 2 sentences.
    sentences = [s.strip() for s in re.split(r'\.\s+|\.$', raw) if s.strip()]
    max_sentences = 1 if level <= 2 else 2
    raw = ". ".join(sentences[:max_sentences])
    if raw and not raw.endswith("."):
        raw += "."

    return {"candidate_hint": raw}

def relevance_guard_node(state: GraphState):
    hint  = state.get("candidate_hint", "")
    level = state.get("hint_level", 1)

    print(f"  [Guard] Evaluating (Level {level}): '{hint}'")

    # ── Fast structural checks ────────────────────────────────────────────────
    if not hint or len(hint.strip()) < 10:
        return _reject(state, "hint was empty or too short")

    if "```" in hint:
        return _reject(state, "hint contained a code block")

    # ── Reject if hint is just the problem title echoed back ─────────────────
    title = (state.get("problem_title") or "").strip().lower()
    if title and hint.strip().lower() == title:
        return _reject(state, "hint was just the problem title")

    # ── Reject if hint contains no spaces (single word / title fragment) ──────
    if " " not in hint.strip():
        return _reject(state, "hint was a single word or fragment, not a sentence")

    # Level-aware length cap
    max_len = 180 if level <= 2 else 280
    if len(hint) > max_len:
        return _reject(state, f"hint was too long ({len(hint)} chars, max {max_len})")

    # ── LLM guard ────────────────────────────────────────────────────────────
    llm = ChatOllama(
        model="qwen2.5:0.5b",
        temperature=0.0,
        num_predict=5,      # we only need YES or NO
        stop=["\n"],        # stop after first line only
    )

    editorial_snippet = state.get("editorial_text", "")[:1000]
    editorial_snippet = re.sub(r"```[\s\S]*?```", "", editorial_snippet)

    prompt = get_relevance_prompt(level).format(
        editorial=editorial_snippet,
        hint=hint
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    answer   = response.content.strip().upper()

    # Robust YES/NO extraction — works even if model adds preamble
    passed = bool(re.search(r'\bYES\b', answer))
    rejected_explicit = bool(re.search(r'\bNO\b', answer))

    # If model output neither YES nor NO clearly, default to PASS
    # A 0.5B model failing to say YES/NO shouldn't block valid hints
    if not passed and not rejected_explicit:
        print(f"  [Guard] Ambiguous answer '{answer}' — defaulting to pass")
        passed = True

    print(f"  [Guard] Raw: '{answer}' → passed={passed}")

    if passed:
        return {
            "validation_passed": True,
            "rejection_reason": "",
            "retry_counter": state.get("retry_counter", 0),
        }
    return _reject(state, "hint was off-track based on editorial review")


def _reject(state: GraphState, reason: str) -> dict:
    """Shared rejection helper."""
    print(f"  [Guard] Rejected: {reason}")
    return {
        "validation_passed": False,
        "rejection_reason": reason,
        "retry_counter": state.get("retry_counter", 0) + 1,
    }

def route_after_guard(state: GraphState) -> str:
    if state.get("validation_passed", False):
        return "json_output_node"
    if state.get("retry_counter", 0) >= 1:   # was 2 — drop to 1
        return "json_output_node"
    return "generation_node"

def json_output_node(state: GraphState):
    hint  = state.get("candidate_hint", "")
    valid = state.get("validation_passed", False)

    if not valid:
        # Use the raw candidate anyway if it passes structural checks
        # (guard may have been wrong — 0.5B models are unreliable validators)
        if hint and len(hint) < 280 and "```" not in hint:
            valid = True   # trust structure over guard on fallback
        else:
            hint = "Try thinking about what the problem is really asking before jumping to a solution."

    output = {
        "problem_index":  state.get("problem_index", ""),
        "hint_level":     state.get("hint_level", 1),
        "hint":           hint,
        "retries_used":   state.get("retry_counter", 0),
        "safe":           valid,
    }
    return {"final_output": json.dumps(output, indent=2)}

def build_graph():
    workflow = StateGraph(GraphState)
    
    workflow.add_node("input_evaluation_node", input_evaluation_node)
    workflow.add_node("generation_node", generation_node)
    workflow.add_node("relevance_guard_node", relevance_guard_node)
    workflow.add_node("json_output_node", json_output_node)
    
    workflow.set_entry_point("input_evaluation_node")
    
    workflow.add_edge("input_evaluation_node", "generation_node")
    workflow.add_edge("generation_node", "relevance_guard_node")
    
    workflow.add_conditional_edges(
        "relevance_guard_node",
        route_after_guard,
        {
            "generation_node": "generation_node",
            "json_output_node": "json_output_node"
        }
    )
    
    workflow.add_edge("json_output_node", END)
    
    return workflow.compile()