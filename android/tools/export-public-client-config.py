"""Export public client values; GitHub Actions variables take precedence."""
import json, os
from pathlib import Path
values = json.loads(Path(__file__).with_name("public-client-config.json").read_text())
with open(os.environ["GITHUB_ENV"], "a") as output:
    for key, fallback in values.items():
        value = os.environ.get(key) or fallback
        assert "\n" not in value and "\r" not in value
        output.write(f"{key}={value}\n")
