"""Common utilities for GeoZarr convention models."""

from __future__ import annotations

from typing import Self, TypeGuard

from pydantic import BaseModel, model_validator
from pydantic.experimental.missing_sentinel import MISSING


class ZarrConventionMetadata(BaseModel):
    """
    Base class for Zarr convention metadata.

    At least one of uuid, schema_url, or spec_url must be provided
    to identify the convention.
    """

    uuid: str | MISSING = MISSING
    schema_url: str | MISSING = MISSING
    spec_url: str | MISSING = MISSING
    name: str | MISSING = MISSING
    description: str | MISSING = MISSING

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def ensure_identifiable(self) -> Self:
        """Ensure at least one identifier is provided."""
        if self.uuid is MISSING and self.schema_url is MISSING and self.spec_url is MISSING:
            raise ValueError("At least one of uuid, schema_url, or spec_url must be provided.")
        return self


def is_none(data: object) -> TypeGuard[None]:
    """Type guard to check if data is None."""
    return data is None
