import os
import json
from graph import build_graph

def run_scenario(problem_html_path: str, editorial_html_path: str, problem_index: str, hint_level: int):
    with open(problem_html_path, "r", encoding="utf-8") as f:
        problem_html = f.read()
    with open(editorial_html_path, "r", encoding="utf-8") as f:
        editorial_html = f.read()
        
    app = build_graph()
    initial_state = {
        "problem_html": problem_html,
        "editorial_html": editorial_html,
        "problem_index": problem_index,
        "hint_level": hint_level,
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
    
    # Run the graph and stream output to extract final_output
    for output in app.stream(initial_state, config=config):
        for key, value in output.items():
            if "final_output" in value and value["final_output"]:
                final_res = json.loads(value["final_output"])
                
    return final_res

def main():
    problem_file = os.path.join(os.path.dirname(__file__), "..", "Problem - A - Codeforces.html")
    editorial_file = os.path.join(os.path.dirname(__file__), "..", "Codeforces Round 1098 (Div. 2) Editorial - Codeforces.html")
    
    # Save the mermaid diagram of the graph structure
    app = build_graph()
    try:
        png_data = app.get_graph().draw_mermaid_png()
        with open("graph_structure.png", "wb") as f:
            f.write(png_data)
        print("Saved graph_structure.png successfully.")
    except Exception as e:
        print(f"Failed to generate PNG: {e}")
        
    aggregated_output = {}
    
    # Generate all levels
    for level in [1, 2, 3, 4]:
        print(f"Generating hint at Level {level}...")
        res = run_scenario(problem_file, editorial_file, "A", hint_level=level)
        if res:
            aggregated_output[f"level_{level}"] = res
            
    print("\n" + "="*60)
    print("FINAL AGGREGATED HINTS (JSON)")
    print("="*60)
    print(json.dumps(aggregated_output, indent=2))
    
    # Save to a file for easy viewing
    with open("all_hints_output.json", "w") as f:
        json.dump(aggregated_output, f, indent=2)

if __name__ == "__main__":
    main()
