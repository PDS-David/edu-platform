# fix-csp.py — fixes Content-Security-Policy in Caddyfile on Hetzner
path = "/opt/aischoolonair/Caddyfile"

with open(path, "r") as f:
    content = f.read()

old = "style-src 'self' 'unsafe-inline';"
new = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com;"

if old in content:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: CSP updated")
else:
    print("Pattern not found. Current style-src line:")
    for line in content.split(";"):
        if "style-src" in line:
            print(repr(line.strip()))
