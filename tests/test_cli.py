"""Tests for the CLI."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pathlib

    import pytest


from geozarr_toolkit.cli import create_parser, main


class TestParser:
    """Tests for argument parser."""

    def test_parser_creation(self) -> None:
        """Test that parser is created successfully."""
        parser = create_parser()
        assert parser is not None

    def test_validate_subcommand(self) -> None:
        """Test validate subcommand parsing."""
        parser = create_parser()
        args = parser.parse_args(["validate", "/path/to/zarr"])
        assert args.command == "validate"
        assert args.input_path == "/path/to/zarr"

    def test_validate_with_conventions(self) -> None:
        """Test validate with conventions flag."""
        parser = create_parser()
        args = parser.parse_args(
            [
                "validate",
                "/path/to/zarr",
                "--conventions",
                "spatial",
                "proj",
            ]
        )
        assert args.conventions == ["spatial", "proj"]

    def test_info_subcommand(self) -> None:
        """Test info subcommand parsing."""
        parser = create_parser()
        args = parser.parse_args(["info", "/path/to/zarr"])
        assert args.command == "info"
        assert args.input_path == "/path/to/zarr"

    def test_info_with_json(self) -> None:
        """Test info with --json flag."""
        parser = create_parser()
        args = parser.parse_args(["info", "/path/to/zarr", "--json"])
        assert args.output_json is True


class TestMain:
    """Tests for main function."""

    def test_no_command_shows_help(self, capsys: pytest.CaptureFixture[str]) -> None:
        """Test that no command shows help."""
        result = main([])
        assert result == 0
        captured = capsys.readouterr()
        assert "usage" in captured.out.lower() or "commands" in captured.out.lower()

    def test_validate_nonexistent_path(self, capsys: pytest.CaptureFixture[str]) -> None:
        """Test validate with nonexistent path."""
        result = main(["validate", "/nonexistent/path"])
        assert result == 1
        captured = capsys.readouterr()
        assert "does not exist" in captured.out


class TestValidateCommand:
    """Tests for validate command with real Zarr stores."""

    def test_validate_empty_store(
        self, tmp_zarr_store: pathlib.Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test validating an empty store."""
        result = main(["validate", str(tmp_zarr_store)])
        assert result == 0
        captured = capsys.readouterr()
        assert "No conventions detected" in captured.out

    def test_validate_with_spatial(
        self, tmp_zarr_store: pathlib.Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test validating store with spatial convention."""
        import zarr

        # Add spatial metadata
        group = zarr.open_group(str(tmp_zarr_store), mode="a")
        group.attrs["spatial:dimensions"] = ["Y", "X"]

        result = main(["validate", str(tmp_zarr_store)])
        assert result == 0
        captured = capsys.readouterr()
        assert "spatial" in captured.out.lower()


class TestInfoCommand:
    """Tests for info command."""

    def test_info_empty_store(
        self, tmp_zarr_store: pathlib.Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test info on empty store."""
        result = main(["info", str(tmp_zarr_store)])
        assert result == 0
        captured = capsys.readouterr()
        assert "Path:" in captured.out
        assert "none detected" in captured.out.lower()

    def test_info_json_output(
        self, tmp_zarr_store: pathlib.Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test info with JSON output."""
        import json

        result = main(["info", str(tmp_zarr_store), "--json"])
        assert result == 0
        captured = capsys.readouterr()

        # Should be valid JSON
        data = json.loads(captured.out)
        assert "path" in data
        assert "conventions" in data
