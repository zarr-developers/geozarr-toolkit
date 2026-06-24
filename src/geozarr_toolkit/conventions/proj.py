"""
Models for the Proj Zarr Convention.

The proj convention encodes Coordinate Reference System (CRS) information
for geospatial data. It focuses solely on "what coordinate system" rather
than "how to transform" (which is handled by the spatial convention).

Specification: https://github.com/zarr-conventions/proj
"""

from __future__ import annotations

import re
from typing import Any, Final, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from zarr_cm import proj as _proj_cm

from geozarr_toolkit.conventions.common import ZarrConventionMetadata, is_none

# Convention identity (UUID, schema/spec URLs, description) is re-exported from
# zarr-cm so there is a single source of truth for it across the ecosystem.
PROJ_UUID: Final[str] = _proj_cm.UUID
PROJ_SCHEMA_URL: Final[str] = _proj_cm.SCHEMA_URL
PROJ_SPEC_URL: Final[str] = _proj_cm.SPEC_URL
PROJ_DESCRIPTION: Final[str] = _proj_cm.CMO["description"]


class ProjConventionMetadata(ZarrConventionMetadata):
    """Metadata for the proj convention in zarr_conventions array."""

    uuid: str = PROJ_UUID
    # `name` is intentionally not sourced from `zarr_cm.proj.CMO`: that CMO
    # carries `"proj:"` (with a trailing colon), whereas the proj spec and
    # this toolkit use the bare convention name `"proj"`.
    name: Literal["proj"] = "proj"
    schema_url: str = PROJ_SCHEMA_URL
    spec_url: str = PROJ_SPEC_URL
    description: str = PROJ_DESCRIPTION


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
        """Validate that at least one CRS field is provided.

        Delegates the spec-level "at least one of proj:code/proj:wkt2/
        proj:projjson" rule to `zarr_cm.proj.validate` so the requirement
        stays defined in a single place (zarr-cm). The stricter
        `^[A-Z]+:[0-9]+$` code pattern (`validate_code_format`) and the
        pyproj resolution check (`validate_code_resolves`) are geozarr-toolkit
        additions layered on top.
        """
        _proj_cm.validate(self.model_dump(by_alias=True, exclude_none=True))
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
