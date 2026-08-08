import os, json, glob
brain_dir = r"C:\Users\hakan\.gemini\antigravity\brain"
transcripts = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript_full.jsonl"))

latest_main = ""
latest_time = ""

for t_file in transcripts:
    try:
        with open(t_file, "r", encoding="utf-8") as f:
            for line in f:
                if "main.py" not in line:
                    continue
                try:
                    data = json.loads(line)
                    if "tool_calls" in data:
                        for tc in data["tool_calls"]:
                            if tc["name"] in ["write_to_file", "replace_file_content"]:
                                args = tc.get("args", {})
                                if "main.py" in args.get("TargetFile", ""):
                                    if tc["name"] == "write_to_file":
                                        latest_main = args.get("CodeContent", "")
                                        latest_time = data.get("created_at")
                except:
                    pass
    except Exception as e:
        print(f"Error reading {t_file}: {e}")

if latest_main:
    with open("main_recovered.py", "w", encoding="utf-8") as f:
        f.write(latest_main)
    print(f"Recovered main.py from {latest_time} (length: {len(latest_main)})")
else:
    print("Could not find full write of main.py")
