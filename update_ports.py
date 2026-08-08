import os
import glob

# Search in both frontend and backend
paths = glob.glob('C:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/**/*.jsx', recursive=True) + \
        glob.glob('C:/Users/hakan/.gemini/antigravity/scratch/HisseRadarPro/**/*.py', recursive=True)

for path in paths:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace('8013', '8014')
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {path}")
print("Done!")
