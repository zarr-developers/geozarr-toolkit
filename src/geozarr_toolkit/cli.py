"""
Command-line interface for geozarr-toolkit.

Usage:
    geozarr validate <path> [--conventions ...]
    geozarr info <path> [--json]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from collections.abc import Sequence

log = structlog.get_logger()


def create_parser() -> argparse.ArgumentParser:
    """Create the argument parser."""
    parser = argparse.ArgumentParser(
        prog="geozarr",
        description="GeoZarr convention utilities",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {_get_version()}",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # validate command
    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate a Zarr store against GeoZarr conventions",
    )
    validate_parser.add_argument(
        "input_path",
        help="Path to Zarr store",
    )
    validate_parser.add_argument(
        "--conventions",
        nargs="+",
        choices=["spatial", "proj", "multiscales"],
        help="Conventions to validate (auto-detected if not specified)",
    )
    validate_parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed output",
    )
    validate_parser.set_defaults(func=validate_command)

    # info command
    info_parser = subparsers.add_parser(
        "info",
        help="Display information about a Zarr store",
    )
    info_parser.add_argument(
        "input_path",
        help="Path to Zarr store",
    )
    info_parser.add_argument(
        "--json",
        action="store_true",
        dest="output_json",
        help="Output as JSON",
    )
    info_parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed output",
    )
    info_parser.set_defaults(func=info_command)

    return parser


def _get_version() -> str:
    """Get the package version."""
    try:
        from geozarr_toolkit._version import version

        return version
    except ImportError:
        return "unknown"


def validate_command(args: argparse.Namespace) -> int:
    """Run the validate command."""
    import zarr

    from geozarr_toolkit.helpers import detect_conventions, validate_group

    input_path = Path(args.input_path)

    if not input_path.exists():
        log.error("Input path does not exist", path=str(input_path))
        print(f"Error: Path does not exist: {input_path}")
        return 1

    try:
        group = zarr.open_group(str(input_path), mode="r")
    except Exception as e:
        log.error("Failed to open Zarr store", path=str(input_path), error=str(e))
        print(f"Error: Failed to open Zarr store: {e}")
        return 1

    # Determine conventions to validate
    conventions = args.conventions
    if conventions is None:
        conventions = detect_conventions(dict(group.attrs))
        if args.verbose:
            print(f"Auto-detected conventions: {', '.join(conventions) or 'none'}")

    if not conventions:
        print("No conventions detected in store")
        return 0

    # Validate
    results = validate_group(group, conventions)

    # Report results
    has_errors = False
    for conv, errors in results.items():
        if errors:
            has_errors = True
            print(f"[FAIL] {conv}:")
            for error in errors:
                print(f"  - {error}")
        elif args.verbose:
            print(f"[OK] {conv}")

    if not has_errors:
        print(f"Validation passed for: {', '.join(conventions)}")
        return 0
    else:
        return 1


def info_command(args: argparse.Namespace) -> int:
    """Run the info command."""
    import zarr

    from geozarr_toolkit.helpers import detect_conventions

    input_path = Path(args.input_path)

    if not input_path.exists():
        log.error("Input path does not exist", path=str(input_path))
        print(f"Error: Path does not exist: {input_path}")
        return 1

    try:
        group = zarr.open_group(str(input_path), mode="r")
    except Exception as e:
        log.error("Failed to open Zarr store", path=str(input_path), error=str(e))
        print(f"Error: Failed to open Zarr store: {e}")
        return 1

    attrs = dict(group.attrs)
    conventions = detect_conventions(attrs)

    if args.output_json:
        info = {
            "path": str(input_path.absolute()),
            "conventions": conventions,
            "attributes": attrs,
        }
        if args.verbose:
            # Add member info
            members: dict[str, dict[str, str | list[int]]] = {}
            for name, item in group.items():
                if isinstance(item, zarr.Group):
                    members[name] = {"type": "group"}
                else:
                    members[name] = {
                        "type": "array",
                        "shape": [int(s) for s in item.shape],
                        "dtype": str(item.dtype),
                    }
            info["members"] = members

        print(json.dumps(info, indent=2, default=str))
    else:
        print(f"Path: {input_path.absolute()}")
        print(f"Conventions: {', '.join(conventions) or 'none detected'}")
        print()

        # Show convention-specific info
        if "spatial" in conventions:
            dims = attrs.get("spatial:dimensions", [])
            transform = attrs.get("spatial:transform")
            bbox = attrs.get("spatial:bbox")
            print("Spatial:")
            print(f"  Dimensions: {dims}")
            if transform:
                print(f"  Transform: {transform}")
            if bbox:
                print(f"  BBox: {bbox}")
            print()

        if "proj" in conventions:
            code = attrs.get("proj:code")
            print("Projection:")
            if code:
                print(f"  Code: {code}")
            elif attrs.get("proj:wkt2"):
                print("  WKT2: (present)")
            elif attrs.get("proj:projjson"):
                print("  PROJJSON: (present)")
            print()

        if "multiscales" in conventions:
            ms = attrs.get("multiscales", {})
            layout = ms.get("layout", [])
            print("Multiscales:")
            print(f"  Levels: {len(layout)}")
            for level in layout:
                asset = level.get("asset", "?")
                derived = level.get("derived_from", "")
                if derived:
                    print(f"    - {asset} (from {derived})")
                else:
                    print(f"    - {asset}")
            print()

        if args.verbose:
            print("Members:")
            for name, item in group.items():
                if isinstance(item, zarr.Group):
                    print(f"  {name}/ (group)")
                else:
                    print(f"  {name}: {item.shape} {item.dtype}")

    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Main entry point."""
    parser = create_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    result: int = args.func(args)
    return result


if __name__ == "__main__":
    main()
