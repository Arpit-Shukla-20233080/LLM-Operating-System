"""MCP client: connects to MCP servers and wraps their tools as native nanobot tools."""

import asyncio
import os
import shutil
import subprocess
import sys
from contextlib import AsyncExitStack
from typing import Any

import httpx
from dotenv import load_dotenv
from loguru import logger

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry


class MCPToolWrapper(Tool):
    """Wraps a single MCP server tool as a nanobot Tool."""

    def __init__(self, session, server_name: str, tool_def, tool_timeout: int = 30):
        self._session = session
        self._original_name = tool_def.name
        self._name = f"mcp_{server_name}_{tool_def.name}"
        self._description = tool_def.description or tool_def.name
        self._parameters = tool_def.inputSchema or {"type": "object", "properties": {}}
        self._tool_timeout = tool_timeout

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return self._parameters

    async def execute(self, **kwargs: Any) -> str:
        from mcp import types
        try:
            result = await asyncio.wait_for(
                self._session.call_tool(self._original_name, arguments=kwargs),
                timeout=self._tool_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("MCP tool '{}' timed out after {}s", self._name, self._tool_timeout)
            return f"(MCP tool call timed out after {self._tool_timeout}s)"
        parts = []
        for block in result.content:
            if isinstance(block, types.TextContent):
                parts.append(block.text)
            else:
                parts.append(str(block))
        return "\n".join(parts) or "(no output)"


async def _precache_npx_package(args: list[str], env: dict[str, str] | None) -> bool:
    """Pre-download an npx package so the stdio JSON-RPC stream stays clean.

    npm writes download progress / notices to stdout on first run, which
    corrupts the JSON-RPC framing the MCP SDK expects.  Running npx once
    with output sunk to DEVNULL guarantees the package is cached before
    stdio_client ever opens the real connection.
    """
    npx_cmd = (
        (shutil.which("npx.cmd") or shutil.which("npx") or "npx")
        if sys.platform == "win32"
        else (shutil.which("npx") or "npx")
    )
    # Normalise flags: ensure --yes is present, drop a duplicate -y
    clean_args = [a for a in args if a not in ("-y", "--yes")]
    cmd = [npx_cmd, "--yes", *clean_args]
    logger.info("Pre-caching npx package: {}", " ".join(cmd))
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            env=env or os.environ.copy(),
        )
        _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=120)
        if proc.returncode == 0:
            logger.info("npx package cached successfully")
            return True
        else:
            logger.warning(
                "npx pre-cache exited {}: {}",
                proc.returncode,
                stderr_bytes.decode(errors="replace")[:500],
            )
            return False
    except asyncio.TimeoutError:
        logger.warning("npx pre-cache timed out after 120s")
        return False
    except Exception as e:
        logger.warning("npx pre-cache failed: {}", e)
        return False


async def connect_mcp_servers(
    mcp_servers: dict, registry: ToolRegistry, stack: AsyncExitStack
) -> None:
    """Connect to configured MCP servers and register their tools."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.sse import sse_client
    from mcp.client.stdio import stdio_client
    from mcp.client.streamable_http import streamable_http_client

    # --- Load .env and inject Google Workspace MCP server ---
    load_dotenv()

    if "google_workspace_mcp" not in mcp_servers:
        from nanobot.config.schema import MCPServerConfig
        from pathlib import Path

        # Merge OAuth keys into a full copy of the system environment
        # so the subprocess inherits PATH and other essentials.
        mcp_env = os.environ.copy()
        mcp_env["GOOGLE_OAUTH_CLIENT_ID"] = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
        mcp_env["GOOGLE_OAUTH_CLIENT_SECRET"] = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")

        # workspace-mcp is a Python package (PyPI: workspace-mcp) — NOT a Node
        # package. Resolve the console_scripts entry point from the same venv
        # that is running this process so the MCP server shares our interpreter.
        scripts_dir = Path(sys.executable).parent
        if sys.platform == "win32":
            wm_exe = scripts_dir / "workspace-mcp.exe"
        else:
            wm_exe = scripts_dir / "workspace-mcp"

        if wm_exe.exists():
            wm_command = str(wm_exe)
            wm_args: list[str] = []
        else:
            # Fallback: run as a Python module via the current interpreter
            wm_command = sys.executable
            wm_args = ["-m", "main"]
            logger.warning(
                "workspace-mcp entry point not found at {}; "
                "falling back to `python -m main`", wm_exe,
            )

        mcp_servers["google_workspace_mcp"] = MCPServerConfig(
            type="stdio",
            command=wm_command,
            args=wm_args,
            env=mcp_env,
            tool_timeout=60,
        )
        logger.info("Injected google_workspace_mcp server config (command={})", wm_command)

    for name, cfg in mcp_servers.items():
        try:
            transport_type = cfg.type
            if not transport_type:
                if cfg.command:
                    transport_type = "stdio"
                elif cfg.url:
                    # Convention: URLs ending with /sse use SSE transport; others use streamableHttp
                    transport_type = (
                        "sse" if cfg.url.rstrip("/").endswith("/sse") else "streamableHttp"
                    )
                else:
                    logger.warning("MCP server '{}': no command or url configured, skipping", name)
                    continue

            if transport_type == "stdio":
                # Pre-cache npx packages to prevent stdout pollution
                # from npm download progress corrupting JSON-RPC stream
                if cfg.command and cfg.command.strip().split()[0] in ("npx", "npx.cmd"):
                    await _precache_npx_package(cfg.args, cfg.env)
                params = StdioServerParameters(
                    command=cfg.command, args=cfg.args, env=cfg.env or None
                )
                read, write = await stack.enter_async_context(stdio_client(params))
            elif transport_type == "sse":
                def httpx_client_factory(
                    headers: dict[str, str] | None = None,
                    timeout: httpx.Timeout | None = None,
                    auth: httpx.Auth | None = None,
                ) -> httpx.AsyncClient:
                    merged_headers = {**(cfg.headers or {}), **(headers or {})}
                    return httpx.AsyncClient(
                        headers=merged_headers or None,
                        follow_redirects=True,
                        timeout=timeout,
                        auth=auth,
                    )

                read, write = await stack.enter_async_context(
                    sse_client(cfg.url, httpx_client_factory=httpx_client_factory)
                )
            elif transport_type == "streamableHttp":
                # Always provide an explicit httpx client so MCP HTTP transport does not
                # inherit httpx's default 5s timeout and preempt the higher-level tool timeout.
                http_client = await stack.enter_async_context(
                    httpx.AsyncClient(
                        headers=cfg.headers or None,
                        follow_redirects=True,
                        timeout=None,
                    )
                )
                read, write, _ = await stack.enter_async_context(
                    streamable_http_client(cfg.url, http_client=http_client)
                )
            else:
                logger.warning("MCP server '{}': unknown transport type '{}'", name, transport_type)
                continue

            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()

            tools = await session.list_tools()
            for tool_def in tools.tools:
                wrapper = MCPToolWrapper(session, name, tool_def, tool_timeout=cfg.tool_timeout)
                registry.register(wrapper)
                logger.debug("MCP: registered tool '{}' from server '{}'", wrapper.name, name)

            logger.info("MCP server '{}': connected, {} tools registered", name, len(tools.tools))
        except Exception as e:
            logger.error("MCP server '{}': failed to connect: {}", name, e)
