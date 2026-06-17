from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import urllib.request
from graph import build_graph

app = FastAPI(title="AlgoHint Server")

# Allow requests from the browser extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since it's a browser extension, origin will be chrome-extension://... or *.codeforces.com
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class HintRequest(BaseModel):
    platform: str
    problem_content: str = Field(..., max_length=5_000_000, description="HTML of the problem page")
    editorial_content: str = Field(..., max_length=5_000_000, description="HTML of the specific problem's editorial")
    problem_index: str = Field(..., min_length=1, max_length=100, description="e.g. A, B1 or two-sum")
    hint_level: int = Field(..., ge=1, le=4, description="Hint level from 1 to 4")
    title: str | None = None
    difficulty: str | None = None
    editorial_source: str | None = None

@app.get("/health")
def health_check():
    try:
        # Check if the model exists locally, rather than if it's currently in RAM.
        # Ollama will automatically load it into RAM upon the first generation request.
        req = urllib.request.Request("http://127.0.0.1:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode())
            models = [m.get("name", "") for m in data.get("models", [])]
            # qwen2.5:0.5b or similar
            is_available = any("qwen2.5" in m for m in models)
            
            if is_available:
                return {"status": "READY"}
            else:
                return {"status": "DISCONNECTED", "detail": "qwen2.5 model not found in Ollama"}
    except Exception as e:
        return {"status": "DISCONNECTED", "detail": str(e)}

@app.post("/generate_hint")
async def generate_hint(request: HintRequest):
    print("=== RECEIVED NEW HINT REQUEST ===")
    print(f"Platform: {request.platform}")
    print(f"Title: {request.title}")
    print(f"Difficulty: {request.difficulty}")
    print(f"Editorial Source: {request.editorial_source}")
    print(f"Level: {request.hint_level}")
    print(f"Editorial Content:\n{request.editorial_content[:1000]}...")
    print("=================================")
    try:
        graph_app = build_graph()
        initial_state = {
            "platform": request.platform,
            "problem_title": request.title,
            "difficulty": request.difficulty,
            "editorial_source": request.editorial_source,
            "problem_html": request.problem_content,
            "editorial_html": request.editorial_content,
            "problem_index": request.problem_index,
            "hint_level": request.hint_level,
            "problem_statement": "",
            "problem_metadata": "",
            "editorial_text": "",
            "candidate_hint": "",
            "retry_counter": 0,
            "validation_passed": False,
            "rejection_reason": "",
            "final_output": ""
        }
        
        config = {"recursion_limit": 20}
        final_res = None
        
        for output in graph_app.stream(initial_state, config=config):
            for key, value in output.items():
                if "final_output" in value and value["final_output"]:
                    final_res = json.loads(value["final_output"])
                    
        if not final_res:
            raise HTTPException(status_code=500, detail="Graph execution failed to produce output.")
            
        return final_res

    except Exception as e:
        print(f"Error executing graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
