import re

files = ['auth.js', 'events-v3-final.js', 'match-service.js', 'tournament.js', 'live-view-service.js', 'instant-play.html', 'script.js']

for f_path in files:
    try:
        with open(f_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        new_lines = []
        for line in lines:
            # 1. Match full standalone lines of console.log/info/warn
            # e.g.: "    console.log('foo');\n" -> replace entirely
            cleaned = re.sub(r'^[ \t]*console\.(log|info|warn|debug)\(.*?\);?\s*\n$', '\n', line)
            
            # 2. Match inline instances if they still exist (e.g. inside a catch block)
            # e.g.: "} catch (e) { console.warn(e); }" -> "} catch (e) { /* log */ }"
            if 'console.' in cleaned:
                cleaned = re.sub(r'console\.(log|info|warn|debug)\([^)]*\);?', '/* log */', cleaned)
                
            new_lines.append(cleaned)
            
        with open(f_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
            
        print(f"Cleaned logs from {f_path}")
    except Exception as e:
        print(f"Error skipping {f_path}: {e}")
