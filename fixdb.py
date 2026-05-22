import re

env_file = "/opt/aischoolonair/api.env"
db_url = "DATABASE_URL=postgresql://postgres.jrimlapumxrnpasgjpus:aischoolonairDB1@aws-0-eu-west-1.pooler.supabase.com:6543/postgres\n"

with open(env_file, "r") as f:
    content = f.read()

content = re.sub(r"DATABASE_URL=.*\n?", "", content)
content = content.rstrip("\n") + "\n" + db_url

with open(env_file, "w") as f:
    f.write(content)

print("SUCCESS - DATABASE_URL updated")

with open(env_file, "r") as f:
    for line in f:
        if "DATABASE_URL" in line:
            print("VERIFIED:", line.strip())
