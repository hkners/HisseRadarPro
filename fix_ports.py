import os
import re

d1 = r'C:\Users\hakan\.gemini\antigravity\scratch\HisseRadarPro\frontend\src\pages'
for f in os.listdir(d1):
    if f.endswith('.jsx'):
        path = os.path.join(d1, f)
        with open(path, 'r', encoding='utf-8') as file:
            content = file.read()
            
        new_content = re.sub(r'http://localhost:\d+', 'http://localhost:8015', content)
        
        with open(path, 'w', encoding='utf-8') as file:
            file.write(new_content)
            
print("Ports updated to 8015 safely.")
