"""
Models for the Spatial Zarr Convention.

The spatial convention defines the relationship between array indices
and spatial coordinates. It is domain-agnostic and works for geospatial,
microscopy, medical imaging, and other spatial data.

Specification: https://github.com/zarr-conventions/spatial
"""

from __future__ import annotations

from typing import Final, Literal

from pydantic import BaseModel, Field, model_validator
from zarr_cm import spatial as _spatial_cm

from geozarr_toolkit.conventions.common import ZarrConventionMetadata, is_none

# Convention identity (UUID, schema/spec URLs, description) is re-exported from
# zarr-cm so there is a single source of truth for it across the ecosystem.
SPATIAL_UUID: Final[str] = _spatial_cm.UUID
SPATIAL_SCHEMA_URL: Final[str] = _spatial_cm.SCHEMA_URL
SPATIAL_SPEC_URL: Final[str] = _spatial_cm.SPEC_URL
SPATIAL_DESCRIPTION: Final[str] = _spatial_cm.CMO["description"]


class SpatialConventionMetadata(ZarrConventionMetadata):
    """Metadata for the spatial convention in zarr_conventions array."""

    uuid: str = SPATIAL_UUID
    # `name` is intentionally not sourced from `zarr_cm.spatial.CMO`: that
    # CMO carries `"spatial:"` (with a trailing colon), whereas the spatial
    # spec and this toolkit use the bare convention name `"spatial"`.
    name: Literal["spatial"] = "spatial"
    schema_url: str = SPATIAL_SCHEMA_URL
    spec_url: str = SPATIAL_SPEC_URL
    description: str = SPATIAL_DESCRIPTION


class Spatial(BaseModel):
    """
    Spatial convention attributes for a Zarr group or array.

    Attributes
    ----------
    dimensions : list[str]
        Names of spatial dimensions, e.g., ["Y", "X"] for 2D or ["Z", "Y", "X"] for 3D.
        Required field.
    bbox : list[float] | None
        Bounding box in coordinate space. For 2D: [xmin, ymin, xmax, ymax].
        For 3D: [xmin, ymin, zmin, xmax, ymax, zmax].
    transform_type : str
        Type of transformation. Currently only "affine" is defined. Default: "affine".
    transform : list[float] | None
        Affine transformation coefficients [a, b, c, d, e, f] mapping array indices
        to coordinates: x = a*i + b*j + c, y = d*i + e*j + f.
        Uses Rasterio/Affine library ordering.
    shape : list[int] | None
        Shape of spatial dimensions [height, width] for 2D or [depth, height, width] for 3D.
    registration : str
        Grid cell registration. "pixel" (default, PixelIsArea) means cell boundaries
        align with coordinates. "node" (PixelIsPoint) means cell centers align.
    """

    dimensions: list[str] = Field(alias="spatial:dimensions")
    bbox: list[float] | None = Field(None, alias="spatial:bbox", exclude_if=is_none)
    transform_type: str = Field("affine", alias="spatial:transform_type")
    transform: list[float] | None = Field(None, alias="spatial:transform", exclude_if=is_none)
    shape: list[int] | None = Field(None, alias="spatial:shape", exclude_if=is_none)
    registration: str = Field("pixel", alias="spatial:registration")

    model_config = {"extra": "allow", "populate_by_name": True, "serialize_by_alias": True}

    @model_validator(mode="after")
    def validate_dimensions_not_empty(self) -> Spatial:
        """Validate that dimensions list is not empty."""
        if not self.dimensions:
            raise ValueError("spatial:dimensions must contain at least one dimension")
        return self

    @model_validator(mode="after")
    def validate_transform_length(self) -> Spatial:
        """Validate that transform has exactly 6 coefficients for 2D affine."""
        if self.transform is not None and len(self.transform) != 6:
            raise ValueError("spatial:transform must have exactly 6 coefficients for 2D affine")
        return self

    @model_validator(mode="after")
    def validate_registration(self) -> Spatial:
        """Validate registration is either 'pixel' or 'node'."""
        if self.registration not in ("pixel", "node"):
            raise ValueError("spatial:registration must be 'pixel' or 'node'")
        return self
