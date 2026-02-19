# API Reference

This page documents the public API of the `geozarr-toolkit` library.

## Convention Models

Pydantic models for GeoZarr conventions.

### Spatial Convention

::: geozarr_toolkit.Spatial
    options:
      show_source: false

::: geozarr_toolkit.SpatialConventionMetadata
    options:
      show_source: false

### Proj Convention

::: geozarr_toolkit.Proj
    options:
      show_source: false

::: geozarr_toolkit.ProjConventionMetadata
    options:
      show_source: false

### Multiscales Convention

::: geozarr_toolkit.Multiscales
    options:
      show_source: false

::: geozarr_toolkit.MultiscalesConventionMetadata
    options:
      show_source: false

::: geozarr_toolkit.ScaleLevel
    options:
      show_source: false

::: geozarr_toolkit.Transform
    options:
      show_source: false

### Base Convention

::: geozarr_toolkit.ZarrConventionMetadata
    options:
      show_source: false

## Metadata Helpers

Functions for creating convention-compliant metadata.

::: geozarr_toolkit.create_zarr_conventions
    options:
      show_source: false

::: geozarr_toolkit.create_spatial_attrs
    options:
      show_source: false

::: geozarr_toolkit.create_proj_attrs
    options:
      show_source: false

::: geozarr_toolkit.create_multiscales_layout
    options:
      show_source: false

::: geozarr_toolkit.create_geozarr_attrs
    options:
      show_source: false

::: geozarr_toolkit.from_geotransform
    options:
      show_source: false

::: geozarr_toolkit.from_rioxarray
    options:
      show_source: false

## Validation Helpers

Functions for validating convention compliance.

::: geozarr_toolkit.validate_spatial
    options:
      show_source: false

::: geozarr_toolkit.validate_proj
    options:
      show_source: false

::: geozarr_toolkit.validate_multiscales
    options:
      show_source: false

::: geozarr_toolkit.validate_group
    options:
      show_source: false

::: geozarr_toolkit.validate_attrs
    options:
      show_source: false

::: geozarr_toolkit.detect_conventions
    options:
      show_source: false
