"""
Helper utilities for GeoZarr conventions.

This module provides helper functions for:
- Creating convention-compliant metadata
- Converting from other formats (GDAL GeoTransform, rioxarray)
- Validating attributes against conventions
"""

from geozarr_toolkit.helpers.metadata import (
    create_geozarr_attrs,
    create_multiscales_layout,
    create_proj_attrs,
    create_spatial_attrs,
    create_zarr_conventions,
    from_geotransform,
    from_rioxarray,
)
from geozarr_toolkit.helpers.validation import (
    detect_conventions,
    validate_attrs,
    validate_group,
    validate_multiscales,
    validate_multiscales_structure,
    validate_proj,
    validate_spatial,
    validate_zarr_conventions,
)

__all__ = [
    "create_geozarr_attrs",
    "create_multiscales_layout",
    "create_proj_attrs",
    "create_spatial_attrs",
    "create_zarr_conventions",
    "detect_conventions",
    "from_geotransform",
    "from_rioxarray",
    "validate_attrs",
    "validate_group",
    "validate_multiscales",
    "validate_multiscales_structure",
    "validate_proj",
    "validate_spatial",
    "validate_zarr_conventions",
]
