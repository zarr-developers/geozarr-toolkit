"""Tests for the multiscales convention model."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from pydantic.experimental.missing_sentinel import MISSING

from geozarr_toolkit.conventions import (
    MULTISCALES_UUID,
    Multiscales,
    MultiscalesAttrs,
    MultiscalesConventionMetadata,
    ScaleLevel,
    Transform,
    ZarrConventionMetadata,
)


class TestMultiscalesConventionMetadata:
    """Tests for MultiscalesConventionMetadata."""

    def test_default_values(self) -> None:
        """Test that default values are set correctly."""
        metadata = MultiscalesConventionMetadata()
        assert metadata.uuid == MULTISCALES_UUID
        assert metadata.name == "multiscales"

    def test_serialization(self) -> None:
        """Test that metadata serializes correctly."""
        metadata = MultiscalesConventionMetadata()
        data = metadata.model_dump(exclude_none=True)
        assert "uuid" in data
        assert data["uuid"] == MULTISCALES_UUID


class TestTransform:
    """Tests for Transform model."""

    def test_with_scale(self) -> None:
        """Test creating Transform with scale."""
        transform = Transform(scale=(2.0, 2.0))
        assert transform.scale == (2.0, 2.0)
        assert transform.translation is MISSING

    def test_with_scale_and_translation(self) -> None:
        """Test creating Transform with both scale and translation."""
        transform = Transform(scale=(2.0, 2.0), translation=(0.5, 0.5))
        assert transform.scale == (2.0, 2.0)
        assert transform.translation == (0.5, 0.5)


class TestScaleLevel:
    """Tests for ScaleLevel model."""

    def test_minimal_level(self) -> None:
        """Test creating ScaleLevel with only asset."""
        level = ScaleLevel(asset="0")
        assert level.asset == "0"
        assert level.derived_from is MISSING

    def test_with_derived_from(self) -> None:
        """Test creating ScaleLevel with derived_from."""
        level = ScaleLevel(
            asset="1",
            derived_from="0",
            transform=Transform(scale=(2.0, 2.0)),
        )
        assert level.asset == "1"
        assert level.derived_from == "0"
        assert level.transform.scale == (2.0, 2.0)


class TestMultiscales:
    """Tests for Multiscales model."""

    def test_basic_layout(self) -> None:
        """Test creating Multiscales with basic layout."""
        multiscales = Multiscales(
            layout=(
                ScaleLevel(asset="0"),
                ScaleLevel(asset="1", derived_from="0"),
            )
        )
        assert len(multiscales.layout) == 2

    def test_empty_layout_fails(self) -> None:
        """Test that empty layout fails validation."""
        with pytest.raises(ValidationError, match="at least one level"):
            Multiscales(layout=())

    def test_with_resampling_method(self) -> None:
        """Test creating Multiscales with resampling method."""
        multiscales = Multiscales(
            layout=(ScaleLevel(asset="0"),),
            resampling_method="average",
        )
        assert multiscales.resampling_method == "average"


class TestMultiscalesAttrs:
    """Tests for MultiscalesAttrs model."""

    def test_valid_attrs(self) -> None:
        """Test creating valid MultiscalesAttrs."""
        attrs = MultiscalesAttrs(
            zarr_conventions=(MultiscalesConventionMetadata(),),
            multiscales=Multiscales(layout=(ScaleLevel(asset="0"),)),
        )
        assert len(attrs.zarr_conventions) == 1
        assert len(attrs.multiscales.layout) == 1

    def test_missing_multiscales_convention(self) -> None:
        """Test that missing multiscales convention fails."""
        other_convention = ZarrConventionMetadata(uuid="other-uuid")
        with pytest.raises(ValidationError, match="multiscales convention"):
            MultiscalesAttrs(
                zarr_conventions=(other_convention,),
                multiscales=Multiscales(layout=(ScaleLevel(asset="0"),)),
            )


def test_multiscales_from_fixture(multiscales_example: dict) -> None:
    """Test that all multiscales examples validate correctly."""
    if "multiscales" in multiscales_example:
        multiscales = Multiscales(**multiscales_example["multiscales"])
        assert len(multiscales.layout) > 0
