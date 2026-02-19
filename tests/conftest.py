"""Pytest configuration and fixtures."""

from __future__ import annotations

import json
import pathlib

import pytest

# Paths to example data
TEST_DATA_DIR = pathlib.Path(__file__).parent / "_test_data"
SPATIAL_EXAMPLES_DIR = TEST_DATA_DIR / "spatial_examples"
PROJ_EXAMPLES_DIR = TEST_DATA_DIR / "proj_examples"
MULTISCALES_EXAMPLES_DIR = TEST_DATA_DIR / "multiscales_examples"

spatial_example_paths = tuple(SPATIAL_EXAMPLES_DIR.glob("*.json"))
proj_example_paths = tuple(PROJ_EXAMPLES_DIR.glob("*.json"))
multiscales_example_paths = tuple(MULTISCALES_EXAMPLES_DIR.glob("*.json"))


def read_json(path: pathlib.Path) -> dict[str, object]:
    """Read a JSON file and return its contents."""
    result: dict[str, object] = json.loads(path.read_text())
    return result


def get_stem(p: pathlib.Path) -> str:
    """Get the stem (filename without extension) of a path."""
    return p.stem


@pytest.fixture(params=spatial_example_paths, ids=get_stem)
def spatial_example(request: pytest.FixtureRequest) -> dict[str, object]:
    """Fixture providing spatial example data."""
    return read_json(request.param)


@pytest.fixture(params=proj_example_paths, ids=get_stem)
def proj_example(request: pytest.FixtureRequest) -> dict[str, object]:
    """Fixture providing proj example data."""
    return read_json(request.param)


@pytest.fixture(params=multiscales_example_paths, ids=get_stem)
def multiscales_example(request: pytest.FixtureRequest) -> dict[str, object]:
    """Fixture providing multiscales example data."""
    return read_json(request.param)


@pytest.fixture
def tmp_zarr_store(tmp_path: pathlib.Path) -> pathlib.Path:
    """Create a temporary Zarr store for testing."""
    import zarr

    store_path = tmp_path / "test.zarr"
    root = zarr.open_group(str(store_path), mode="w")
    root.attrs["test"] = True
    return store_path
