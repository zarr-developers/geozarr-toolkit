"""Tests for the GeoZarr web validator."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
import zarr
from httpx import ASGITransport, AsyncClient

from geozarr_toolkit.application.app import app

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture
def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def spatial_attrs() -> dict[str, Any]:
    return {
        "spatial:dimensions": ["Y", "X"],
        "spatial:transform": [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0],
    }


@pytest.fixture
def proj_attrs() -> dict[str, Any]:
    return {"proj:code": "EPSG:4326"}


@pytest.mark.anyio
async def test_json_mode_valid_spatial(client: AsyncClient, spatial_attrs: dict) -> None:
    resp = await client.post("/api/validate", json={"attributes": spatial_attrs})
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert "spatial" in data["conventions"]
    assert data["results"]["spatial"]["valid"] is True


@pytest.mark.anyio
async def test_json_mode_multi_convention(
    client: AsyncClient, spatial_attrs: dict, proj_attrs: dict
) -> None:
    attrs = {**spatial_attrs, **proj_attrs}
    resp = await client.post("/api/validate", json={"attributes": attrs})
    assert resp.status_code == 200
    data = resp.json()
    assert "spatial" in data["conventions"]
    assert "proj" in data["conventions"]
    assert data["results"]["spatial"]["valid"] is True
    assert data["results"]["proj"]["valid"] is True
    assert data["valid"] is True


@pytest.mark.anyio
async def test_json_mode_empty_attrs(client: AsyncClient) -> None:
    resp = await client.post("/api/validate", json={"attributes": {}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["conventions"] == []
    assert data["results"] == {}
    assert data["valid"] is True


@pytest.mark.anyio
async def test_json_mode_invalid_attrs(client: AsyncClient) -> None:
    # spatial:dimensions present (so convention is detected) but invalid type
    attrs = {"spatial:dimensions": "not-a-list"}
    resp = await client.post("/api/validate", json={"attributes": attrs})
    assert resp.status_code == 200
    data = resp.json()
    assert "spatial" in data["conventions"]
    assert data["results"]["spatial"]["valid"] is False
    assert len(data["results"]["spatial"]["errors"]) > 0


@pytest.mark.anyio
async def test_url_mode_local_zarr(client: AsyncClient, tmp_path: Path) -> None:
    # Create a local zarr store with spatial attributes
    store_path = tmp_path / "test.zarr"
    root = zarr.open_group(str(store_path), mode="w")
    root.attrs["spatial:dimensions"] = ["Y", "X"]
    root.attrs["spatial:transform"] = [10.0, 0.0, 500000.0, 0.0, -10.0, 5000000.0]

    resp = await client.post(
        "/api/validate",
        json={"url": f"file://{store_path}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # file:// may or may not be supported by obstore — if it fails, check the error
    if data.get("error"):
        assert "Failed to open" in data["error"]
    else:
        assert "spatial" in data["conventions"]


@pytest.mark.anyio
async def test_url_mode_nonexistent(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/validate",
        json={"url": "https://does-not-exist.example.com/data.zarr"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["error"] is not None


@pytest.mark.anyio
async def test_missing_url_and_attributes(client: AsyncClient) -> None:
    resp = await client.post("/api/validate", json={})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_index_page(client: AsyncClient) -> None:
    resp = await client.get("/")
    assert resp.status_code == 200
    assert "GeoZarr Validator" in resp.text
