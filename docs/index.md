# geozarr-toolkit

Python library for creating and validating [GeoZarr](https://github.com/zarr-developers/geozarr-spec)-compliant metadata. Provides Pydantic models, helper functions, and a CLI for the modular [Zarr conventions](https://github.com/zarr-conventions):

- **[spatial:](https://github.com/zarr-conventions/spatial)** -- Coordinate transforms between array indices and spatial coordinates
- **[proj:](https://github.com/zarr-experimental/geo-proj)** -- Coordinate Reference System (CRS) via EPSG codes, WKT2, or PROJJSON
- **[multiscales](https://github.com/zarr-conventions/multiscales)** -- Pyramid structures and resolution levels

## Quick example

Create complete GeoZarr-compliant attributes in one call:

```python exec="on" source="above" result="json"
from geozarr_toolkit import create_geozarr_attrs
import json

attrs = create_geozarr_attrs(
    dimensions=["Y", "X"],
    crs="EPSG:32633",
    transform=[10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
    bbox=[500000.0, 4900000.0, 600000.0, 5000000.0],
    shape=[10000, 10000],
)

print(json.dumps(attrs, indent=2))
```

See the [Getting Started guide](getting-started.md) for more details, or browse the [API Reference](api/index.md).

## Installation

```bash
pip install "geozarr-toolkit @ git+https://github.com/zarr-developers/geozarr-toolkit.git"
```

## Goals

- Provide Python models and helpers for writing GeoZarr-compliant data, including CRS information, bounding boxes, and multiscale pyramids.
- Validate existing Zarr stores against GeoZarr conventions, both programmatically and via CLI.
- Support interoperability with rioxarray, GDAL GeoTransforms, and xarray workflows.

## References

### Specifications and Standards

- [GeoZarr spec](https://github.com/zarr-developers/geozarr-spec) -- Official specification, charter, and project board
- [Zarr Conventions Framework](https://github.com/zarr-conventions) -- Modular, composable Zarr conventions
- [CF Conventions](https://cfconventions.org/) -- Climate and Forecast metadata conventions

### Code Attribution

The Python convention models (`Spatial`, `Proj`, `Multiscales`, etc.) follow patterns established in [eopf-geozarr](https://github.com/EOPF-Explorer/data-model), part of the EOPF (Earth Observation Processing Framework) ecosystem.

## License

[MIT](https://github.com/zarr-developers/geozarr-toolkit/blob/main/LICENSE.txt)
