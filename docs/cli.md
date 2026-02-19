# Command Line Interface

The `geozarr-toolkit` package provides a CLI for validating and inspecting GeoZarr-compliant Zarr stores.

## Installation

```bash
pip install geozarr-toolkit
# or with uv
uv pip install geozarr-toolkit
```

## Commands

### validate

Validate a Zarr store against GeoZarr conventions.

```bash
geozarr validate <path> [options]
```

**Arguments:**

- `path` - Path to the Zarr store

**Options:**

- `--conventions` - Specify conventions to validate (choices: `spatial`, `proj`, `multiscales`). If not specified, conventions are auto-detected.
- `--verbose`, `-v` - Show detailed output

**Examples:**

```bash
# Auto-detect and validate all conventions
geozarr validate data.zarr

# Validate specific conventions
geozarr validate data.zarr --conventions spatial proj

# Verbose output
geozarr validate data.zarr -v
```

**Sample output:**

```
Auto-detected conventions: spatial, proj
[OK] spatial
[OK] proj
Validation passed for: spatial, proj
```

### info

Display information about a Zarr store.

```bash
geozarr info <path> [options]
```

**Arguments:**

- `path` - Path to the Zarr store

**Options:**

- `--json` - Output as JSON
- `--verbose`, `-v` - Show member details (arrays and groups)

**Examples:**

```bash
# Basic info
geozarr info data.zarr

# JSON output
geozarr info data.zarr --json

# Verbose with member details
geozarr info data.zarr -v
```

**Sample output:**

```
Path: /path/to/data.zarr
Conventions: spatial, proj, multiscales

Spatial:
  Dimensions: ['Y', 'X']
  Transform: [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0]
  BBox: [500000.0, 4900000.0, 600000.0, 5000000.0]

Projection:
  Code: EPSG:32633

Multiscales:
  Levels: 3
    - 0
    - 1 (from 0)
    - 2 (from 1)
```

**JSON output:**

```json
{
  "path": "/path/to/data.zarr",
  "conventions": ["spatial", "proj", "multiscales"],
  "attributes": {
    "spatial:dimensions": ["Y", "X"],
    "proj:code": "EPSG:32633",
    "multiscales": {...}
  }
}
```

## Exit Codes

- `0` - Success (validation passed or info retrieved)
- `1` - Error (validation failed, path not found, or invalid store)
