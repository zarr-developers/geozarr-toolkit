"""Tests for the spatial convention model."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from geozarr_toolkit.conventions import (
    SPATIAL_UUID,
    Spatial,
    SpatialConventionMetadata,
)


class TestSpatialConventionMetadata:
    """Tests for SpatialConventionMetadata."""

    def test_default_values(self) -> None:
        """Test that default values are set correctly."""
        metadata = SpatialConventionMetadata()
        assert metadata.uuid == SPATIAL_UUID
        assert metadata.name == "spatial:"
        assert "spatial" in metadata.schema_url
        assert "spatial" in metadata.spec_url

    def test_serialization(self) -> None:
        """Test that metadata serializes correctly."""
        metadata = SpatialConventionMetadata()
        data = metadata.model_dump(exclude_none=True)
        assert "uuid" in data
        assert data["uuid"] == SPATIAL_UUID


class TestSpatial:
    """Tests for Spatial model."""

    def test_minimal_required_fields(self) -> None:
        """Test creating Spatial with only required fields."""
        spatial = Spatial(**{"spatial:dimensions": ["Y", "X"]})
        assert spatial.dimensions == ["Y", "X"]
        assert spatial.transform_type == "affine"
        assert spatial.registration == "pixel"

    def test_missing_required_dimensions(self) -> None:
        """Test that missing dimensions raises ValidationError."""
        with pytest.raises(ValidationError):
            Spatial()

    def test_empty_dimensions_fails(self) -> None:
        """Test that empty dimensions list fails validation."""
        with pytest.raises(ValidationError, match="at least one dimension"):
            Spatial(**{"spatial:dimensions": []})

    def test_full_spatial_metadata(self) -> None:
        """Test creating Spatial with all fields."""
        data = {
            "spatial:dimensions": ["Y", "X"],
            "spatial:bbox": [500000.0, 4900000.0, 600000.0, 5000000.0],
            "spatial:transform": [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
            "spatial:shape": [1000, 1000],
            "spatial:registration": "pixel",
        }
        spatial = Spatial(**data)
        assert spatial.bbox == [500000.0, 4900000.0, 600000.0, 5000000.0]
        assert spatial.shape == [1000, 1000]

    def test_node_registration(self) -> None:
        """Test node registration type."""
        spatial = Spatial(
            **{
                "spatial:dimensions": ["Y", "X"],
                "spatial:registration": "node",
            }
        )
        assert spatial.registration == "node"

    def test_invalid_registration(self) -> None:
        """Test that invalid registration fails."""
        with pytest.raises(ValidationError, match="pixel.*node"):
            Spatial(
                **{
                    "spatial:dimensions": ["Y", "X"],
                    "spatial:registration": "invalid",
                }
            )

    def test_invalid_transform_length(self) -> None:
        """Test that transform with wrong length fails."""
        with pytest.raises(ValidationError, match="6 coefficients"):
            Spatial(
                **{
                    "spatial:dimensions": ["Y", "X"],
                    "spatial:transform": [1.0, 0.0, 0.0],  # Only 3, need 6
                }
            )

    def test_serialization_by_alias(self) -> None:
        """Test that serialization uses aliases."""
        spatial = Spatial(**{"spatial:dimensions": ["Y", "X"]})
        result = spatial.model_dump(by_alias=True)
        assert "spatial:dimensions" in result
        assert result["spatial:dimensions"] == ["Y", "X"]

    def test_3d_dimensions(self) -> None:
        """Test 3D spatial dimensions."""
        spatial = Spatial(**{"spatial:dimensions": ["Z", "Y", "X"]})
        assert spatial.dimensions == ["Z", "Y", "X"]

    def test_extra_fields_allowed(self) -> None:
        """Test that extra fields are allowed."""
        spatial = Spatial(
            **{
                "spatial:dimensions": ["Y", "X"],
                "custom_field": "value",
            }
        )
        assert hasattr(spatial, "custom_field") or "custom_field" in spatial.model_extra


def test_spatial_from_fixture(spatial_example: dict) -> None:
    """Test that all spatial examples validate correctly."""
    spatial = Spatial(**spatial_example)
    assert spatial.dimensions is not None
    assert len(spatial.dimensions) > 0
