import pandas as pd
import re
import math

file_path = 'Subsoccer sarjanumerot.xlsx'
output_sql = 'database/10000_inserted_hardware.sql'

xl = pd.ExcelFile(file_path)

all_hardware = []
# tuples of (serial, category, model, batch)

def clean_prefix(s):
    if not isinstance(s, str): return ""
    # remove 'Serial number model: '
    s = re.sub(r'(?i)Serial number model:\s*', '', s)
    # remove ' (code below)' case insensitive
    s = re.sub(r'(?i)\s*\(code below\)', '', s)
    # remove ending xxxx or XXXXX
    s = re.sub(r'(?i)x+$', '', s)
    return s.strip()

for sheet_name in xl.sheet_names:
    print(f"Parsing sheet: {sheet_name}")
    
    # Determine model and category based on sheet name
    model = sheet_name.strip()
    category = 'table'
    if 'Dock' in model:
        category = 'dock'
        
    df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
    
    for col_idx in df.columns:
        col_data = df[col_idx].tolist()
        
        # Find where the codes start. A code is usually a short string 4-10 chars.
        # But we need to find the prefix cell which is usually exactly BEFORE the codes.
        
        prefix = ""
        batch = ""
        
        # Scrape top headers to guess batch (row 0 to ~10)
        for val in col_data[:15]:
            if isinstance(val, str) and 'PO' in val:
                # trying to extract PO number like PO97, PO108
                match = re.search(r'(PO\d+)', val)
                if match:
                    batch = match.group(1)
                    
        # Find the prefix definition
        start_row = -1
        for i, val in enumerate(col_data[:50]):
            if isinstance(val, str):
                if '(code below)' in val or '-XXXX' in val or '-xxxx' in val or 'xxxx' in val:
                    prefix = clean_prefix(val)
                    start_row = i + 1
                    break
                    
        # If we couldn't find a standard marker, look for the first 4-8 char code that has nothing but letters/numbers
        if start_row == -1:
            for i, val in enumerate(col_data[:50]):
                if isinstance(val, str) and 3 <= len(str(val).strip()) <= 10 and re.match(r'^[A-Za-z0-9!@#$%^&*()_+]+$', str(val).strip()):
                    # check if previous row is string
                    if i > 0 and isinstance(col_data[i-1], str):
                        prefix = clean_prefix(col_data[i-1])
                    start_row = i
                    break
                    
        if start_row != -1 and prefix != "":
            # Parse codes down that column
            valid_codes_found = 0
            for val in col_data[start_row:]:
                if pd.isna(val): continue
                # if there is a space, maybe grab first string (e.g. "aL1cXN HUOM! varattu")
                code_str = str(val).split(' ')[0].strip()
                if len(code_str) >= 2 and len(code_str) <= 12: # standard codes
                    full_serial = prefix + code_str
                    all_hardware.append((full_serial, category, model, batch))
                    valid_codes_found += 1
            print(f"  Col {col_idx}: found prefix '{prefix}', batch '{batch}', {valid_codes_found} codes")

# Generate SQL
sql_header = """
-- AUTO-GENERATED SQL INSERT FOR SUBSOCCER HARDWARE REGISTRY
-- Total Devices: {count}
BEGIN;

INSERT INTO public.hardware_registry (serial_number, product_category, product_model, batch_id, is_claimed)
VALUES 
"""

print(f"Total valid hardware codes extracted: {len(all_hardware)}")

with open(output_sql, 'w') as f:
    f.write(sql_header.format(count=len(all_hardware)))
    
    values = []
    for (serial, category, model, batch) in all_hardware:
        # escape strings
        s_esc = serial.replace("'", "''")
        c_esc = category.replace("'", "''")
        m_esc = model.replace("'", "''")
        b_esc = batch.replace("'", "''") if batch else ""
        
        values.append(f"('{s_esc}', '{c_esc}', '{m_esc}', '{b_esc}', false)")
        
    f.write(",\n".join(values))
    f.write("\nON CONFLICT (serial_number) DO NOTHING;\n\nCOMMIT;\n")

print(f"SQL file saved to {output_sql}")
