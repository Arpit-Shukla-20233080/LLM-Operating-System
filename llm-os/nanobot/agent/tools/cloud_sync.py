"""Cloud sync tool: upload workspace files to Supabase Storage."""

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.filesystem import _resolve_path


class CloudSyncTool(Tool):
    """Tool to upload a local workspace file to a Supabase Storage bucket and return its public URL."""

    _BUCKET = "os_files"

    def __init__(self, workspace: Path | None = None, allowed_dir: Path | None = None):
        self._workspace = workspace
        self._allowed_dir = allowed_dir

    @property
    def name(self) -> str:
        return "cloud_sync"

    @property
    def description(self) -> str:
        return (
            "Upload a file from the local workspace to cloud storage (Supabase) "
            "and return its public URL. Use this after creating or modifying a file "
            "that needs to be accessible from the web."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The local file path to upload (relative to workspace or absolute).",
                },
            },
            "required": ["path"],
        }

    async def execute(self, path: str, **kwargs: Any) -> str:
        # ------------------------------------------------------------------
        # 1. Validate environment credentials
        # ------------------------------------------------------------------
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        if not supabase_url or not supabase_key:
            raise RuntimeError(
                "Missing Supabase credentials. "
                "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file."
            )

        # ------------------------------------------------------------------
        # 2. Resolve and validate the local file path
        # ------------------------------------------------------------------
        try:
            file_path = _resolve_path(path, self._workspace, self._allowed_dir)
        except PermissionError as e:
            return f"Error: {e}"

        if not file_path.exists():
            return f"Error: File not found: {path}"
        if not file_path.is_file():
            return f"Error: Not a file: {path}"

        # ------------------------------------------------------------------
        # 3. Derive a clean relative storage path
        # ------------------------------------------------------------------
        try:
            if self._workspace:
                storage_path = file_path.relative_to(self._workspace.resolve()).as_posix()
            else:
                # Fallback: use the filename only
                storage_path = file_path.name
        except ValueError:
            # File is outside workspace — use filename as fallback
            storage_path = file_path.name

        # ------------------------------------------------------------------
        # 4. Read file contents
        # ------------------------------------------------------------------
        try:
            file_data = file_path.read_bytes()
        except Exception as e:
            return f"Error reading file: {e}"

        # ------------------------------------------------------------------
        # 5. Initialize Supabase client and upload
        # ------------------------------------------------------------------
        try:
            from supabase import create_client

            supabase = create_client(supabase_url, supabase_key)
            supabase.storage.from_(self._BUCKET).upload(
                path=storage_path,
                file=file_data,
                file_options={"upsert": "true"},
            )
        except ImportError:
            return (
                "Error: The 'supabase' package is not installed. "
                "Install it with: pip install supabase"
            )
        except Exception as e:
            return f"Error uploading to Supabase: {e}"

        # ------------------------------------------------------------------
        # 6. Retrieve the public URL via the SDK
        # ------------------------------------------------------------------
        try:
            public_url = supabase.storage.from_(self._BUCKET).get_public_url(storage_path)
        except Exception as e:
            return (
                f"File uploaded successfully but failed to retrieve public URL: {e}"
            )

        return f"File uploaded successfully.\nPublic URL: {public_url}"
