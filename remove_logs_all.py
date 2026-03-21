import re
import glob
import os

files = glob.glob('*.js')

for f_path in files:
    try:
        with open(f_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        new_lines = []
        for line in lines:
            # 1. Match full standalone lines of console.log/info/warn
            cleaned = re.sub(r'^[ \t]*console\.(log|info|warn|debug)\(.*?\);?\s*\n$', '\n', line)
            
            # 2. Match inline instances if they still exist (e.g. inside a catch block)
            if 'console.' in cleaned:
                cleaned = re.sub(r'console\.(log|info|warn|debug)\([^)]*\);?', '/* log */', cleaned)
                
            new_lines.append(cleaned)
            
        with open(f_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
            
        print(f"Cleaned logs from {f_path}")
    except Exception as e:
        print(f"Error skipping {f_path}: {e}")
