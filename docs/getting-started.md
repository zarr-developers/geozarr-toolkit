# Getting Started

This guide shows you how to use the `geozarr-toolkit` library to create and validate GeoZarr-compliant metadata.

## Installation

```bash
pip install "geozarr-toolkit @ git+https://github.com/zarr-developers/geozarr-toolkit.git"
# or with uv
uv pip install "geozarr-toolkit @ git+https://github.com/zarr-developers/geozarr-toolkit.git"
```

## Quick Start

### Creating Spatial Metadata

The spatial convention describes the relationship between array indices and spatial coordinates.

```python exec="on" source="above" result="json"
from geozarr_toolkit import (
    create_spatial_attrs,
    create_zarr_conventions,
    SpatialConventionMetadata,
)

# Create spatial attributes
spatial_attrs = create_spatial_attrs(
    dimensions=["Y", "X"],
    transform=[10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],  # Affine coefficients
    bbox=[500000.0, 4900000.0, 600000.0, 5000000.0],
    shape=[10000, 10000],
)

# Add the zarr_conventions metadata
spatial_attrs["zarr_conventions"] = create_zarr_conventions(
    SpatialConventionMetadata()
)

import json
print(json.dumps(spatial_attrs, indent=2))
```

### Adding CRS Information

The proj convention encodes Coordinate Reference System information.

```python exec="on" source="above" result="json"
from geozarr_toolkit import (
    create_proj_attrs,
    create_zarr_conventions,
    ProjConventionMetadata,
)

# Using EPSG code
proj_attrs = create_proj_attrs(code="EPSG:32633")  # UTM zone 33N

# Add the zarr_conventions metadata
proj_attrs["zarr_conventions"] = create_zarr_conventions(
    ProjConventionMetadata()
)

import json
print(json.dumps(proj_attrs, indent=2))
```

You can also use WKT2 or PROJJSON:

```python
# Using WKT2
proj_attrs_wkt = create_proj_attrs(wkt2='GEOGCS["WGS 84",DATUM["WGS_1984"]]')
```

### Building a Multiscales Pyramid

The multiscales convention describes hierarchical resolution levels.

```python exec="on" source="above" result="json"
from geozarr_toolkit import (
    create_multiscales_layout,
    create_zarr_conventions,
    MultiscalesConventionMetadata,
)

# Create a 3-level pyramid
multiscales = create_multiscales_layout([
    {"asset": "0"},
    {"asset": "1", "derived_from": "0", "transform": {"scale": [2.0, 2.0]}},
    {"asset": "2", "derived_from": "1", "transform": {"scale": [2.0, 2.0]}},
], resampling_method="average")

# Add the zarr_conventions metadata
multiscales["zarr_conventions"] = create_zarr_conventions(
    MultiscalesConventionMetadata()
)

import json
print(json.dumps(multiscales, indent=2))
```

### Complete GeoZarr Metadata

Combine multiple conventions with a single zarr_conventions array:

```python exec="on" source="above" result="json"
from geozarr_toolkit import create_geozarr_attrs

# Create complete metadata with zarr_conventions (spatial + proj)
attrs = create_geozarr_attrs(
    dimensions=["Y", "X"],
    crs="EPSG:32633",
    transform=[10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
    bbox=[500000.0, 4900000.0, 600000.0, 5000000.0],
    shape=[10000, 10000],
)

import json
print(json.dumps(attrs, indent=2))
```

## Working with Existing Data

### From rioxarray

Extract metadata from a rioxarray DataArray:

```python
import rioxarray
import xarray as xr
from geozarr_toolkit import (
    from_rioxarray,
    create_zarr_conventions,
    SpatialConventionMetadata,
    ProjConventionMetadata,
)

# Load data with rioxarray
da = xr.open_dataarray("data.tif", engine="rasterio")

# Extract convention metadata (spatial + proj attributes)
attrs = from_rioxarray(da)

# Add the zarr_conventions metadata
attrs["zarr_conventions"] = create_zarr_conventions(
    SpatialConventionMetadata(),
    ProjConventionMetadata(),
)
```

### From GDAL GeoTransform

Convert GDAL-style GeoTransform to convention attributes:

```python exec="on" source="above" result="json"
from geozarr_toolkit import (
    from_geotransform,
    create_zarr_conventions,
    SpatialConventionMetadata,
    ProjConventionMetadata,
)

# GDAL format: [origin_x, pixel_width, rotation, origin_y, rotation, pixel_height]
gdal_gt = (500000.0, 10.0, 0.0, 5000000.0, 0.0, -10.0)
crs_wkt = 'PROJCS["UTM zone 33N"]'
shape = (10000, 10000)

# Extract convention metadata (spatial + proj attributes)
attrs = from_geotransform(gdal_gt, crs_wkt, shape)

# Add the zarr_conventions metadata
attrs["zarr_conventions"] = create_zarr_conventions(
    SpatialConventionMetadata(),
    ProjConventionMetadata(),
)

import json
print(json.dumps(attrs, indent=2))
```

## Validation

### Validate Attributes

```python exec="on" source="above" result="code"
from geozarr_toolkit import validate_spatial, validate_proj

# Valid spatial attributes
attrs = {"spatial:dimensions": ["Y", "X"]}
is_valid, errors = validate_spatial(attrs)
print(f"Valid: {is_valid}, Errors: {errors}")

# Invalid - missing required CRS
attrs = {}
is_valid, errors = validate_proj(attrs)
print(f"Valid: {is_valid}, Errors: {errors}")
```

### Validate a Zarr Store

```python
import zarr
from geozarr_toolkit import validate_group, detect_conventions

# Open Zarr store
group = zarr.open_group("data.zarr", mode="r")

# Auto-detect and validate
conventions = detect_conventions(dict(group.attrs))
print(f"Detected: {conventions}")

results = validate_group(group)
for conv, errors in results.items():
    if errors:
        print(f"[FAIL] {conv}: {errors}")
    else:
        print(f"[OK] {conv}")
```

## Using the Pydantic Models

For more control, use the Pydantic models directly:

```python exec="on" source="above" result="json"
from geozarr_toolkit import Spatial, SpatialConventionMetadata

# Create and validate a Spatial object
spatial = Spatial(**{
    "spatial:dimensions": ["Y", "X"],
    "spatial:transform": [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
})

# Serialize to dict with aliases
attrs = spatial.model_dump(by_alias=True, exclude_none=True)

# Add zarr_conventions using the convention metadata model
attrs["zarr_conventions"] = [
    SpatialConventionMetadata().model_dump(exclude_none=True)
]

import json
print(json.dumps(attrs, indent=2))
```

```python exec="on" source="above" result="json"
from geozarr_toolkit import Proj, ProjConventionMetadata

# Create Proj with validation
proj = Proj(**{"proj:code": "EPSG:4326"})
attrs = proj.model_dump(by_alias=True, exclude_none=True)

# Add zarr_conventions
attrs["zarr_conventions"] = [
    ProjConventionMetadata().model_dump(exclude_none=True)
]

import json
print(json.dumps(attrs, indent=2))
```

## Next Steps

- See the API reference for complete documentation
- See the [CLI Reference](cli.md) for command-line usage
