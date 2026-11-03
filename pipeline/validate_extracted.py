#!/usr/bin/env python3
"""Validate data/extracted/<pmid>.json files against the extraction schema in extract_with_claude.py.

Usage: python pipeline/validate_extracted.py [pmid ...]   (no args = all files)
Exit code 1 if any file fails; prints one line per problem.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
try:
    from extract_with_claude import CASE_PROPS  # needs the anthropic package importable
except ImportError:
    import importlib.util, types
    sys.modules["anthropic"] = types.ModuleType("anthropic")  # schema only; no API use here
    spec = importlib.util.spec_from_file_location("ewc", ROOT / "pipeline/extract_with_claude.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    CASE_PROPS = mod.CASE_PROPS

PYTYPE = {"string": str, "integer": int, "boolean": bool, "array": list, "null": type(None)}


def check_value(name, spec, v):
    types = spec["type"] if isinstance(spec["type"], list) else [spec["type"]]
    if isinstance(v, bool) and "boolean" not in types:
        return f"{name}: bool not allowed"
    if not any(isinstance(v, PYTYPE[t]) for t in types):
        return f"{name}: {v!r} not of type {types}"
    if "enum" in spec and v not in spec["enum"]:
        return f"{name}: {v!r} not in enum"
    if isinstance(v, list) and "items" in spec:
        for x in v:
            if "enum" in spec["items"] and x not in spec["items"]["enum"]:
                return f"{name}: item {x!r} not in enum"
            if spec["items"].get("type") == "integer" and (not isinstance(x, int) or isinstance(x, bool)):
                return f"{name}: item {x!r} not integer"
    return None


def validate(path):
    errs = []
    try:
        d = json.loads(path.read_text())
    except Exception as e:
        return [f"invalid JSON: {e}"]
    if str(d.get("pmid")) != path.stem:
        errs.append(f"pmid {d.get('pmid')!r} != file name")
    if not isinstance(d.get("cases"), list):
        return errs + ["cases missing or not a list"]
    if not d["cases"] and not d.get("why_none"):
        errs.append("no cases and no why_none")
    for i, c in enumerate(d["cases"]):
        missing = [k for k in CASE_PROPS if k not in c]
        extra = [k for k in c if k not in CASE_PROPS]
        if missing:
            errs.append(f"case {i}: missing {missing}")
        if extra:
            errs.append(f"case {i}: unexpected {extra}")
        for k, spec in CASE_PROPS.items():
            if k in c:
                e = check_value(k, spec, c[k])
                if e:
                    errs.append(f"case {i}: {e}")
        if c.get("mechanisms") == []:
            errs.append(f"case {i}: mechanisms empty (use ['unknown'])")
    return errs


def main():
    d = ROOT / "data/extracted"
    files = [d / f"{p}.json" for p in sys.argv[1:]] if len(sys.argv) > 1 else sorted(d.glob("*.json"))
    bad = 0
    for f in files:
        if not f.exists():
            print(f"{f.stem}: MISSING"); bad += 1; continue
        for e in validate(f):
            print(f"{f.stem}: {e}"); bad += 1
    print(f"checked {len(files)} files, {bad} problem(s)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
