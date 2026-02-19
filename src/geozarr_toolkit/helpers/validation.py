"""
Validation utilities for GeoZarr conventions.

These utilities help validate that Zarr metadata conforms to the
spatial, proj, and multiscales conventions.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from geozarr_toolkit.conventions import (
    MULTISCALES_UUID,
    PROJ_UUID,
    SPATIAL_UUID,
    Multiscales,
    Proj,
    Spatial,
)

if TYPE_CHECKING:
    import zarr


def validate_spatial(attrs: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Validate attributes against the spatial: convention.

    Parameters
    ----------
    attrs : dict
        Attributes dictionary to validate.

    Returns
    -------
    tuple[bool, list[str]]
        (is_valid, list_of_errors)

    Example
    -------
    ```python
    is_valid, errors = validate_spatial({
        "spatial:dimensions": ["Y", "X"],
        "spatial:transform": [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
    })
    ```
    True
    """
    try:
        Spatial(**attrs)
        return True, []
    except ValidationError as e:
        return False, [str(err) for err in e.errors()]


def validate_proj(attrs: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Validate attributes against the proj: convention.

    Parameters
    ----------
    attrs : dict
        Attributes dictionary to validate.

    Returns
    -------
    tuple[bool, list[str]]
        (is_valid, list_of_errors)
    """
    try:
        Proj(**attrs)
        return True, []
    except ValidationError as e:
        return False, [str(err) for err in e.errors()]


def validate_multiscales(attrs: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Validate attributes against the multiscales convention.

    Parameters
    ----------
    attrs : dict
        Attributes dictionary to validate. Should have 'multiscales' key.

    Returns
    -------
    tuple[bool, list[str]]
        (is_valid, list_of_errors)
    """
    if "multiscales" not in attrs:
        return False, ["Missing 'multiscales' key in attributes"]

    try:
        Multiscales(**attrs["multiscales"])
        return True, []
    except ValidationError as e:
        return False, [str(err) for err in e.errors()]


def validate_zarr_conventions(attrs: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Validate that zarr_conventions array is properly formatted.

    Parameters
    ----------
    attrs : dict
        Attributes dictionary with zarr_conventions key.

    Returns
    -------
    tuple[bool, list[str]]
        (is_valid, list_of_errors)
    """
    errors = []

    if "zarr_conventions" not in attrs:
        return False, ["Missing 'zarr_conventions' key in attributes"]

    conventions = attrs["zarr_conventions"]
    if not isinstance(conventions, list):
        return False, ["zarr_conventions must be a list"]

    for i, conv in enumerate(conventions):
        if not isinstance(conv, dict):
            errors.append(f"Convention {i} must be a dictionary")
            continue

        # Check that at least one identifier is present
        has_id = any(conv.get(key) for key in ("uuid", "schema_url", "spec_url"))
        if not has_id:
            errors.append(f"Convention {i} must have at least one of: uuid, schema_url, spec_url")

    return len(errors) == 0, errors


def detect_conventions(attrs: dict[str, Any]) -> list[str]:
    """
    Detect which GeoZarr conventions are present in attributes.

    Parameters
    ----------
    attrs : dict
        Attributes dictionary to inspect.

    Returns
    -------
    list[str]
        List of detected convention names.
    """
    detected = []

    # Check for spatial convention
    if "spatial:dimensions" in attrs:
        detected.append("spatial")

    # Check for proj convention
    if any(key.startswith("proj:") for key in attrs):
        detected.append("proj")

    # Check for multiscales convention
    if "multiscales" in attrs:
        detected.append("multiscales")

    # Also check zarr_conventions array
    if "zarr_conventions" in attrs:
        for conv in attrs["zarr_conventions"]:
            if isinstance(conv, dict):
                uuid = conv.get("uuid")
                name = conv.get("name")
                if (uuid == SPATIAL_UUID or name == "spatial:") and "spatial" not in detected:
                    detected.append("spatial")
                if (uuid == PROJ_UUID or name == "proj:") and "proj" not in detected:
                    detected.append("proj")
                if (
                    uuid == MULTISCALES_UUID or name == "multiscales"
                ) and "multiscales" not in detected:
                    detected.append("multiscales")

    return detected


def validate_group(
    group: zarr.Group,
    conventions: list[str] | None = None,
) -> dict[str, list[str]]:
    """
    Validate a Zarr group against specified conventions.

    Parameters
    ----------
    group : zarr.Group
        Zarr group to validate.
    conventions : list[str], optional
        Conventions to validate against. If None, auto-detects.
        Options: "spatial", "proj", "multiscales"

    Returns
    -------
    dict[str, list[str]]
        Dictionary mapping convention names to lists of errors.
        Empty error list means validation passed.

    Example
    -------
    ```python
    import zarr
    group = zarr.open_group("path/to/data.zarr")
    results = validate_group(group)
    for conv, errors in results.items():
        if errors:
            print(f"{conv}: {errors}")
    ```
    """
    attrs = dict(group.attrs)
    results: dict[str, list[str]] = {}

    # Auto-detect conventions if not specified
    if conventions is None:
        conventions = detect_conventions(attrs)

    # Validate each convention
    if "spatial" in conventions:
        is_valid, errors = validate_spatial(attrs)
        results["spatial"] = errors

    if "proj" in conventions:
        is_valid, errors = validate_proj(attrs)
        results["proj"] = errors

    if "multiscales" in conventions:
        is_valid, errors = validate_multiscales(attrs)
        results["multiscales"] = errors

    # Always check zarr_conventions if present
    if "zarr_conventions" in attrs:
        is_valid, errors = validate_zarr_conventions(attrs)
        results["zarr_conventions"] = errors

    return results


def validate_multiscales_structure(group: zarr.Group) -> tuple[bool, list[str]]:
    """
    Validate that a multiscales group has all referenced assets.

    Checks that each 'asset' path in the multiscales layout actually
    exists in the group.

    Parameters
    ----------
    group : zarr.Group
        Zarr group with multiscales convention.

    Returns
    -------
    tuple[bool, list[str]]
        (is_valid, list_of_errors)
    """
    attrs = dict(group.attrs)
    errors = []

    if "multiscales" not in attrs:
        return False, ["Group does not have multiscales attribute"]

    multiscales = attrs["multiscales"]
    if "layout" not in multiscales:
        return False, ["multiscales missing 'layout' key"]

    for level in multiscales["layout"]:
        asset = level.get("asset")
        if not asset:
            errors.append("Scale level missing 'asset' key")
            continue

        # Check if asset exists in group
        if asset not in group:
            errors.append(f"Asset '{asset}' not found in group")

        # Check derived_from reference
        derived_from = level.get("derived_from")
        if derived_from and derived_from not in group:
            errors.append(f"derived_from '{derived_from}' not found in group")

    return len(errors) == 0, errors


def validate_attrs(
    attrs: dict[str, Any],
    conventions: list[str] | None = None,
) -> dict[str, list[str]]:
    """
    Validate attributes dictionary against specified conventions.

    Parameters
    ----------
    attrs : dict
        Attributes dictionary to validate.
    conventions : list[str], optional
        Conventions to validate. If None, auto-detects.

    Returns
    -------
    dict[str, list[str]]
        Dictionary mapping convention names to lists of errors.
    """
    results: dict[str, list[str]] = {}

    if conventions is None:
        conventions = detect_conventions(attrs)

    if "spatial" in conventions:
        _, errors = validate_spatial(attrs)
        results["spatial"] = errors

    if "proj" in conventions:
        _, errors = validate_proj(attrs)
        results["proj"] = errors

    if "multiscales" in conventions:
        _, errors = validate_multiscales(attrs)
        results["multiscales"] = errors

    if "zarr_conventions" in attrs:
        _, errors = validate_zarr_conventions(attrs)
        results["zarr_conventions"] = errors

    return results
