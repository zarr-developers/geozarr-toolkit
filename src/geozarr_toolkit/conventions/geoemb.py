"""
Models for the Geoembeddings Zarr Convention.

This convention defines metadata for geospatial embedding groups stored in
Zarr format, including encoder model provenance, source data references,
and processing parameters.

Specification: https://github.com/geo-embeddings/embeddings-zarr-convention
"""

from __future__ import annotations

from typing import Annotated, Final, Literal

from pydantic import BaseModel, Field, model_validator

from geozarr_toolkit.conventions.common import ZarrConventionMetadata, is_none

GEOEMB_UUID: Final[Literal["61c12cc5-0e28-4056-999a-480cf3fb7e4c"]] = (
    "61c12cc5-0e28-4056-999a-480cf3fb7e4c"
)
GEOEMB_SCHEMA_URL: Final[str] = (
    "https://github.com/geo-embeddings/embeddings-zarr-convention/blob/main/schema.json"
)
GEOEMB_SPEC_URL: Final[str] = (
    "https://github.com/geo-embeddings/embeddings-zarr-convention/blob/main/README.md"
)


class GeoembConventionMetadata(ZarrConventionMetadata):
    """Metadata for the geoemb: convention in zarr_conventions array."""

    uuid: Literal["61c12cc5-0e28-4056-999a-480cf3fb7e4c"] = GEOEMB_UUID
    name: Literal["geoemb:"] = "geoemb:"
    schema_url: str = GEOEMB_SCHEMA_URL
    spec_url: str = GEOEMB_SPEC_URL
    description: str = (
        "Geoembeddings convention for geospatial embedding arrays with model provenance"
    )


class ChipLayout(BaseModel):
    """
    Chip layout configuration for chip-type embeddings.

    Describes how the source imagery was divided into chips (patches).

    Attributes
    ----------
    layout_type : str
        Type of chip layout. Either "regular_grid" or "irregular".
    chip_size : list[int]
        Chip dimensions [height, width] in pixels.
    stride : list[int] | None
        Stride between chips [y, x]. Defaults to chip_size if not specified.
    grid_id : str | None
        Identifier for a predefined grid system.
    grid_definition : str | None
        URL to grid definition document.
    """

    layout_type: Literal["regular_grid", "irregular"]
    chip_size: list[int] = Field(min_length=2, max_length=2)
    stride: list[int] | None = Field(None, exclude_if=is_none)
    grid_id: str | None = Field(None, exclude_if=is_none)
    grid_definition: str | None = Field(None, exclude_if=is_none)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_chip_size_positive(self) -> ChipLayout:
        """Validate that chip_size values are positive."""
        if any(s < 1 for s in self.chip_size):
            raise ValueError("chip_size values must be positive integers")
        return self

    @model_validator(mode="after")
    def validate_stride_length(self) -> ChipLayout:
        """Validate that stride has exactly 2 elements when provided."""
        if self.stride is not None and len(self.stride) != 2:
            raise ValueError("stride must have exactly 2 elements [y, x]")
        return self


class ScaleScalar(BaseModel):
    """
    Scalar scale for linear dequantization.

    Dequantize with: value = quantized * scale + offset.
    """

    type: Literal["scalar"]
    scale: float
    offset: float = 0.0

    model_config = {"extra": "forbid"}


class ScaleArray(BaseModel):
    """
    Per-pixel scale factors stored in a separate Zarr array.

    Dequantize with: value[..., y, x] = quantized[..., y, x] * array[..., y, x].
    Non-finite values (NaN, +inf) in the scale array indicate no-data pixels.
    """

    type: Literal["array"]
    array_name: str
    nodata: float | str | None = Field(None, exclude_if=is_none)

    model_config = {"extra": "forbid"}


Scale = Annotated[ScaleScalar | ScaleArray, Field(discriminator="type")]


class Quantization(BaseModel):
    """
    Quantization details for compressed embeddings.

    Attributes
    ----------
    method : str
        Quantization method (e.g., "linear", "per_pixel_scale",
        "product_quantization", "binary").
    original_dtype : str
        Original data type before quantization (e.g., "float32").
    quantized_dtype : str | None
        Data type after quantization (e.g., "int8").
    scale : ScaleScalar | ScaleArray | None
        Scale parameters for dequantization.
    link : str | None
        URL to quantization codebook or lookup table.
    """

    method: str
    original_dtype: str
    quantized_dtype: str | None = Field(None, exclude_if=is_none)
    scale: Scale | None = Field(None, exclude_if=is_none)
    link: str | None = Field(None, exclude_if=is_none)

    model_config = {"extra": "forbid"}


class Geoemb(BaseModel):
    """
    Geoembeddings convention attributes for a Zarr group.

    Attributes
    ----------
    type : str
        Type of embedding: "pixel" for per-pixel embeddings,
        "chip" for image patch embeddings. Required.
    dimensions : int
        Dimensionality of the embedding vector. Required.
    model : str
        URL reference to the encoder model used to generate embeddings. Required.
    source_data : list[str]
        URL references to the source datasets. Required, at least one item.
    data_type : str
        Data type of stored embeddings (e.g., "float32", "int8"). Required.
    gsd : float | None
        Ground sample distance in meters.
    chip_layout : ChipLayout | None
        Chip layout configuration. Required when type is "chip".
    quantization : Quantization | None
        Compression/quantization details.
    spatial_layout : str | None
        Spatial organization scheme: "utm_zones" or "global".
    build_version : str | None
        Version of the software that built this store.
    benchmark : list[str] | None
        URLs to benchmark evaluation results.
    """

    type: Literal["pixel", "chip"] = Field(alias="geoemb:type")
    dimensions: int = Field(alias="geoemb:dimensions", ge=1)
    model: str = Field(alias="geoemb:model")
    source_data: list[str] = Field(alias="geoemb:source_data", min_length=1)
    data_type: str = Field(alias="geoemb:data_type")
    gsd: float | None = Field(None, alias="geoemb:gsd", exclude_if=is_none)
    chip_layout: ChipLayout | None = Field(
        None, alias="geoemb:chip_layout", exclude_if=is_none
    )
    quantization: Quantization | None = Field(
        None, alias="geoemb:quantization", exclude_if=is_none
    )
    spatial_layout: Literal["utm_zones", "global"] | None = Field(
        None, alias="geoemb:spatial_layout", exclude_if=is_none
    )
    build_version: str | None = Field(
        None, alias="geoemb:build_version", exclude_if=is_none
    )
    benchmark: list[str] | None = Field(
        None, alias="geoemb:benchmark", exclude_if=is_none
    )

    model_config = {
        "extra": "allow",
        "populate_by_name": True,
        "serialize_by_alias": True,
    }

    @model_validator(mode="after")
    def validate_chip_layout_required(self) -> Geoemb:
        """Validate that chip_layout is provided when type is 'chip'."""
        if self.type == "chip" and self.chip_layout is None:
            raise ValueError(
                "geoemb:chip_layout is required when geoemb:type is 'chip'"
            )
        return self
