import json
import os

filepath = '../scraped_reports.json'

if not os.path.exists(filepath):
    print("File not found.")
    exit(0)

with open(filepath, 'r', encoding='utf-8') as f:
    try:
        data = json.load(f)
    except Exception as e:
        print("Failed to load JSON:", e)
        exit(1)

# Sometimes strings are double encoded, we just dump them with ensure_ascii=False
# If they actually contain literal \u0130 in the text, we might need to encode/decode
def fix_string(s):
    if not isinstance(s, str):
        return s
    # if it literally contains '\u0130', etc.
    # We can try to decode unicode escapes if it's double encoded
    # A safe way is to encode as latin1 and decode as unicode-escape
    # But some might be raw utf-8, some might be literal \u
    if '\\u' in s:
        try:
            return s.encode('utf-8').decode('unicode_escape').encode('latin1').decode('utf-8')
        except:
            pass
    return s

def fix_dict(d):
    for k, v in d.items():
        if isinstance(v, str):
            d[k] = fix_string(v)
        elif isinstance(v, dict):
            fix_dict(v)
        elif isinstance(v, list):
            for i in range(len(v)):
                if isinstance(v[i], str):
                    v[i] = fix_string(v[i])
                elif isinstance(v[i], dict):
                    fix_dict(v[i])
    return d

if isinstance(data, list):
    for item in data:
        fix_dict(item)
elif isinstance(data, dict):
    fix_dict(data)

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("JSON file fixed.")
