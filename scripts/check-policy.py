#!/usr/bin/env python3
"""Lint a lifecycle policy: a policy holds choices, not records.

Fails on a word count above the ceiling, on dates, and on commit hashes.
Usage: check-policy.py [path/to/policy.md] [ceiling-in-words]
"""
from __future__ import annotations

import pathlib
import re
import sys

DATE = re.compile(r"\b20\d{2}-[01]\d-[0-3]\d\b")
HASH = re.compile(r"\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b")


def lint(text: str, ceiling: int = 600) -> list[str]:
    failures: list[str] = []
    words = len(text.split())
    if words > ceiling:
        failures.append(f"{words} words, above the {ceiling}-word ceiling")
    dates = DATE.findall(text)
    if dates:
        failures.append(f"{len(dates)} date(s); a policy states what applies now")
    hashes = HASH.findall(text)
    if hashes:
        failures.append(f"{len(hashes)} commit hash(es); a revision belongs in the record it describes")
    return failures


def main(argv: list[str]) -> int:
    path = pathlib.Path(argv[1] if len(argv) > 1 else ".gravity/policy.md")
    ceiling = int(argv[2]) if len(argv) > 2 else 600
    if not path.is_file():
        print(f"FAIL  {path} is not readable")
        return 1
    failures = lint(path.read_text(encoding="utf-8"), ceiling)
    for f in failures:
        print(f"FAIL  {path}: {f}")
    if not failures:
        print(f"ok    {path} passes the policy lint (ceiling {ceiling})")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
