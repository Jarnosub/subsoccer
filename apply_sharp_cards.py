import os
import re

files = [f for f in os.listdir('.') if f.endswith('.html') or f.endswith('.css')]

css_targets = [
    r'(\.pro-card-flipper[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.pro-card-front[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.pro-card-back[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.card-flipper[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.card-front[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.card-back[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.podium-card[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.card-inner-frame[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.pro-card[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)',
    r'(\.card[^{]*\{[^}]*?border-radius\s*:\s*)([^;]+)(;?)'
]

def replace_fn(match):
    before = match.group(1)
    # only replace if it's not 50% (circles)
    if '50%' in match.group(2):
        return match.group(0)
    return before + '2px' + match.group(3)

for fname in files:
    with open(fname, 'r') as f:
        content = f.read()
    
    orig = content
    for pattern in css_targets:
        content = re.sub(pattern, replace_fn, content)

    # Some cards are styled inline specifically in HTML tags like <div class="pro-card" style="... border-radius: 12px; ...">
    # Let's fix pro-card inline styles.
    def replace_inline(m):
        return m.group(1) + '2px' + m.group(3)
        
    content = re.sub(r'(class="pro-card"[^>]*?border-radius\s*:\s*)([^;]+)(;?)', replace_inline, content)

    if orig != content:
        with open(fname, 'w') as f:
            f.write(content)
        print(f"Updated {fname}")
