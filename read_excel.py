import pandas as pd
import json

xl = pd.ExcelFile('Subsoccer sarjanumerot.xlsx')
print(f"SHEETS: {xl.sheet_names}")

for sheet in xl.sheet_names:
    print(f"\n--- SHEET: {sheet} ---")
    df = pd.read_excel(xl, sheet_name=sheet, nrows=5)
    print("HEADERS:")
    print(df.columns.tolist())
    print("FIRST ROWS:")
    print(df.head().to_dict(orient='records'))
