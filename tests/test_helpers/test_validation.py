"""Tests for validation helper functions."""

from __future__ import annotations

from geozarr_toolkit.conventions import MULTISCALES_UUID, SPATIAL_UUID
from geozarr_toolkit.helpers.validation import (
    detect_conventions,
    validate_attrs,
    validate_multiscales,
    validate_proj,
    validate_spatial,
    validate_zarr_conventions,
)


class TestValidateSpatial:
    """Tests for validate_spatial."""

    def test_valid_spatial(self) -> None:
        """Test validating valid spatial attrs."""
        attrs = {"spatial:dimensions": ["Y", "X"]}
        is_valid, errors = validate_spatial(attrs)
        assert is_valid
        assert len(errors) == 0

    def test_invalid_spatial(self) -> None:
        """Test validating invalid spatial attrs."""
        attrs: dict[str, list[str]] = {"spatial:dimensions": []}  # Empty dimensions
        is_valid, errors = validate_spatial(attrs)
        assert not is_valid
        assert len(errors) > 0


class TestValidateProj:
    """Tests for validate_proj."""

    def test_valid_proj(self) -> None:
        """Test validating valid proj attrs."""
        attrs = {"proj:code": "EPSG:4326"}
        is_valid, errors = validate_proj(attrs)
        assert is_valid
        assert len(errors) == 0

    def test_invalid_proj(self) -> None:
        """Test validating invalid proj attrs."""
        attrs: dict[str, str] = {}  # Missing all CRS fields
        is_valid, errors = validate_proj(attrs)
        assert not is_valid
        assert len(errors) > 0


class TestValidateMultiscales:
    """Tests for validate_multiscales."""

    def test_valid_multiscales(self) -> None:
        """Test validating valid multiscales attrs."""
        attrs = {
            "multiscales": {
                "layout": [{"asset": "0"}],
            }
        }
        is_valid, errors = validate_multiscales(attrs)
        assert is_valid
        assert len(errors) == 0

    def test_missing_multiscales_key(self) -> None:
        """Test validating missing multiscales key."""
        attrs: dict[str, object] = {}
        is_valid, errors = validate_multiscales(attrs)
        assert not is_valid
        assert "Missing 'multiscales'" in errors[0]


class TestValidateZarrConventions:
    """Tests for validate_zarr_conventions."""

    def test_valid_conventions(self) -> None:
        """Test validating valid zarr_conventions."""
        attrs = {
            "zarr_conventions": [
                {"uuid": SPATIAL_UUID, "name": "spatial:"},
            ]
        }
        is_valid, errors = validate_zarr_conventions(attrs)
        assert is_valid
        assert len(errors) == 0

    def test_missing_identifier(self) -> None:
        """Test validating convention without identifier."""
        attrs = {
            "zarr_conventions": [
                {"name": "custom"},  # Missing uuid/schema_url/spec_url
            ]
        }
        is_valid, errors = validate_zarr_conventions(attrs)
        assert not is_valid


class TestDetectConventions:
    """Tests for detect_conventions."""

    def test_detect_spatial(self) -> None:
        """Test detecting spatial convention."""
        attrs = {"spatial:dimensions": ["Y", "X"]}
        detected = detect_conventions(attrs)
        assert "spatial" in detected

    def test_detect_proj(self) -> None:
        """Test detecting proj convention."""
        attrs = {"proj:code": "EPSG:4326"}
        detected = detect_conventions(attrs)
        assert "proj" in detected

    def test_detect_multiscales(self) -> None:
        """Test detecting multiscales convention."""
        attrs: dict[str, dict[str, list[object]]] = {"multiscales": {"layout": []}}
        detected = detect_conventions(attrs)
        assert "multiscales" in detected

    def test_detect_from_zarr_conventions(self) -> None:
        """Test detecting from zarr_conventions array."""
        attrs = {
            "zarr_conventions": [
                {"uuid": MULTISCALES_UUID},
            ]
        }
        detected = detect_conventions(attrs)
        assert "multiscales" in detected

    def test_detect_all(self) -> None:
        """Test detecting all conventions."""
        attrs = {
            "spatial:dimensions": ["Y", "X"],
            "proj:code": "EPSG:4326",
            "multiscales": {"layout": []},
        }
        detected = detect_conventions(attrs)
        assert set(detected) == {"spatial", "proj", "multiscales"}


class TestValidateAttrs:
    """Tests for validate_attrs."""

    def test_validate_all_detected(self) -> None:
        """Test validating all detected conventions."""
        attrs = {
            "spatial:dimensions": ["Y", "X"],
            "proj:code": "EPSG:4326",
        }
        results = validate_attrs(attrs)
        assert "spatial" in results
        assert "proj" in results
        assert len(results["spatial"]) == 0  # No errors
        assert len(results["proj"]) == 0  # No errors

    def test_validate_specific_conventions(self) -> None:
        """Test validating specific conventions."""
        attrs = {"spatial:dimensions": ["Y", "X"]}
        results = validate_attrs(attrs, conventions=["spatial"])
        assert "spatial" in results
        assert "proj" not in results
