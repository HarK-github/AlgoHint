# parser.py

from bs4 import BeautifulSoup
import markdownify

def parse_problem_content(raw_content: str, platform: str) -> str:
    """
    Clean and normalize raw problem content from any platform.
    Returns plain text suitable for LLM context.
    """
    if platform == "leetcode":
        return parse_leetcode_content(raw_content)
    elif platform == "codeforces":
        return parse_codeforces_content(raw_content)
    else:
        raise ValueError(f"Unknown platform: {platform}")

def parse_leetcode_content(html: str) -> str:
    """
    LeetCode returns clean HTML from GraphQL.
    Strip tags, normalize whitespace. No Codeforces-specific hacks needed.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Remove any <pre> code blocks that contain raw constraint tables
    # (we don't want constraints in the hint context, just the problem body)
    for tag in soup.find_all("p", class_="example-block"):
        tag.decompose()

    text = soup.get_text(separator="\n").strip()
    # Collapse multiple blank lines
    import re
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text

def parse_codeforces_content(html: str) -> str:
    """
    Extracts the title, text, constraints, and tags of a Codeforces problem statement.
    """
    soup = BeautifulSoup(html, "html.parser")
    problem = soup.find("div", class_="problem-statement")
    if not problem:
        return "Problem statement not found."
    
    metadata_parts = []
    header = problem.find("div", class_="header")
    if header:
        time_limit = header.find("div", class_="time-limit")
        memory_limit = header.find("div", class_="memory-limit")
        if time_limit:
            metadata_parts.append(time_limit.get_text(strip=True))
        if memory_limit:
            metadata_parts.append(memory_limit.get_text(strip=True))
            
    tags = soup.find_all("span", class_="tag-box")
    tag_list = [t.get_text(strip=True) for t in tags]
    if tag_list:
        metadata_parts.append("Tags: " + ", ".join(tag_list))

    statement_text = problem.get_text(separator="\n", strip=True)
    return statement_text + "\n" + " | ".join(metadata_parts)

def parse_editorial_content(raw: str, source: str, problem_index: str = "") -> str:
    if not raw:
        return ""

    import re
    # ── Strip iframes entirely (LeetCode embeds code playgrounds as iframes) ──
    raw = re.sub(r'<iframe[^>]*>.*?</iframe>', '', raw, flags=re.DOTALL | re.IGNORECASE)
    raw = re.sub(r'<iframe[^>]*/>', '', raw, flags=re.IGNORECASE)

    # ── Strip LaTeX / MathJax ($$...$$ and $...$) ────────────────────────────
    raw = re.sub(r'\$\$[\s\S]*?\$\$', '[math]', raw)
    raw = re.sub(r'\$[^$\n]+\$', '[math]', raw)
    raw = re.sub(r'\\text\{[^}]*\}', '', raw)
    raw = re.sub(r'\\[a-zA-Z]+\{[^}]*\}', '', raw)  # any \command{...}

    # ── Strip markdown code fences (don't feed code to the hint model) ───────
    raw = re.sub(r'```[\s\S]*?```', '[code block omitted]', raw)
    raw = re.sub(r'`[^`\n]+`', '', raw)

    # ── Strip markdown headers, TOC, bold, italic ─────────────────────────────
    raw = re.sub(r'^#{1,6}\s+.*$', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\[TOC\]', '', raw)
    raw = re.sub(r'\*\*([^*]+)\*\*', r'\1', raw)
    raw = re.sub(r'\*([^*]+)\*', r'\1', raw)
    raw = re.sub(r'__([^_]+)__', r'\1', raw)

    # ── Strip HTML tags if any remain ─────────────────────────────────────────
    raw = BeautifulSoup(raw, "html.parser").get_text(separator="\n")

    # ── Strip image refs and links ────────────────────────────────────────────
    raw = re.sub(r'!\[.*?\]\(.*?\)', '', raw)
    raw = re.sub(r'\[.*?\]\(.*?\)', '', raw)

    # ── Collapse whitespace ───────────────────────────────────────────────────
    raw = re.sub(r'\n{3,}', '\n\n', raw)
    raw = re.sub(r'[ \t]+', ' ', raw)
    raw = raw.strip()

    return raw
