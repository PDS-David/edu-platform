import os
import json
import datetime

ROOT        = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(ROOT, "edu-platform-dump.txt")
PACKAGE_JSON = os.path.join(ROOT, "package.json")

EXCLUDE_DIRS = {
    'node_modules', '.git', 'dist', 'build',
    'server/uploads', 'server\\uploads',
}

EXCLUDE_FILES = {
    '.env', '.env.local', '.env.production',
    'package-lock.json',
    'edu-platform-dump.txt',
    'backend_dump.txt',
    'frontend_dump.txt',
}

INCLUDE_EXTENSIONS = {
    '.js', '.jsx', '.ts', '.tsx',
    '.json', '.sql', '.md',
    '.html', '.css',
}

INCLUDE_EXACT_NAMES = {'.gitignore'}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Auto-patch package.json with the dump script
# ─────────────────────────────────────────────────────────────────────────────

def patch_package_json():
    if not os.path.exists(PACKAGE_JSON):
        print("⚠️  package.json not found at project root — skipping patch.")
        return

    with open(PACKAGE_JSON, 'r', encoding='utf-8') as f:
        pkg = json.load(f)

    scripts = pkg.setdefault('scripts', {})

    if scripts.get('dump') == 'python generate_dump.py':
        print('ℹ️  package.json already has the dump script — no changes needed.')
        return

    scripts['dump'] = 'python generate_dump.py'

    with open(PACKAGE_JSON, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=2)
        f.write('\n')

    print('✅ package.json patched — "dump" script added.')


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Collect files
# ─────────────────────────────────────────────────────────────────────────────

def should_exclude_dir(rel_path):
    normalized = rel_path.replace('\\', '/')
    parts      = normalized.split('/')
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    if 'uploads' in parts:
        return True
    return False


def collect_files():
    collected = []

    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT)

        # Prune excluded dirs in-place so os.walk never descends into them
        dirnames[:] = [
            d for d in dirnames
            if not should_exclude_dir(os.path.join(rel_dir, d).replace('\\', '/'))
        ]

        for filename in filenames:
            if filename in EXCLUDE_FILES:
                continue

            ext = os.path.splitext(filename)[1].lower()
            if ext not in INCLUDE_EXTENSIONS and filename not in INCLUDE_EXACT_NAMES:
                continue

            full_path = os.path.join(dirpath, filename)
            rel_path  = os.path.relpath(full_path, ROOT)
            collected.append((rel_path, full_path))

    collected.sort(key=lambda x: x[0].lower())
    return collected


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Write the dump
# ─────────────────────────────────────────────────────────────────────────────

def write_dump(files):
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    sep = '=' * 80

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as out:

        # Header
        out.write(f"{sep}\n")
        out.write(f"  AISchoolonair - FULL PROJECT DUMP\n")
        out.write(f"  Generated : {now}\n")
        out.write(f"  Root      : {ROOT}\n")
        out.write(f"  NOTE: server/uploads folder excluded (binary video files)\n")
        out.write(f"{sep}\n\n\n")

        for index, (rel_path, full_path) in enumerate(files, start=1):
            stat  = os.stat(full_path)
            size  = stat.st_size
            mtime = datetime.datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')

            out.write(f"{sep}\n")
            out.write(f"FILE ({index} / {len(files)}): {rel_path}\n")
            out.write(f"SIZE: {size} bytes  |  MODIFIED: {mtime}\n")
            out.write(f"{sep}\n")

            try:
                with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                    out.write(f.read())
            except Exception as e:
                out.write(f"[ERROR READING FILE: {e}]\n")

            out.write("\n\n")

        # Footer
        out.write(f"{sep}\n")
        out.write(f"  END OF DUMP  |  {len(files)} files listed\n")
        out.write(f"{sep}\n")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("🔧 Patching package.json...")
    patch_package_json()

    print("📂 Collecting files...")
    files = collect_files()
    print(f"   {len(files)} files found.")

    print("📝 Writing dump...")
    write_dump(files)

    print(f"\n✅ Done!  →  {OUTPUT_FILE}")
    print(f"   Run again any time with:  npm run dump")