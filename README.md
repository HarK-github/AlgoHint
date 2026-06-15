
<div align="center">
  
 # AlgoHint: Codeforces & LeetCode AI Hint Generator


**A browser extension and local AI backend that generates progressive, rubric-enforced hints for competitive programming problems**
  
</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation Guide](#installation-guide)
  - [Step 1: Set Up the Local Backend](#step-1-set-up-the-local-backend)
  - [Step 2: Run the Backend Server](#step-2-run-the-backend-server)
  - [Step 3: Install the Browser Extension](#step-3-install-the-browser-extension)
- [Usage Guide](#usage-guide)
  - [Using with LeetCode (Automatic)](#using-with-leetcode-automatic)
  - [Using with Codeforces (Manual Scan)](#using-with-codeforces-manual-scan)
  - [Hint Levels Explained](#hint-levels-explained)
- [Security & Privacy](#security--privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

AlgoHint is a privacy-first, offline-capable hint generation system designed for competitive programming enthusiasts. By leveraging a local LLM and LangGraph orchestration, it provides intelligent, progressive hints that help you learn problem-solving techniques without spoiling the complete solution. The system works seamlessly across both Codeforces and LeetCode platforms, ensuring you get the right nudge at the right time.

---

## Features

- **Cross-Platform Support**: Works seamlessly on both Codeforces and LeetCode problem pages.
- **Local AI Privacy**: Powered entirely by a local LLM (`qwen2.5:0.5b` via Ollama), ensuring zero data leakage and 100% offline hint generation.
- **Progressive Hint Levels**: 4 distinct levels of hints ranging from abstract open-ended nudges (L1) to specific technique names (L4).
- **Intelligent Anti-Spoiler Guard**: An LLM-based verification node evaluates each generated hint against a strict per-level rubric to ensure it never gives away the exact code or steps prematurely.
- **Automatic LeetCode Data Fetching**: Utilizes LeetCode's public GraphQL API to dynamically fetch problem statements, official editorials, or top community solutions (if premium-locked) without requiring any manual scanning.
- **Live Contest Anti-Cheat**: For Codeforces, hint generation is intentionally disabled during active live contests to prevent cheating.

---

## Architecture

<div align="center">

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Extension                       │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐ │
│  │  Shadow DOM  │    │  LeetCode    │    │  Codeforces     │ │
│  │  Hint        │    │  GraphQL     │    │  Tutorial       │ │
│  │  Sidebar     │◄───┤  Fetcher     │    │  Extractor      │ │
│  └──────────────┘    └──────────────┘    └─────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Server                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    LangGraph Pipeline                    │  │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────┐│  │
│  │  │  Input  │───►│  Hint   │───►│ Safety  │───►│Output ││  │
│  │  │  Node   │    │  Gen    │    │  Guard  │    │ Node  ││  │
│  │  └─────────┘    └─────────┘    └─────────┘    └───────┘│  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Ollama (qwen2.5:0.5b)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

</div>

---

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Python 3.10+** - For running the backend server
2. **Ollama** - You must have [Ollama installed](https://ollama.com/) and running on your machine
3. **Chrome, Edge, or Brave Browser** - For installing the browser extension

---

## Installation Guide

### Step 1: Set Up the Local Backend

Before the extension can generate hints, you need to run the local FastAPI server.

1. Open your terminal and navigate to the project backend directory:
   ```bash
   cd local_dev
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows, use `.venv\Scripts\activate`
   ```

3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   pip install fastapi uvicorn pydantic bs4 markdownify
   ```

4. Ensure Ollama has the correct model downloaded:
   ```bash
   ollama pull qwen2.5:0.5b
   ```

### Step 2: Run the Backend Server

With your virtual environment activated, start the FastAPI server:
```bash
python server.py
```
You should see Uvicorn start on `http://127.0.0.1:8000`. Leave this terminal running in the background.

### Step 3: Install the Browser Extension

1. Open your Chromium-based browser (Chrome, Edge, Brave).
2. Go to the extensions management page:
   - Chrome: Navigate to `chrome://extensions/`
   - Edge: Navigate to `edge://extensions/`
3. Turn on **Developer Mode** (usually a toggle in the top right corner).
4. Click the **Load unpacked** button.
5. Select the `extension` folder from your cloned repository.

The extension is now installed and active!

---

## Usage Guide

### Using with LeetCode (Automatic)

LeetCode integration is fully automatic:

1. Navigate to any LeetCode problem page (e.g., `/problems/two-sum/`).
2. The AlgoHint Sidebar will automatically appear. The extension fetches the problem statement and the official editorial (or top community solution) via GraphQL in the background.
3. Select your desired hint level to generate a hint.

### Using with Codeforces (Manual Scan)

Because the AI needs the editorial to verify that its hints are helpful and relevant, you must first "scan" the tutorial for the contest you are practicing:

1. Go to any Codeforces Tutorial/Editorial page (e.g., [Codeforces Round 1098 Editorial](https://codeforces.com/blog/entry/139366)).
2. Click the new AlgoHint extension icon in your browser toolbar.
3. Click **1. Extract Page**. You will see a small preview of the text.
4. Click **2. Store Tutorial**. The extension saves the editorial to your local browser storage.
5. Navigate to a problem page for that contest (e.g., `/contest/1098/problem/A`).
6. You will automatically see the sidebar appear in the bottom right corner of the page.

### Hint Levels Explained

Select your desired hint level in the sidebar:

| Level | Name | Description |
|-------|------|-------------|
| **L1** | Open Question | Most abstract - broad, thought-provoking questions |
| **L2** | Structural Observation | Focuses on data structures and patterns |
| **L3** | Math/Insight | Mathematical properties and key insights |
| **L4** | Technique Name | Most revealing - names the specific algorithm/technique |

Wait a few seconds while your local AI generates and verifies the hint against its safety rubrics. The result will appear directly in the sidebar!

---

## Security & Privacy

AlgoHint prioritizes your privacy and security:

- **Zero Data Leakage**: All hint generation happens locally on your machine
- **Offline Operation**: No external API calls - everything runs through your local Ollama instance
- **Live Contest Protection**: Automatic detection and disabling of hints during active Codeforces contests
- **Anti-Spoiler Guard**: Multi-stage verification ensures hints never reveal complete solutions

---

## Troubleshooting

### Common Issues and Solutions

**Issue**: Backend not starting
- **Solution**: Ensure Python 3.10+ is installed and all dependencies are correctly installed

**Issue**: Extension not appearing on LeetCode
- **Solution**: Refresh the page and ensure the backend server is running

**Issue**: "Tutorial not found" on Codeforces
- **Solution**: Make sure you've extracted and stored the tutorial from the editorial page

**Issue**: Model not found error
- **Solution**: Run `ollama pull qwen2.5:0.5b` to download the model

**Issue**: Sidebar not showing
- **Solution**: Check that the backend is running on `http://127.0.0.1:8000` and reload the page

---

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Setup

For development, you can run the backend in debug mode:
```bash
uvicorn server:app --reload
```

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<div align="center">

**Made with ❤️ by Harshit Kandpal**

[Report Bug](https://github.com/yourusername/algo-hint/issues) · [Request Feature](https://github.com/yourusername/algo-hint/issues)

</div>