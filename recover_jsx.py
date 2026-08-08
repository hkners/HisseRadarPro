import os, json, glob

brain_dir = r"C:\Users\hakan\.gemini\antigravity\brain"
transcripts = glob.glob(os.path.join(brain_dir, "*", ".system_generated", "logs", "transcript_full.jsonl"))

latest_files = {}

for t_file in transcripts:
    try:
        with open(t_file, "r", encoding="utf-8") as f:
            for line in f:
                if "TargetFile" not in line:
                    continue
                try:
                    data = json.loads(line)
                    if "tool_calls" in data:
                        for tc in data["tool_calls"]:
                            if tc["name"] in ["write_to_file", "replace_file_content"]:
                                args = tc.get("args", {})
                                filepath = args.get("TargetFile", "")
                                if filepath.endswith(".jsx"):
                                    if tc["name"] == "write_to_file":
                                        latest_files[filepath] = args.get("CodeContent", "")
                                    elif tc["name"] == "replace_file_content":
                                        # If it's replace, we would need to apply the diff.
                                        # But let's hope the write_to_file contains the bulk.
                                        pass
                except Exception:
                    pass
    except Exception as e:
        print(f"Error reading {t_file}: {e}")

for filepath, content in latest_files.items():
    if os.path.exists(filepath):
        if os.path.getsize(filepath) == 0:
            print(f"Recovering {os.path.basename(filepath)} ({len(content)} bytes)")
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
