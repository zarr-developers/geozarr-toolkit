"""
Models for the Proj Zarr Convention.

The proj convention encodes Coordinate Reference System (CRS) information
for geospatial data. It focuses solely on "what coordinate system" rather
than "how to transform" (which is handled by the spatial convention).

Specification: https://github.com/zarr-experimental/geo-proj
"""

from __future__ import annotations

import re
from typing import Any, Final, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from geozarr_toolkit.conventions.common import ZarrConventionMetadata, is_none

PROJ_UUID: Final[Literal["f17cb550-5864-4468-aeb7-f3180cfb622f"]] = (
    "f17cb550-5864-4468-aeb7-f3180cfb622f"
)
PROJ_SCHEMA_URL: Final[str] = (
    "https://raw.githubusercontent.com/zarr-experimental/geo-proj/refs/tags/v1/schema.json"
)
PROJ_SPEC_URL: Final[str] = "https://github.com/zarr-experimental/geo-proj/blob/v1/README.md"


class ProjConventionMetadata(ZarrConventionMetadata):
    """Metadata for the proj: convention in zarr_conventions array."""

    uuid: Literal["f17cb550-5864-4468-aeb7-f3180cfb622f"] = PROJ_UUID
    name: Literal["proj:"] = "proj:"
    schema_url: str = PROJ_SCHEMA_URL
    spec_url: str = PROJ_SPEC_URL
    description: str = "Coordinate reference system information for geospatial data"


_CODE_PATTERN = re.compile(r"^[A-Z]+:[0-9]+$")


class Proj(BaseModel):
    """
    Proj convention attributes for a Zarr group or array.

    At least one of code, wkt2, or projjson must be provided.

    Attributes
    ----------
    code : str | None
        Authority:Code identifier, e.g., "EPSG:4326", "EPSG:32633".
        Pattern: ^[A-Z]+:[0-9]+$
    wkt2 : str | None
        WKT2 (ISO 19162:2019) representation of the CRS.
    projjson : dict | None
        PROJJSON representation of the CRS following PROJ specification v0.7.
    """

    code: str | None = Field(None, alias="proj:code", exclude_if=is_none)
    wkt2: str | None = Field(None, alias="proj:wkt2", exclude_if=is_none)
    projjson: dict[str, Any] | None = Field(None, alias="proj:projjson", exclude_if=is_none)

    model_config = {"extra": "allow", "populate_by_name": True, "serialize_by_alias": True}

    @field_validator("code")
    @classmethod
    def validate_code_format(cls, v: str | None) -> str | None:
        """Validate that code matches the Authority:Code pattern."""
        if v is not None and not _CODE_PATTERN.match(v):
            raise ValueError(
                f"proj:code must match pattern AUTHORITY:CODE (e.g. 'EPSG:4326'), got '{v}'"
            )
        return v

    @model_validator(mode="after")
    def validate_at_least_one_crs(self) -> Proj:
        """Validate that at least one CRS field is provided."""
        if not any([self.code, self.wkt2, self.projjson]):
            raise ValueError(
                "At least one of proj:code, proj:wkt2, or proj:projjson must be provided"
            )
        return self

    @model_validator(mode="after")
    def validate_code_resolves(self) -> Proj:
        """Validate that the code resolves to a known CRS via pyproj."""
        if self.code is None:
            return self
        try:
            from pyproj import CRS

            CRS.from_authority(*self.code.split(":", 1))
        except Exception:
            raise ValueError(f"proj:code '{self.code}' does not resolve to a known CRS") from None
        return self


# Backwards compatibility alias
GeoProj = Proj
