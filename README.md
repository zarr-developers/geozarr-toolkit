# geozarr-toolkit

Python library for creating and validating [GeoZarr](https://github.com/zarr-developers/geozarr-spec)-compliant metadata. Provides Pydantic models, helper functions, and a CLI for the modular [Zarr conventions](https://github.com/zarr-conventions):

- **[spatial:](https://github.com/zarr-conventions/spatial)** -- Coordinate transforms between array indices and spatial coordinates
- **[proj:](https://github.com/zarr-experimental/geo-proj)** -- Coordinate Reference System (CRS) via EPSG codes, WKT2, or PROJJSON
- **[multiscales](https://github.com/zarr-conventions/multiscales)** -- Pyramid structures and resolution levels

## Installation

```bash
pip install "geozarr-toolkit"
```

## Quick start

Create complete GeoZarr-compliant attributes in one call:

```python
from geozarr_toolkit import create_geozarr_attrs

attrs = create_geozarr_attrs(
    dimensions=["Y", "X"],
    crs="EPSG:32633",
    transform=[10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
    bbox=[500000.0, 4900000.0, 600000.0, 5000000.0],
    shape=[10000, 10000],
)
```

Or build conventions individually:

```python
from geozarr_toolkit import (
    create_spatial_attrs,
    create_proj_attrs,
    create_zarr_conventions,
    SpatialConventionMetadata,
    ProjConventionMetadata,
)

# Spatial convention
spatial_attrs = create_spatial_attrs(
    dimensions=["Y", "X"],
    transform=[10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
)

# Proj convention
proj_attrs = create_proj_attrs(code="EPSG:32633")

# Combine with zarr_conventions array
attrs = {**spatial_attrs, **proj_attrs}
attrs["zarr_conventions"] = create_zarr_conventions(
    SpatialConventionMetadata(),
    ProjConventionMetadata(),
)
```

## Validation

Validate attributes or Zarr stores against conventions:

```python
from geozarr_toolkit import validate_spatial, validate_proj, detect_conventions

# Validate individual conventions
is_valid, errors = validate_spatial({"spatial:dimensions": ["Y", "X"]})

# Auto-detect and validate all conventions in a dict
from geozarr_toolkit import validate_attrs
results = validate_attrs(attrs)
```

## Working with existing data

Extract convention metadata from rioxarray or GDAL GeoTransforms:

```python
from geozarr_toolkit import from_rioxarray, from_geotransform

# From rioxarray DataArray
attrs = from_rioxarray(da)

# From GDAL GeoTransform
attrs = from_geotransform(
    geotransform=(500000.0, 10.0, 0.0, 5000000.0, 0.0, -10.0),
    crs_wkt='PROJCS["UTM zone 33N"]',
    shape=(10000, 10000),
)
```

## Pydantic models

Use the models directly for type-safe construction and validation:

```python
from geozarr_toolkit import Spatial, Proj

spatial = Spatial(**{"spatial:dimensions": ["Y", "X"]})
proj = Proj(**{"proj:code": "EPSG:4326"})

# Serialize with convention-prefixed keys
attrs = spatial.model_dump(by_alias=True, exclude_none=True)
```

## CLI

```bash
# Validate a Zarr store
geozarr validate data.zarr
geozarr validate data.zarr --conventions spatial proj

# Inspect a Zarr store
geozarr info data.zarr
geozarr info data.zarr --json
```

## metazarr

[`metazarr/`](metazarr/) is a client-side JavaScript library and web app for exploring Zarr store hierarchies and validating GeoZarr convention compliance. It runs entirely in the browser with no server required. Deployed at [inspect.geozarr.org](https://inspect.geozarr.org/).

Features:

- Opens remote Zarr v2 and v3 stores (consolidated metadata, directory crawling, or manual path entry)
- Displays full array metadata: shape, dtype, chunks, fill value, codecs/compressor, dimension names, chunk key encoding, memory order, and computed statistics (uncompressed size, chunk count, chunk size)
- Detects sharding (v3 `sharding_indexed` codec)
- Auto-detects GeoZarr conventions (spatial:, proj:, multiscales, CF) via `zarr_conventions` or attribute prefixes
- Validates nodes against convention JSON Schemas (Draft-07 and Draft 2020-12)

```bash
cd metazarr
npm install
npm run dev    # Start dev server at http://localhost:5173
npm test       # Run test suite
```

Also usable as an ES module:

```javascript
import { openStore, buildTree, detectConventions, validateNode, buildNodeDocument } from "metazarr";

const result = await openStore("https://example.com/data.zarr");
const tree = buildTreeFromV3(result.v3Entries);
const conventions = detectConventions(tree.attrs);
```

## Development

```bash
git clone https://github.com/zarr-developers/geozarr-toolkit.git
cd geozarr-toolkit
uv sync
uv run pytest
```

## License

[MIT](LICENSE.txt)
