import re

with open('one_eye.svg', 'r') as f:
    content = f.read()

# Remove the <metadata> block that contains the massive base64 PGF data
cleaned = re.sub(r'<metadata>.*?</metadata>', '', content, flags=re.DOTALL)

with open('one_eye.svg', 'w') as f:
    f.write(cleaned)

