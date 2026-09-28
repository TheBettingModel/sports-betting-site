#!/usr/bin/env python3
"""Check release-critical contents of an Expo iOS IPA before App Review.

This verifies the binary, not its source commit or Apple distribution status.
"""

import argparse
import json
import plistlib
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def verify(ipa_path: Path) -> list[str]:
    app = json.loads((ROOT / "artifacts/mobile/app.json").read_text())["expo"]
    production = json.loads((ROOT / "artifacts/mobile/eas.json").read_text())["build"]["production"]["env"]
    expected_domain = production["EXPO_PUBLIC_DOMAIN"]
    expected_proxy = production["EXPO_PUBLIC_CLERK_PROXY_URL"]
    failures = []

    with zipfile.ZipFile(ipa_path) as archive:
        corrupt = archive.testzip()
        if corrupt:
            return [f"IPA archive contains a corrupt entry: {corrupt}"]

        app_roots = {
            name.removesuffix("Info.plist")
            for name in archive.namelist()
            if name.startswith("Payload/") and name.endswith(".app/Info.plist")
            and name.count("/") == 2
        }
        if len(app_roots) != 1:
            return [f"Expected one iOS app in IPA; found {len(app_roots)}"]
        root = app_roots.pop()
        required = (root + "Info.plist", root + "Expo.plist", root + "main.jsbundle")
        missing = [name for name in required if name not in archive.namelist()]
        if missing:
            return [f"Missing IPA entries: {', '.join(missing)}"]

        identity = plistlib.loads(archive.read(root + "Info.plist"))
        updates = plistlib.loads(archive.read(root + "Expo.plist"))
        bundle = archive.read(root + "main.jsbundle").lower()

    expected_identity = {
        "CFBundleIdentifier": app["ios"]["bundleIdentifier"],
        "CFBundleShortVersionString": app["version"],
        "CFBundleVersion": str(app["ios"]["buildNumber"]),
    }
    for key, expected in expected_identity.items():
        actual = identity.get(key)
        if actual != expected:
            failures.append(f"{key}: IPA has {actual!r}; release source expects {expected!r}")

    if expected_domain.lower().encode() not in bundle:
        failures.append(f"Render API host {expected_domain!r} is absent from the Hermes bundle")
    if b"thebettingmodel.replit.app" in bundle and expected_domain != "thebettingmodel.replit.app":
        failures.append("Legacy Replit API host is present in the Hermes bundle")
    if expected_proxy.rsplit("/", 1)[-1].encode() not in bundle:
        failures.append("Clerk proxy path is absent from the Hermes bundle")
    if b"review-code" not in bundle:
        failures.append("Reviewer email-code flow marker is absent from the Hermes bundle")
    if b"compare ordinary sportsbook movement with verified sharp-book direction" not in bundle:
        failures.append("Current Analytics screen marker is absent from the Hermes bundle")
    if updates.get("EXUpdatesEnabled") is not False:
        failures.append("Executable Expo updates are not explicitly disabled in the IPA")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", type=Path, help="Path to the downloaded iOS IPA")
    args = parser.parse_args()
    try:
        failures = verify(args.ipa)
    except (OSError, KeyError, ValueError, zipfile.BadZipFile, plistlib.InvalidFileException) as error:
        print(f"IPA CHECK FAILED: {error}", file=sys.stderr)
        return 1
    if failures:
        print("IPA CHECK FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("IPA CHECK PASSED: identity, configured host, flow markers, and OTA setting match.")
    print("Still required: Expo source/build ID, Apple upload, TestFlight, and real-device reviewer access.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())