"""GeoZarr online validator web application."""

from __future__ import annotations

from typing import Any

import structlog
import zarr
from fastapi import FastAPI
from pydantic import BaseModel

from geozarr_toolkit.helpers.validation import (
    detect_conventions,
    validate_attrs,
    validate_group,
)

logger = structlog.get_logger()

app = FastAPI(title="GeoZarr Validator", description="Validate GeoZarr-compliant Zarr stores")


class ValidateAttributesRequest(BaseModel):
    """Request body for the /api/validate/attributes endpoint."""

    attributes: dict[str, Any]

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "attributes": {
                        "spatial:dimensions": ["Y", "X"],
                        "spatial:transform": [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
                        "proj:code": "EPSG:32633",
                    }
                }
            ]
        }
    }


class ValidateGroupRequest(BaseModel):
    """Request body for the /api/validate/group endpoint."""

    url: str
    group: str | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "url": "s3://us-west-2.opendata.source.coop/pangeo/geozarr-examples/TCI.zarr",
                }
            ]
        }
    }


class ConventionResult(BaseModel):
    """Validation result for a single convention."""

    valid: bool
    errors: list[str]


class ValidateAttributesResponse(BaseModel):
    """Response body for the /api/validate/attributes endpoint."""

    conventions: list[str]
    results: dict[str, ConventionResult]
    valid: bool


class ValidateGroupResponse(BaseModel):
    """Response body for the /api/validate/group endpoint."""

    url: str
    group: str | None = None
    conventions: list[str]
    results: dict[str, ConventionResult]
    valid: bool
    error: str | None = None


@app.post("/api/validate/attributes")
async def validate_attributes(request: ValidateAttributesRequest) -> ValidateAttributesResponse:
    """Validate an attributes dict against GeoZarr conventions."""
    conventions = detect_conventions(request.attributes)
    raw_results = validate_attrs(request.attributes, conventions)

    results = {
        name: ConventionResult(valid=len(errs) == 0, errors=errs)
        for name, errs in raw_results.items()
    }
    all_valid = all(r.valid for r in results.values())

    return ValidateAttributesResponse(
        conventions=conventions,
        results=results,
        valid=all_valid,
    )


@app.post("/api/validate/group")
async def validate_group_endpoint(request: ValidateGroupRequest) -> ValidateGroupResponse:
    """Validate a remote Zarr group against GeoZarr conventions."""
    try:
        from obstore.store import from_url
        from zarr.storage import ObjectStore
    except ImportError:
        return ValidateGroupResponse(
            url=request.url,
            group=request.group,
            conventions=[],
            results={},
            valid=False,
            error="Missing dependency: obstore. Install with: pip install obstore",
        )

    try:
        ob_store = from_url(request.url)
        zarr_store = ObjectStore(ob_store, read_only=True)
        grp = zarr.open_group(zarr_store, path=request.group or None, mode="r")
    except Exception:
        logger.exception("Failed to open Zarr store", url=request.url, group=request.group)
        return ValidateGroupResponse(
            url=request.url,
            group=request.group,
            conventions=[],
            results={},
            valid=False,
            error=f"Failed to open Zarr store at '{request.url}'"
            + (f" (group: '{request.group}')" if request.group else ""),
        )

    attrs = dict(grp.attrs)
    conventions = detect_conventions(attrs)
    raw_results = validate_group(grp, conventions)

    results = {
        name: ConventionResult(valid=len(errs) == 0, errors=errs)
        for name, errs in raw_results.items()
    }
    all_valid = all(r.valid for r in results.values())

    return ValidateGroupResponse(
        url=request.url,
        group=request.group,
        conventions=conventions,
        results=results,
        valid=all_valid,
    )
