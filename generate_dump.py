import os
import json
import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(ROOT, "ai-ready-dump.txt")
PACKAGE_JSON = os.path.join(ROOT, "package.json")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

EXCLUDE_DIRS = {
    'node_modules', '.git', 'dist', 'build',
    'uploads', 'server/uploads'
}

EXCLUDE_FILES = {
    '.env', '.env.local', '.env.production',
    'package-lock.json',
    'ai-ready-dump.txt'
}

INCLUDE_EXTENSIONS = {
    '.js', '.jsx', '.ts', '.tsx',
    '.json', '.sql', '.md',
    '.html', '.css'
}

INCLUDE_EXACT = {'.gitignore'}

MAX_FILE_SIZE = 20000  # truncate large files (chars)

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def should_exclude_dir(path):
    parts = path.replace('\\', '/').split('/')
    return any(p in EXCLUDE_DIRS for p in parts)

def classify_file(path):
    p = path.lower()
    if 'client' in p or 'frontend' in p:
        return 'FRONTEND'
    if 'server' in p or 'backend' in p:
        return 'BACKEND'
    if 'config' in p or 'package.json' in p:
        return 'CONFIG'
    return 'OTHER'

# ─────────────────────────────────────────────────────────────────────────────
# COLLECT FILES
# ─────────────────────────────────────────────────────────────────────────────

def collect_files():
    collected = []

    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT)

        dirnames[:] = [
            d for d in dirnames
            if not should_exclude_dir(os.path.join(rel_dir, d))
        ]

        for filename in filenames:
            if filename in EXCLUDE_FILES:
                continue

            ext = os.path.splitext(filename)[1].lower()
            if ext not in INCLUDE_EXTENSIONS and filename not in INCLUDE_EXACT:
                continue

            full = os.path.join(dirpath, filename)
            rel = os.path.relpath(full, ROOT)

            collected.append((rel, full))

    # deterministic order
    collected.sort(key=lambda x: x[0].lower())
    return collected

# ─────────────────────────────────────────────────────────────────────────────
# PROJECT SUMMARY (AUTO DETECT)
# ─────────────────────────────────────────────────────────────────────────────

def get_project_summary():
    summary = {
        "frontend": "Unknown",
        "backend": "Unknown",
        "notes": []
    }

    if os.path.exists(PACKAGE_JSON):
        with open(PACKAGE_JSON, "r", encoding="utf-8") as f:
            pkg = json.load(f)
            deps = json.dumps(pkg)

            if "react" in deps:
                summary["frontend"] = "React"
            if "vite" in deps:
                summary["notes"].append("Uses Vite")
            if "express" in deps:
                summary["backend"] = "Node.js (Express)"

    return summary

# ─────────────────────────────────────────────────────────────────────────────
# WRITE DUMP
# ─────────────────────────────────────────────────────────────────────────────

def write_dump(files):
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    sep = '=' * 80

    summary = get_project_summary()

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:

        # ── HEADER ─────────────────────────────────────────────────────────
        out.write(f"{sep}\n")
        out.write(f"  AI-OPTIMIZED PROJECT DUMP\n")
        out.write(f"  Generated : {now}\n")
        out.write(f"  Root      : {ROOT}\n")
        out.write(f"{sep}\n\n")

        # ── AI INSTRUCTIONS ───────────────────────────────────────────────
        out.write("AI INSTRUCTIONS:\n")
        out.write("- This is a full project dump for code understanding\n")
        out.write("- Prioritize logic and architecture over styling\n")
        out.write("- Maintain existing patterns when modifying code\n")
        out.write("- Avoid introducing new frameworks unless necessary\n")
        out.write("- Pay attention to API routes and data flow\n\n")

        # ── PROJECT SUMMARY ───────────────────────────────────────────────
        out.write("PROJECT SUMMARY:\n")
        out.write(f"- Frontend: {summary['frontend']}\n")
        out.write(f"- Backend: {summary['backend']}\n")
        for note in summary["notes"]:
            out.write(f"- Note: {note}\n")
        out.write("\n")

        # ── ENTRY POINT HINTS ─────────────────────────────────────────────
        out.write("LIKELY ENTRY POINTS:\n")
        out.write("- client/src/App.jsx\n")
        out.write("- server/index.js (or similar)\n")
        out.write("- package.json\n\n")

        out.write(f"{sep}\n\n")

        # ── GROUP FILES ───────────────────────────────────────────────────
        grouped = {"CONFIG": [], "BACKEND": [], "FRONTEND": [], "OTHER": []}

        for rel, full in files:
            grouped[classify_file(rel)].append((rel, full))

        index = 1
        total = len(files)

        for group_name in ["CONFIG", "BACKEND", "FRONTEND", "OTHER"]:
            group_files = grouped[group_name]
            if not group_files:
                continue

            out.write(f"\n{sep}\n")
            out.write(f"SECTION: {group_name}\n")
            out.write(f"{sep}\n\n")

            for rel_path, full_path in group_files:
                stat = os.stat(full_path)

                out.write(f"{sep}\n")
                out.write(f"FILE ({index}/{total}): {rel_path}\n")
                out.write(f"SIZE: {stat.st_size} bytes\n")
                out.write(f"{sep}\n")

                try:
                    with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                        content = f.read()

                        if len(content) > MAX_FILE_SIZE:
                            content = content[:MAX_FILE_SIZE] + "\n...TRUNCATED..."

                        out.write(content)

                except Exception as e:
                    out.write(f"[ERROR READING FILE: {e}]")

                out.write("\n\n")
                index += 1

        # ── FOOTER ────────────────────────────────────────────────────────
        out.write(f"{sep}\n")
        out.write(f"END OF DUMP | {total} files\n")
        out.write(f"{sep}\n")

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("📂 Collecting files...")
    files = collect_files()
    print(f"   {len(files)} files found.")

    print("📝 Generating AI-optimized dump...")
    write_dump(files)

    print(f"\n✅ Done → {OUTPUT_FILE}")