"""Tests for metadata helper functions."""

from __future__ import annotations

import pytest

from geozarr_toolkit.conventions import (
    ProjConventionMetadata,
    SpatialConventionMetadata,
)
from geozarr_toolkit.helpers.metadata import (
    create_geozarr_attrs,
    create_multiscales_layout,
    create_proj_attrs,
    create_spatial_attrs,
    create_zarr_conventions,
    from_geotransform,
)


class TestCreateZarrConventions:
    """Tests for create_zarr_conventions."""

    def test_single_convention(self) -> None:
        """Test creating with a single convention."""
        result = create_zarr_conventions(SpatialConventionMetadata())
        assert len(result) == 1
        assert result[0]["name"] == "spatial:"

    def test_multiple_conventions(self) -> None:
        """Test creating with multiple conventions."""
        result = create_zarr_conventions(
            SpatialConventionMetadata(),
            ProjConventionMetadata(),
        )
        assert len(result) == 2
        names = {conv["name"] for conv in result}
        assert "spatial:" in names
        assert "proj:" in names


class TestCreateSpatialAttrs:
    """Tests for create_spatial_attrs."""

    def test_minimal(self) -> None:
        """Test creating minimal spatial attrs."""
        result = create_spatial_attrs(dimensions=["Y", "X"])
        assert result["spatial:dimensions"] == ["Y", "X"]

    def test_with_transform(self) -> None:
        """Test creating with transform."""
        result = create_spatial_attrs(
            dimensions=["Y", "X"],
            transform=(10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0),
        )
        assert "spatial:transform" in result
        assert len(result["spatial:transform"]) == 6

    def test_with_all_fields(self) -> None:
        """Test creating with all fields."""
        result = create_spatial_attrs(
            dimensions=["Y", "X"],
            transform=(10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0),
            bbox=(500000.0, 4900000.0, 600000.0, 5000000.0),
            shape=(1000, 1000),
            registration="node",
        )
        assert "spatial:bbox" in result
        assert "spatial:shape" in result
        assert result["spatial:registration"] == "node"


class TestCreateProjAttrs:
    """Tests for create_proj_attrs."""

    def test_with_code(self) -> None:
        """Test creating with EPSG code."""
        result = create_proj_attrs(code="EPSG:4326")
        assert result["proj:code"] == "EPSG:4326"

    def test_with_wkt2(self) -> None:
        """Test creating with WKT2."""
        wkt = 'GEOGCS["WGS 84"]'
        result = create_proj_attrs(wkt2=wkt)
        assert result["proj:wkt2"] == wkt

    def test_missing_all_raises(self) -> None:
        """Test that missing all CRS fields raises."""
        with pytest.raises(ValueError, match="(?i)at least one"):
            create_proj_attrs()


class TestCreateMultiscalesLayout:
    """Tests for create_multiscales_layout."""

    def test_basic_pyramid(self) -> None:
        """Test creating basic pyramid layout."""
        result = create_multiscales_layout(
            [
                {"asset": "0"},
                {"asset": "1", "derived_from": "0", "transform": {"scale": [2.0, 2.0]}},
            ]
        )
        assert "multiscales" in result
        layout = result["multiscales"]["layout"]
        assert len(layout) == 2

    def test_with_resampling_method(self) -> None:
        """Test creating with resampling method."""
        result = create_multiscales_layout(
            [{"asset": "0"}],
            resampling_method="average",
        )
        assert result["multiscales"]["resampling_method"] == "average"


class TestFromGeotransform:
    """Tests for from_geotransform."""

    def test_gdal_to_affine_conversion(self) -> None:
        """Test GDAL geotransform to affine conversion."""
        # GDAL format: [c, a, b, f, d, e]
        # Origin at (500000, 5000000), 10m resolution
        gdal_gt = (500000.0, 10.0, 0.0, 5000000.0, 0.0, -10.0)
        wkt = 'PROJCS["UTM zone 33N"]'
        shape = (1000, 1000)

        result = from_geotransform(gdal_gt, wkt, shape)

        assert "spatial:dimensions" in result
        assert "spatial:transform" in result
        assert "proj:wkt2" in result

        # Affine format: [a, b, c, d, e, f]
        transform = result["spatial:transform"]
        assert transform[0] == 10.0  # a (pixel width)
        assert transform[2] == 500000.0  # c (origin x)


class TestCreateGeozarrAttrs:
    """Tests for create_geozarr_attrs."""

    def test_with_epsg_code(self) -> None:
        """Test creating with EPSG code."""
        result = create_geozarr_attrs(
            dimensions=["Y", "X"],
            crs="EPSG:4326",
        )
        assert "spatial:dimensions" in result
        assert "proj:code" in result
        assert "zarr_conventions" in result
        assert len(result["zarr_conventions"]) == 2

    def test_without_conventions(self) -> None:
        """Test creating without conventions array."""
        result = create_geozarr_attrs(
            dimensions=["Y", "X"],
            include_conventions=False,
        )
        assert "zarr_conventions" not in result

    def test_with_wkt2_crs(self) -> None:
        """Test that WKT2 is used for non-EPSG CRS."""
        wkt = 'GEOGCS["Custom CRS"]'
        result = create_geozarr_attrs(
            dimensions=["Y", "X"],
            crs=wkt,
        )
        assert "proj:wkt2" in result
        assert result["proj:wkt2"] == wkt
