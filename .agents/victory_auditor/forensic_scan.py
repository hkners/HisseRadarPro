import os
import re

ROOT_DIR = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro"
TARGET_DIRS = ["backend", "frontend/src"]

patterns = [
    (r"return\s+\[\s*\{\s*\"ticker\"\s*:", "Hardcoded report dictionary return"),
    (r"return\s+[\"'](?:SUCCESS|PASS|OK)[\"']", "Hardcoded success string return"),
    (r"def\s+\w+\([^)]*\):\s*pass\b", "Empty function body (pass)"),
    (r"def\s+\w+\([^)]*\):\s*return\s+(?:True|False|None|\d+|\"\"|\[\]|\{\})\s*$", "Stub function return"),
    (r"mock", "Mock keyword usage"),
    (r"dummy", "Dummy keyword usage"),
    (r"fake", "Fake keyword usage"),
    (r"hardcoded", "Hardcoded keyword usage"),
]

print("=== FORENSIC SCAN RESULTS ===")

for tdir in TARGET_DIRS:
    full_tdir = os.path.join(ROOT_DIR, tdir)
    for root, dirs, files in os.walk(full_tdir):
        if "__pycache__" in root or "node_modules" in root:
            continue
        for file in files:
            if file.endswith((".py", ".jsx", ".js", ".ts", ".tsx")):
                filepath = os.path.join(root, file)
                relpath = os.path.relpath(filepath, ROOT_DIR)
                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines, 1):
                        for pat, desc in patterns:
                            if re.search(pat, line, re.IGNORECASE):
                                # Filter out legitimate test comments or variable names if appropriate, but print for manual inspection
                                print(f"[{desc}] {relpath}:{idx} -> {line.strip()}")
                except Exception as e:
                    print(f"Error reading {relpath}: {e}")
