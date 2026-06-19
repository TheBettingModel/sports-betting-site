from pathlib import Path

env_path = Path(".env")
main_path = Path("main.py")

env_text = env_path.read_text() if env_path.exists() else ""

if "ODDS_API_KEY=" not in env_text:
    env_text = env_text.rstrip() + "\nODDS_API_KEY=PASTE_YOUR_REAL_ODDS_API_KEY_HERE\n"
    env_path.write_text(env_text)
    print("Added ODDS_API_KEY placeholder to .env")
else:
    print("ODDS_API_KEY already exists in .env")

main_text = main_path.read_text()

main_text = main_text.replace("load_dotenv()", 'load_dotenv(".env")')

main_path.write_text(main_text)

print("Updated main.py to load .env explicitly")
