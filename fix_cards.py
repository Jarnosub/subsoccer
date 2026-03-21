import os, re
files = [f for f in os.listdir('.') if f.endswith('.html') or f.endswith('.css')]
for fname in files:
    with open(fname, 'r') as f:
        content = f.read()

    # Regex to find CSS blocks containing card-related classes
    # We want to match: starting with a card-class selector, { class body containing border-radius }, and replace it.
    
    def replacer(match):
        block = match.group(0)
        # replace border-radius: XXpx or rem with 2px
        new_block = re.sub(r'(border-radius\s*:\s*)\d+[a-zA-Z%]+', r'\g<1>2px', block)
        return new_block

    pattern = r'(?m)^[ \t]*([.#a-zA-Z0-9_-]*(?:card|pro-card)[a-zA-Z0-9_-]*(?:\s*,\s*[.#a-zA-Z0-9_-]+)*)[ \t]*\{[^}]*\}'
    
    new_content = re.sub(pattern, replacer, content)

    # Some cards are styled inline: style="... border-radius: 15px;"
    # Let's just find inline styles for elements with class="pro-card" etc.
    # Actually, Topps and physical cards have VERY sharp corners. 2px is perfect.
    
    # We will just do a simple line-by-line parser as before to be safe.
    
    lines = content.split('\n')
    new_lines = []
    in_block = False
    
    for line in lines:
        if '{' in line:
            if 'card' in line.lower():
                in_block = True
                
        if in_block and 'border-radius:' in line:
            line = re.sub(r'(border-radius\s*:\s*)[^;]+', r'\g<1>2px', line)
            
        if '}' in line:
            in_block = False
            
        new_lines.append(line)
        
    final_content = '\n'.join(new_lines)
        
    if final_content != content:
        with open(fname, 'w') as f:
            f.write(final_content)
        print("Updated", fname)
