import os
import re

files = [f for f in os.listdir('.') if f.endswith('.html') or f.endswith('.css')]
card_classes = ['.card-flipper', '.card-front', '.card-back', 
                '.pro-card-flipper', '.pro-card-front', '.pro-card-back',
                '.podium-card']

for fname in files:
    with open(fname, 'r') as f:
        lines = f.readlines()
    
    in_target_block = False
    changed = False
    new_lines = []
    
    for line in lines:
        # Check if we are starting a block with a card class
        if any(cls in line for cls in card_classes) and '{' in line:
            in_target_block = True
        elif any(cls in line for cls in card_classes) and ',' in line and '{' not in line:
            # Multi-line selector
            in_target_block = True
            
        if in_target_block and 'border-radius:' in line:
            # Found a border radius inside a card block
            original = line
            # We want sharp corners (2px for a tiny tiny bit of anti-aliasing, or 0)
            line = re.sub(r'border-radius:\s*\d+px', 'border-radius: 2px', line)
            
            if original != line:
                changed = True
                
        if '{' in line and not any(cls in line for cls in card_classes):
            # Started a different block
            # we only care if it's NOT a card class, and if so we leave target block?
            # actually if we see '{' and we are already in_target_block, we stay.
            pass
            
        if '}' in line:
            in_target_block = False
        
        new_lines.append(line)
        
    if changed:
        with open(fname, 'w') as f:
            f.writelines(new_lines)
        print(f"Updated {fname}")
