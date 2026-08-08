import os
import re

main_path = r"C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\backend\main.py"
with open(main_path, "r", encoding="utf-8") as f:
    code = f.read()

endpoints = re.findall(r"@app\.(get|post|put|delete)\([\"']([^\"']+)[\"']", code)
print("Found endpoints in main.py:")
for method, path in endpoints:
    print(f"  {method.upper():6s} {path}")
