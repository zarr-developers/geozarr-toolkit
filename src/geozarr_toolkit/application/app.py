"""GeoZarr online validator web application."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import structlog
import zarr
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, model_validator

from geozarr_toolkit.helpers.validation import (
    detect_conventions,
    validate_attrs,
    validate_group,
)

logger = structlog.get_logger()

app = FastAPI(title="GeoZarr Validator", description="Validate GeoZarr-compliant Zarr stores")

# Static files live at the project root under web/static/, not inside the package
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
STATIC_DIR = _PROJECT_ROOT / "web" / "static"


class ValidateRequest(BaseModel):
    """Request body for the /api/validate endpoint."""

    url: str | None = None
    group: str | None = None
    attributes: dict[str, Any] | None = None

    @model_validator(mode="after")
    def check_url_or_attributes(self) -> ValidateRequest:
        if self.url is None and self.attributes is None:
            msg = "Either 'url' or 'attributes' must be provided"
            raise ValueError(msg)
        return self


class ConventionResult(BaseModel):
    """Validation result for a single convention."""

    valid: bool
    errors: list[str]


class ValidateResponse(BaseModel):
    """Response body for the /api/validate endpoint."""

    url: str | None = None
    group: str | None = None
    conventions: list[str]
    results: dict[str, ConventionResult]
    valid: bool
    error: str | None = None


def _validate_url(url: str, group_path: str | None) -> ValidateResponse:
    """Open a remote Zarr store via obstore and validate it."""
    try:
        from obstore.store import from_url
        from zarr.storage import ObjectStore
    except ImportError:
        return ValidateResponse(
            url=url,
            group=group_path,
            conventions=[],
            results={},
            valid=False,
            error="Missing dependency: obstore. Install with: pip install obstore",
        )

    try:
        ob_store = from_url(url)
        zarr_store = ObjectStore(ob_store, read_only=True)
        grp = zarr.open_group(zarr_store, path=group_path or None, mode="r")
    except Exception:
        logger.exception("Failed to open Zarr store", url=url, group=group_path)
        return ValidateResponse(
            url=url,
            group=group_path,
            conventions=[],
            results={},
            valid=False,
            error=f"Failed to open Zarr store at '{url}'"
            + (f" (group: '{group_path}')" if group_path else ""),
        )

    attrs = dict(grp.attrs)
    conventions = detect_conventions(attrs)
    raw_results = validate_group(grp, conventions)

    results = {
        name: ConventionResult(valid=len(errs) == 0, errors=errs)
        for name, errs in raw_results.items()
    }
    all_valid = all(r.valid for r in results.values())

    return ValidateResponse(
        url=url,
        group=group_path,
        conventions=conventions,
        results=results,
        valid=all_valid,
    )


def _validate_attributes(attrs: dict[str, Any]) -> ValidateResponse:
    """Validate a pasted attributes dictionary."""
    conventions = detect_conventions(attrs)
    raw_results = validate_attrs(attrs, conventions)

    results = {
        name: ConventionResult(valid=len(errs) == 0, errors=errs)
        for name, errs in raw_results.items()
    }
    all_valid = all(r.valid for r in results.values())

    return ValidateResponse(
        conventions=conventions,
        results=results,
        valid=all_valid,
    )


@app.post("/api/validate")
async def validate(request: ValidateRequest) -> ValidateResponse:
    """Validate a Zarr store or attributes dict against GeoZarr conventions."""
    if request.url is not None:
        return _validate_url(request.url, request.group)
    assert request.attributes is not None
    return _validate_attributes(request.attributes)


@app.get("/")
async def index() -> FileResponse:
    """Serve the frontend."""
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
