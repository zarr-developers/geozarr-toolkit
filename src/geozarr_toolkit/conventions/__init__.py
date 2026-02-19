"""
GeoZarr convention models.

This module provides Pydantic models for the following Zarr conventions:
- spatial: Spatial coordinate and transformation information
- proj: Coordinate reference system (CRS) information
- multiscales: Multiscale pyramid layout

Example usage:

    from geozarr_toolkit.conventions import (
        Spatial,
        SpatialConventionMetadata,
        Proj,
        ProjConventionMetadata,
        Multiscales,
        MultiscalesConventionMetadata,
    )

    # Create spatial metadata
    spatial = Spatial(**{
        "spatial:dimensions": ["Y", "X"],
        "spatial:transform": [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
    })

    # Create proj metadata
    proj = Proj(**{"proj:code": "EPSG:32633"})

    # Get convention metadata for zarr_conventions array
    conventions = [
        SpatialConventionMetadata().model_dump(exclude_none=True),
        ProjConventionMetadata().model_dump(exclude_none=True),
    ]
"""

from geozarr_toolkit.conventions.common import ZarrConventionMetadata
from geozarr_toolkit.conventions.multiscales import (
    MULTISCALES_SCHEMA_URL,
    MULTISCALES_SPEC_URL,
    MULTISCALES_UUID,
    Multiscales,
    MultiscalesAttrs,
    MultiscalesConventionMetadata,
    ScaleLevel,
    Transform,
)
from geozarr_toolkit.conventions.proj import (
    PROJ_SCHEMA_URL,
    PROJ_SPEC_URL,
    PROJ_UUID,
    GeoProj,
    Proj,
    ProjConventionMetadata,
)
from geozarr_toolkit.conventions.spatial import (
    SPATIAL_SCHEMA_URL,
    SPATIAL_SPEC_URL,
    SPATIAL_UUID,
    Spatial,
    SpatialConventionMetadata,
)

__all__ = [
    "MULTISCALES_SCHEMA_URL",
    "MULTISCALES_SPEC_URL",
    "MULTISCALES_UUID",
    "PROJ_SCHEMA_URL",
    "PROJ_SPEC_URL",
    "PROJ_UUID",
    "SPATIAL_SCHEMA_URL",
    "SPATIAL_SPEC_URL",
    "SPATIAL_UUID",
    "GeoProj",
    "Multiscales",
    "MultiscalesAttrs",
    "MultiscalesConventionMetadata",
    "Proj",
    "ProjConventionMetadata",
    "ScaleLevel",
    "Spatial",
    "SpatialConventionMetadata",
    "Transform",
    "ZarrConventionMetadata",
]
