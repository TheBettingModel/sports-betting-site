from pathlib import Path

env = Path(".env")
main = Path("main.py")

# keep current database line
old_env = env.read_text() if env.exists() else ""

database = ""

for line in old_env.splitlines():
    if line.startswith("DATABASE_URL="):
        database = line

if not database:
    print("WARNING: DATABASE_URL not found")

new_env = f"""{database}
ODDS_API_KEY=0635b20cb934bcaded8adcbdf5bee9db
"""

env.write_text(new_env)

print("Rebuilt .env")

text = main.read_text()

text = text.replace(
    "load_dotenv()",
    'load_dotenv(".env")'
)

main.write_text(text)

print("Fixed dotenv loading")

