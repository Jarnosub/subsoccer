import re
import glob

files = glob.glob('*.js')

for f_path in files:
    try:
        with open(f_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content.replace('e => /* log */', 'e => { /* log */ }')
        
        with open(f_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    except Exception as e:
        print(f"Error {f_path}: {e}")
