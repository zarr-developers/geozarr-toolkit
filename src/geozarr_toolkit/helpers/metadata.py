"""
Helper functions for generating GeoZarr-compliant metadata.

These utilities help create convention-compliant metadata from various
sources including rioxarray DataArrays and GDAL-style GeoTransforms.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from geozarr_toolkit.conventions import (
    Proj,
    ProjConventionMetadata,
    ScaleLevel,
    Spatial,
    SpatialConventionMetadata,
    ZarrConventionMetadata,
)

if TYPE_CHECKING:
    import xarray as xr


def create_zarr_conventions(
    *conventions: ZarrConventionMetadata,
) -> list[dict[str, Any]]:
    """
    Create a zarr_conventions array from convention metadata objects.

    Parameters
    ----------
    *conventions : ZarrConventionMetadata
        One or more convention metadata objects.

    Returns
    -------
    list[dict[str, Any]]
        List of convention metadata dictionaries suitable for zarr_conventions.

    Example
    -------
    ```python
    from geozarr_toolkit.conventions import (
        SpatialConventionMetadata,
        ProjConventionMetadata,
    )
    conventions = create_zarr_conventions(
        SpatialConventionMetadata(),
        ProjConventionMetadata(),
    )
    ```
    """
    return [conv.model_dump(exclude_none=True) for conv in conventions]


def create_spatial_attrs(
    dimensions: list[str],
    *,
    transform: tuple[float, ...] | list[float] | None = None,
    bbox: tuple[float, ...] | list[float] | None = None,
    shape: tuple[int, ...] | list[int] | None = None,
    registration: str = "pixel",
) -> dict[str, Any]:
    """
    Create spatial: convention attributes.

    Parameters
    ----------
    dimensions : list[str]
        Names of spatial dimensions, e.g., ["Y", "X"].
    transform : tuple or list of float, optional
        Affine transformation coefficients [a, b, c, d, e, f].
    bbox : tuple or list of float, optional
        Bounding box [xmin, ymin, xmax, ymax].
    shape : tuple or list of int, optional
        Spatial shape [height, width].
    registration : str, default "pixel"
        Grid registration type: "pixel" or "node".

    Returns
    -------
    dict[str, Any]
        Dictionary of spatial: convention attributes.
    """
    spatial = Spatial(
        dimensions=dimensions,
        transform=list(transform) if transform else None,
        bbox=list(bbox) if bbox else None,
        shape=list(shape) if shape else None,
        registration=registration,
    )
    result: dict[str, Any] = spatial.model_dump(exclude_none=True, by_alias=True)
    return result


def create_proj_attrs(
    *,
    code: str | None = None,
    wkt2: str | None = None,
    projjson: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Create proj: convention attributes.

    At least one of code, wkt2, or projjson must be provided.

    Parameters
    ----------
    code : str, optional
        EPSG code, e.g., "EPSG:4326".
    wkt2 : str, optional
        WKT2 CRS string.
    projjson : dict, optional
        PROJJSON CRS dictionary.

    Returns
    -------
    dict[str, Any]
        Dictionary of proj: convention attributes.
    """
    proj = Proj(code=code, wkt2=wkt2, projjson=projjson)
    result: dict[str, Any] = proj.model_dump(exclude_none=True, by_alias=True)
    return result


def create_multiscales_layout(
    levels: list[dict[str, Any]],
    *,
    resampling_method: str | None = None,
) -> dict[str, Any]:
    """
    Create multiscales convention layout.

    Parameters
    ----------
    levels : list[dict]
        List of level dictionaries. Each must have 'asset' key.
        Optional keys: 'derived_from', 'transform', 'resampling_method'.
    resampling_method : str, optional
        Default resampling method for all levels.

    Returns
    -------
    dict[str, Any]
        Dictionary with 'multiscales' key containing the layout.

    Example
    -------
    ```python
    layout = create_multiscales_layout([
        {"asset": "0"},
        {"asset": "1", "derived_from": "0", "transform": {"scale": [2.0, 2.0]}},
    ])
    ```
    """
    from pydantic.experimental.missing_sentinel import MISSING

    from geozarr_toolkit.conventions import Multiscales, Transform

    scale_levels = []
    for level in levels:
        transform_data = level.get("transform")
        transform = MISSING
        if transform_data:
            transform = Transform(
                scale=tuple(transform_data.get("scale", [])) or MISSING,
                translation=tuple(transform_data.get("translation", [])) or MISSING,
            )

        scale_levels.append(
            ScaleLevel(
                asset=level["asset"],
                derived_from=level.get("derived_from", MISSING),
                transform=transform,
                resampling_method=level.get("resampling_method", MISSING),
            )
        )

    multiscales = Multiscales(
        layout=tuple(scale_levels),
        resampling_method=resampling_method if resampling_method else MISSING,
    )

    return {"multiscales": multiscales.model_dump(exclude_none=True, exclude_unset=True)}


def from_geotransform(
    geotransform: tuple[float, ...] | list[float],
    crs_wkt: str,
    shape: tuple[int, int],
    dimensions: list[str] | None = None,
) -> dict[str, Any]:
    """
    Convert GDAL-style GeoTransform to convention attributes.

    GDAL GeoTransform format: [c, a, b, f, d, e]
    - c: x-coordinate of upper-left corner
    - a: pixel width (x resolution)
    - b: row rotation (typically 0)
    - f: y-coordinate of upper-left corner
    - d: column rotation (typically 0)
    - e: pixel height (y resolution, typically negative)

    Rasterio/Affine format (used by spatial convention): [a, b, c, d, e, f]

    Parameters
    ----------
    geotransform : tuple or list of float
        GDAL-style geotransform [c, a, b, f, d, e].
    crs_wkt : str
        WKT string of the CRS.
    shape : tuple of int
        Array shape (height, width).
    dimensions : list[str], optional
        Dimension names. Default: ["Y", "X"].

    Returns
    -------
    dict[str, Any]
        Combined spatial: and proj: convention attributes.
    """
    if dimensions is None:
        dimensions = ["Y", "X"]

    # Convert GDAL format to Affine/Rasterio format
    # GDAL: [c, a, b, f, d, e] -> Affine: [a, b, c, d, e, f]
    c, a, b, f, d, e = geotransform
    affine_transform = [a, b, c, d, e, f]

    # Calculate bbox from geotransform and shape
    height, width = shape
    xmin = c
    ymax = f
    xmax = c + a * width + b * height
    ymin = f + d * width + e * height

    # Ensure correct ordering
    if xmin > xmax:
        xmin, xmax = xmax, xmin
    if ymin > ymax:
        ymin, ymax = ymax, ymin

    attrs = create_spatial_attrs(
        dimensions=dimensions,
        transform=tuple(affine_transform),
        bbox=(xmin, ymin, xmax, ymax),
        shape=list(shape),
    )
    attrs.update(create_proj_attrs(wkt2=crs_wkt))

    return attrs


def from_rioxarray(da: xr.DataArray) -> dict[str, Any]:
    """
    Extract spatial and proj convention attributes from a rioxarray DataArray.

    Parameters
    ----------
    da : xr.DataArray
        A DataArray with CRS and transform information set via rioxarray.

    Returns
    -------
    dict[str, Any]
        Combined spatial: and proj: convention attributes.

    Raises
    ------
    ValueError
        If the DataArray doesn't have CRS or transform information.
    """
    try:
        crs = da.rio.crs
        transform = da.rio.transform()
    except Exception as e:
        raise ValueError("DataArray must have CRS and transform set via rioxarray") from e

    if crs is None:
        raise ValueError("DataArray CRS is None")

    # Get spatial dimensions
    x_dim = da.rio.x_dim
    y_dim = da.rio.y_dim
    dimensions = [y_dim, x_dim]

    # Get shape
    height = da.sizes[y_dim]
    width = da.sizes[x_dim]
    shape = (height, width)

    # Convert transform to list (Affine object has the coefficients we need)
    affine_transform = [
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e,
        transform.f,
    ]

    # Get bounds
    bounds = da.rio.bounds()  # Returns (left, bottom, right, top)
    bbox = [bounds[0], bounds[1], bounds[2], bounds[3]]

    attrs = create_spatial_attrs(
        dimensions=dimensions,
        transform=affine_transform,
        bbox=bbox,
        shape=list(shape),
    )

    # Add CRS - prefer EPSG code if available
    try:
        epsg = crs.to_epsg()
        if epsg:
            attrs.update(create_proj_attrs(code=f"EPSG:{epsg}"))
        else:
            attrs.update(create_proj_attrs(wkt2=crs.to_wkt()))
    except Exception:
        attrs.update(create_proj_attrs(wkt2=crs.to_wkt()))

    return attrs


def create_geozarr_attrs(
    dimensions: list[str],
    *,
    crs: str | None = None,
    transform: tuple[float, ...] | list[float] | None = None,
    bbox: tuple[float, ...] | list[float] | None = None,
    shape: tuple[int, ...] | list[int] | None = None,
    registration: str = "pixel",
    include_conventions: bool = True,
) -> dict[str, Any]:
    """
    Create complete GeoZarr-compliant attributes with zarr_conventions.

    Parameters
    ----------
    dimensions : list[str]
        Names of spatial dimensions.
    crs : str, optional
        EPSG code (e.g., "EPSG:4326") or WKT2 string.
    transform : tuple or list of float, optional
        Affine transformation coefficients.
    bbox : tuple or list of float, optional
        Bounding box.
    shape : tuple or list of int, optional
        Spatial shape.
    registration : str, default "pixel"
        Grid registration type.
    include_conventions : bool, default True
        Whether to include zarr_conventions array.

    Returns
    -------
    dict[str, Any]
        Complete GeoZarr-compliant attributes.
    """
    attrs: dict[str, Any] = {}
    conventions = []

    # Add spatial attributes
    spatial_attrs = create_spatial_attrs(
        dimensions=dimensions,
        transform=transform,
        bbox=bbox,
        shape=shape,
        registration=registration,
    )
    attrs.update(spatial_attrs)
    conventions.append(SpatialConventionMetadata())

    # Add proj attributes if CRS provided
    if crs:
        if crs.startswith("EPSG:"):
            proj_attrs = create_proj_attrs(code=crs)
        else:
            proj_attrs = create_proj_attrs(wkt2=crs)
        attrs.update(proj_attrs)
        conventions.append(ProjConventionMetadata())

    # Add zarr_conventions if requested
    if include_conventions:
        attrs["zarr_conventions"] = create_zarr_conventions(*conventions)

    return attrs
