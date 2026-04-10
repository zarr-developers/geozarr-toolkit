"""Tests for the geoemb convention model."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from geozarr_toolkit.conventions import (
    GEOEMB_UUID,
    ChipLayout,
    Geoemb,
    GeoembConventionMetadata,
    Quantization,
)

MINIMAL_PIXEL: dict = {
    "geoemb:type": "pixel",
    "geoemb:dimensions": 64,
    "geoemb:model": "https://arxiv.org/abs/2507.22291",
    "geoemb:source_data": [
        "https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL"
    ],
    "geoemb:data_type": "int8",
}

MINIMAL_CHIP_LAYOUT: dict = {"layout_type": "regular_grid", "chip_size": [256, 256]}


class TestGeoembConventionMetadata:
    def test_defaults(self) -> None:
        meta = GeoembConventionMetadata()
        assert meta.uuid == GEOEMB_UUID
        assert meta.name == "geoemb:"
        assert "geo-embeddings" in meta.schema_url
        assert "geo-embeddings" in meta.spec_url

    def test_serialization(self) -> None:
        data = GeoembConventionMetadata().model_dump(exclude_none=True)
        assert data["uuid"] == GEOEMB_UUID


class TestGeoemb:
    def test_minimal_pixel(self) -> None:
        emb = Geoemb(**MINIMAL_PIXEL)
        assert emb.type == "pixel"
        assert emb.dimensions == 64
        assert emb.chip_layout is None

    def test_minimal_chip(self) -> None:
        emb = Geoemb(
            **{
                **MINIMAL_PIXEL,
                "geoemb:type": "chip",
                "geoemb:chip_layout": MINIMAL_CHIP_LAYOUT,
            }
        )
        assert emb.type == "chip"
        assert emb.chip_layout.layout_type == "regular_grid"
        assert emb.chip_layout.chip_size == [256, 256]

    def test_chip_requires_chip_layout(self) -> None:
        with pytest.raises(ValidationError, match="geoemb:chip_layout is required"):
            Geoemb(**{**MINIMAL_PIXEL, "geoemb:type": "chip"})

    def test_optional_fields(self) -> None:
        emb = Geoemb(
            **{
                **MINIMAL_PIXEL,
                "geoemb:gsd": 10.0,
                "geoemb:spatial_layout": "utm_zones",
                "geoemb:build_version": "1.0.0",
            }
        )
        assert emb.gsd == 10.0
        assert emb.spatial_layout == "utm_zones"

    def test_quantization_scalar_scale(self) -> None:
        emb = Geoemb(
            **{
                **MINIMAL_PIXEL,
                "geoemb:quantization": {
                    "method": "linear",
                    "original_dtype": "float32",
                    "scale": {"type": "scalar", "scale": 0.01},
                },
            }
        )
        assert emb.quantization.method == "linear"
        assert emb.quantization.scale.type == "scalar"

    def test_quantization_array_scale(self) -> None:
        emb = Geoemb(
            **{
                **MINIMAL_PIXEL,
                "geoemb:quantization": {
                    "method": "per_pixel_scale",
                    "original_dtype": "float32",
                    "scale": {"type": "array", "array_name": "scales"},
                },
            }
        )
        assert emb.quantization.scale.type == "array"
        assert emb.quantization.scale.array_name == "scales"

    def test_serialization_uses_aliases(self) -> None:
        emb = Geoemb(**MINIMAL_PIXEL)
        data = emb.model_dump(by_alias=True)
        assert "geoemb:type" in data
        assert "geoemb:dimensions" in data

    def test_extra_fields_allowed(self) -> None:
        emb = Geoemb(**{**MINIMAL_PIXEL, "zarr_conventions": []})
        assert emb is not None


class TestChipLayout:
    def test_invalid_chip_size_values(self) -> None:
        with pytest.raises(ValidationError, match="positive"):
            ChipLayout(layout_type="regular_grid", chip_size=[256, 0])

    def test_stride_wrong_length(self) -> None:
        with pytest.raises(ValidationError, match="2 elements"):
            ChipLayout(layout_type="regular_grid", chip_size=[256, 256], stride=[256])
