"""Tests for the proj convention model."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from geozarr_toolkit.conventions import (
    PROJ_UUID,
    GeoProj,
    Proj,
    ProjConventionMetadata,
)


class TestProjConventionMetadata:
    """Tests for ProjConventionMetadata."""

    def test_default_values(self) -> None:
        """Test that default values are set correctly."""
        metadata = ProjConventionMetadata()
        assert metadata.uuid == PROJ_UUID
        assert metadata.name == "proj:"

    def test_serialization(self) -> None:
        """Test that metadata serializes correctly."""
        metadata = ProjConventionMetadata()
        data = metadata.model_dump(exclude_none=True)
        assert "uuid" in data
        assert data["uuid"] == PROJ_UUID


class TestProj:
    """Tests for Proj model."""

    def test_with_epsg_code(self) -> None:
        """Test creating Proj with EPSG code."""
        proj = Proj(**{"proj:code": "EPSG:4326"})
        assert proj.code == "EPSG:4326"
        assert proj.wkt2 is None
        assert proj.projjson is None

    def test_with_wkt2(self) -> None:
        """Test creating Proj with WKT2 string."""
        wkt = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]]]'
        proj = Proj(**{"proj:wkt2": wkt})
        assert proj.wkt2 == wkt
        assert proj.code is None

    def test_with_projjson(self) -> None:
        """Test creating Proj with PROJJSON."""
        projjson = {"type": "GeographicCRS", "name": "WGS 84"}
        proj = Proj(**{"proj:projjson": projjson})
        assert proj.projjson == projjson

    def test_missing_all_crs_fails(self) -> None:
        """Test that missing all CRS fields fails validation."""
        with pytest.raises(ValidationError, match="At least one"):
            Proj()

    def test_multiple_crs_allowed(self) -> None:
        """Test that multiple CRS representations are allowed."""
        proj = Proj(
            **{
                "proj:code": "EPSG:4326",
                "proj:wkt2": 'GEOGCS["WGS 84"]',
            }
        )
        assert proj.code == "EPSG:4326"
        assert proj.wkt2 == 'GEOGCS["WGS 84"]'

    def test_serialization_by_alias(self) -> None:
        """Test that serialization uses aliases."""
        proj = Proj(**{"proj:code": "EPSG:32633"})
        result = proj.model_dump(by_alias=True, exclude_none=True)
        assert "proj:code" in result
        assert result["proj:code"] == "EPSG:32633"
        assert "proj:wkt2" not in result  # Should be excluded as None

    def test_invalid_code_format(self) -> None:
        """Test that malformed code is rejected."""
        with pytest.raises(ValidationError, match="AUTHORITY:CODE"):
            Proj(**{"proj:code": "not-a-valid-code"})

    def test_unresolvable_code(self) -> None:
        """Test that a well-formed but nonexistent EPSG code is rejected."""
        with pytest.raises(ValidationError, match="does not resolve"):
            Proj(**{"proj:code": "EPSG:99999"})

    def test_geoproj_alias(self) -> None:
        """Test that GeoProj is an alias for Proj."""
        assert GeoProj is Proj


def test_proj_from_fixture(proj_example: dict) -> None:
    """Test that all proj examples validate correctly."""
    proj = Proj(**proj_example)
    # At least one CRS representation should be present
    assert proj.code or proj.wkt2 or proj.projjson
