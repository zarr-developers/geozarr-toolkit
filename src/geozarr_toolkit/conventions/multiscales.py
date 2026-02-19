"""
Models for the Multiscales Zarr Convention.

The multiscales convention defines hierarchical multiscale pyramid information
for resolution levels. It is domain-agnostic and works for image pyramids,
downsampling/upsampling, and hierarchical data organization.

Specification: https://github.com/zarr-conventions/multiscales
"""

from __future__ import annotations

from typing import Final, Literal

from pydantic import BaseModel, field_validator
from pydantic.experimental.missing_sentinel import MISSING

from geozarr_toolkit.conventions.common import ZarrConventionMetadata

MULTISCALES_UUID: Final[Literal["d35379db-88df-4056-af3a-620245f8e347"]] = (
    "d35379db-88df-4056-af3a-620245f8e347"
)
MULTISCALES_SCHEMA_URL: Final[str] = (
    "https://raw.githubusercontent.com/zarr-conventions/multiscales/refs/tags/v1/schema.json"
)
MULTISCALES_SPEC_URL: Final[str] = (
    "https://github.com/zarr-conventions/multiscales/blob/v1/README.md"
)


class MultiscalesConventionMetadata(ZarrConventionMetadata):
    """Metadata for the multiscales convention in zarr_conventions array."""

    uuid: Literal["d35379db-88df-4056-af3a-620245f8e347"] = MULTISCALES_UUID
    name: Literal["multiscales"] = "multiscales"
    schema_url: str = MULTISCALES_SCHEMA_URL
    spec_url: str = MULTISCALES_SPEC_URL
    description: str = "Multiscale layout of zarr datasets"


class Transform(BaseModel):
    """
    Transformation between resolution levels.

    Describes the coordinate transformation from a derived level
    back to its source level during resampling.

    Attributes
    ----------
    scale : tuple[float, ...] | MISSING
        Scale factors per axis. Values > 1 indicate downsampling,
        values < 1 indicate upsampling.
    translation : tuple[float, ...] | MISSING
        Translation offsets per axis in coordinate space.
    """

    scale: tuple[float, ...] | MISSING = MISSING
    translation: tuple[float, ...] | MISSING = MISSING

    model_config = {"extra": "allow"}


class ScaleLevel(BaseModel):
    """
    A single level in the multiscale pyramid.

    Attributes
    ----------
    asset : str
        Path to the Zarr group/array for this level, e.g., "0", "level1",
        or "0/data" for nested structures. Relative paths only.
    derived_from : str | MISSING
        Path to the source level used to generate this level.
    transform : Transform | MISSING
        Transformation from this level to the source level.
        Required if derived_from is specified.
    resampling_method : str | MISSING
        Resampling method used for this level, e.g., "average", "nearest".
        Overrides the default resampling_method if specified.
    """

    asset: str
    derived_from: str | MISSING = MISSING
    transform: Transform | MISSING = MISSING
    resampling_method: str | MISSING = MISSING

    model_config = {"extra": "allow"}


class Multiscales(BaseModel):
    """
    Multiscales convention attributes for a Zarr group.

    Note: This convention applies to groups only, not arrays.

    Attributes
    ----------
    layout : tuple[ScaleLevel, ...]
        Array of scale level objects, each representing a resolution level
        in the pyramid.
    resampling_method : str | MISSING
        Default resampling method applied to all levels, e.g., "average".
        Can be overridden per-level.
    """

    layout: tuple[ScaleLevel, ...]
    resampling_method: str | MISSING = MISSING

    model_config = {"extra": "allow"}

    @field_validator("layout", mode="after")
    @classmethod
    def validate_layout_not_empty(cls, value: tuple[ScaleLevel, ...]) -> tuple[ScaleLevel, ...]:
        """Validate that layout has at least one level."""
        if not value:
            raise ValueError("multiscales layout must have at least one level")
        return value


class MultiscalesAttrs(BaseModel):
    """
    Complete attributes for a Zarr group with multiscales convention.

    Includes the zarr_conventions array and the multiscales object.
    """

    zarr_conventions: tuple[ZarrConventionMetadata, ...]
    multiscales: Multiscales

    model_config = {"extra": "allow"}

    @field_validator("zarr_conventions", mode="after")
    @classmethod
    def ensure_multiscales_convention(
        cls, value: tuple[ZarrConventionMetadata, ...]
    ) -> tuple[ZarrConventionMetadata, ...]:
        """Validate that multiscales convention is present in zarr_conventions."""
        has_multiscales = any(
            conv.uuid == MULTISCALES_UUID or conv.name == "multiscales" for conv in value
        )
        if not has_multiscales:
            raise ValueError(
                "zarr_conventions must include the multiscales convention "
                f"(uuid: {MULTISCALES_UUID})"
            )
        return value
