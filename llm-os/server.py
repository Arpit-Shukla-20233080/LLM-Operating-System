"""
llm os — Headless FastAPI Server (Native MessageBus Channel)
=============================================================
Acts as a first-class nanobot channel by publishing user prompts to the
MessageBus and awaiting the agent's outbound response.  The full ReAct
loop (tool calling, multi-step reasoning) runs natively.

Usage:
    python server.py
    # or: uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import mimetypes
import re
import sys
from contextlib import AsyncExitStack, asynccontextmanager
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from loguru import logger
from pydantic import BaseModel, Field, ValidationError

# ---------------------------------------------------------------------------
# nanobot internals — exact imports matching v0.1.4 source
# ---------------------------------------------------------------------------
from nanobot.agent.loop import AgentLoop
from nanobot.agent.tools.mcp import connect_mcp_servers
from nanobot.bus.events import InboundMessage, OutboundMessage
from nanobot.bus.queue import MessageBus
from nanobot.config.loader import get_config_path, load_config, save_config
from nanobot.config.schema import Config
from nanobot.providers.litellm_provider import LiteLLMProvider
from nanobot.providers.registry import find_by_name
from nanobot.session.manager import SessionManager
from nanobot.utils.helpers import sync_workspace_templates


# ---------------------------------------------------------------------------
# Provider factory — mirrors nanobot.cli.commands._make_provider()
# ---------------------------------------------------------------------------
def _make_provider(config: Config) -> LiteLLMProvider:
    """Create the LiteLLM provider from the loaded nanobot config."""
    model = config.agents.defaults.model
    provider_name = config.get_provider_name(model)
    p = config.get_provider(model)

    spec = find_by_name(provider_name)
    if (
        not model.startswith("bedrock/")
        and not (p and p.api_key)
        and not (spec and spec.is_oauth)
    ):
        logger.error("No API key configured for provider '{}'. Check ~/.nanobot/config.json", provider_name)
        sys.exit(1)

    return LiteLLMProvider(
        api_key=p.api_key if p else None,
        api_base=config.get_api_base(model),
        default_model=model,
        extra_headers=p.extra_headers if p else None,
        provider_name=provider_name,
    )


# ---------------------------------------------------------------------------
# Boot the AgentLoop
# ---------------------------------------------------------------------------
def _boot_agent(config: Config) -> AgentLoop:
    """Instantiate a fully-wired AgentLoop ready for bus-based routing."""
    from nanobot.cron.service import CronService

    sync_workspace_templates(config.workspace_path)

    bus = MessageBus()
    provider = _make_provider(config)
    session_manager = SessionManager(config.workspace_path)

    cron_store = config.workspace_path / "cron" / "jobs.json"
    cron = CronService(cron_store)

    agent = AgentLoop(
        bus=bus,
        provider=provider,
        workspace=config.workspace_path,
        model=config.agents.defaults.model,
        temperature=config.agents.defaults.temperature,
        max_tokens=config.agents.defaults.max_tokens,
        max_iterations=config.agents.defaults.max_tool_iterations,
        memory_window=config.agents.defaults.memory_window,
        reasoning_effort=config.agents.defaults.reasoning_effort,
        brave_api_key=config.tools.web.search.api_key or None,
        web_proxy=config.tools.web.proxy or None,
        exec_config=config.tools.exec,
        cron_service=cron,
        restrict_to_workspace=config.tools.restrict_to_workspace,
        session_manager=session_manager,
        mcp_servers=config.tools.mcp_servers,
        channels_config=config.channels,
    )

    logger.info(
        "AgentLoop booted — model={} workspace={}",
        agent.model,
        config.workspace_path,
    )
    return agent


# ---------------------------------------------------------------------------
# Per-request correlation registry
# ---------------------------------------------------------------------------
# Maps session_key -> asyncio.Future that will be resolved with the
# agent's final OutboundMessage content string.
_pending: dict[str, asyncio.Future[str]] = {}


# ---------------------------------------------------------------------------
# Outbound dispatcher — routes bus responses to waiting HTTP requests
# ---------------------------------------------------------------------------
async def _outbound_dispatcher(bus: MessageBus) -> None:
    """Continuously consume outbound messages and resolve pending futures.

    This mirrors ChannelManager._dispatch_outbound() but instead of routing
    to Telegram/Discord/etc, it resolves per-request asyncio.Futures.
    """
    logger.info("Outbound dispatcher started")
    while True:
        try:
            msg: OutboundMessage = await asyncio.wait_for(
                bus.consume_outbound(), timeout=1.0,
            )
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            logger.info("Outbound dispatcher shutting down")
            break

        # Skip progress / tool-hint streaming events — we only want the
        # final response that signals the ReAct loop has completed.
        if msg.metadata.get("_progress"):
            logger.debug("Skipping progress message for {}:{}", msg.channel, msg.chat_id)
            continue

        # Build the session key the same way InboundMessage.session_key works:
        # "{channel}:{chat_id}" — but our requests use session_key_override,
        # so the agent's OutboundMessage carries the original channel + chat_id
        # that we embedded.  Since we set chat_id = session_key, we can look
        # it up directly.
        session_key = msg.chat_id
        future = _pending.get(session_key)
        if future and not future.done():
            future.set_result(msg.content or "")
            logger.debug("Resolved pending future for {}", session_key)
        else:
            logger.debug("No pending future for {} (unsolicited outbound)", session_key)


# ---------------------------------------------------------------------------
# Singleton agent instance + background tasks
# ---------------------------------------------------------------------------
_agent: AgentLoop | None = None
_agent_run_task: asyncio.Task | None = None
_dispatcher_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown hooks for the FastAPI application."""
    global _agent, _agent_run_task, _dispatcher_task

    logger.info("llm os server starting up…")
    config = load_config()
    _agent = _boot_agent(config)

    # ── MCP Peripheral Bus ─────────────────────────────────────────
    # Boot MCP servers *before* the agent loop starts.  We call
    # connect_mcp_servers() directly so the dynamic injection in
    # mcp.py (google_workspace_mcp) runs even when config is empty.
    # The AsyncExitStack keeps stdio subprocesses (npx) alive for
    # the entire server lifetime and is torn down after the yield.
    # ───────────────────────────────────────────────────────────────
    mcp_stack = AsyncExitStack()
    await mcp_stack.__aenter__()
    try:
        await connect_mcp_servers(
            config.tools.mcp_servers or {},
            _agent.tools,
            mcp_stack,
        )
        # Hand the stack to the agent so its close_mcp() path still works,
        # and mark connected so the lazy _connect_mcp() guard is a no-op.
        _agent._mcp_stack = mcp_stack
        _agent._mcp_connected = True
        logger.info("MCP peripheral bus mounted via server lifespan")
        
        # ── Dynamic Tool RAG ───────────────────────────────────────────
        from nanobot.agent.tool_router import ToolRouter
        _agent.router = ToolRouter(
            registry=_agent.tools,
            workspace_path=config.workspace_path,
            top_k=15
        )
        await _agent.router.initialize()
        
    except Exception as e:
        logger.error("MCP peripheral bus or ToolRouter failed to mount: {}", e)
        await mcp_stack.aclose()
        mcp_stack = None

    # Start the agent's bus-consuming loop as a background task
    _agent_run_task = asyncio.create_task(_agent.run(), name="agent-run")

    # Start the outbound dispatcher that resolves per-request futures
    _dispatcher_task = asyncio.create_task(
        _outbound_dispatcher(_agent.bus), name="outbound-dispatcher",
    )

    yield

    # ── Teardown: cancel background tasks cleanly ──────────────────
    logger.info("llm os server shutting down…")

    if _dispatcher_task is not None:
        _dispatcher_task.cancel()
        try:
            await _dispatcher_task
        except asyncio.CancelledError:
            pass

    if _agent is not None:
        _agent.stop()  # sets _running = False so agent.run() exits its loop
        await _agent.close_mcp()  # tears down the mcp_stack we injected

    if _agent_run_task is not None:
        _agent_run_task.cancel()
        try:
            await _agent_run_task
        except asyncio.CancelledError:
            pass

    # Reject any still-pending futures so callers don't hang
    for key, future in _pending.items():
        if not future.done():
            future.set_exception(
                HTTPException(status_code=503, detail="Server shutting down")
            )
    _pending.clear()

    logger.info("AgentLoop shut down cleanly.")
    _agent = None


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="llm os",
    description="Headless API for the nanobot agent kernel — native MessageBus channel.",
    version="2.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class ExecuteRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="The user prompt to send to the agent.")
    user_id: str = Field(
        default="default",
        min_length=1,
        description="Unique identifier for the user / session.",
    )


class ExecuteResponse(BaseModel):
    response: str = Field(..., description="The agent's text response.")
    user_id: str = Field(..., description="Echo of the requesting user_id.")
    session_key: str = Field(..., description="The session key used for this interaction.")


# ---------------------------------------------------------------------------
# POST /execute — Native MessageBus routing
# ---------------------------------------------------------------------------
REQUEST_TIMEOUT_SECONDS = 900.0  # 15 minutes max for multi-step pipelines


@app.post("/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest):
    """Publish a prompt to the MessageBus and await the agent's response.

    The full ReAct loop (tool calling, multi-step reasoning) runs natively
    inside the AgentLoop.  This endpoint blocks until the final response is
    produced or the timeout is reached.
    """
    if _agent is None:
        raise HTTPException(status_code=503, detail="Agent not initialized. Server is still starting up.")

    # Build a unique session key so concurrent requests don't collide.
    # Format: "api:{user_id}:{short_uuid}"
    unique_id = uuid4().hex[:8]
    session_key = f"api:{req.user_id}:{unique_id}"

    # Create a future that the outbound dispatcher will resolve
    loop = asyncio.get_running_loop()
    future: asyncio.Future[str] = loop.create_future()
    _pending[session_key] = future

    try:
        # Publish the user's prompt to the bus as a native InboundMessage.
        # The AgentLoop.run() background task will pick it up.
        await _agent.bus.publish_inbound(
            InboundMessage(
                channel="api",
                sender_id=req.user_id,
                chat_id=session_key,         # Embed session_key as chat_id for correlation
                content=req.prompt,
                session_key_override=session_key,
            )
        )

        # Wait for the ReAct loop to finish and the dispatcher to resolve our future
        response_text = await asyncio.wait_for(future, timeout=REQUEST_TIMEOUT_SECONDS)

    except asyncio.TimeoutError:
        logger.warning("Request timed out for session_key={}", session_key)
        raise HTTPException(
            status_code=504,
            detail=f"Agent did not respond within {REQUEST_TIMEOUT_SECONDS}s. "
                   "The task may still be running — try a simpler prompt or increase the timeout.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error for session_key={}", session_key)
        raise HTTPException(
            status_code=500,
            detail=f"Agent processing error: {exc}",
        ) from exc
    finally:
        _pending.pop(session_key, None)

    return ExecuteResponse(
        response=response_text,
        user_id=req.user_id,
        session_key=session_key,
    )


# ---------------------------------------------------------------------------
# Health-check endpoint
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Basic health check."""
    return {
        "status": "ok" if _agent is not None else "starting",
        "model": _agent.model if _agent else None,
        "bus_routing": True,
    }


# ---------------------------------------------------------------------------
# Configuration endpoints
# ---------------------------------------------------------------------------
_SENSITIVE_KEYS = {
    "apiKey", "api_key", "token", "appSecret",
    "clientSecret", "secret", "imapPassword",
    "smtpPassword", "accessToken", "botToken",
    "appToken", "clawToken", "accessToken",
}


def _mask_keys(obj, sensitive=_SENSITIVE_KEYS):
    """Recursively mask sensitive string values."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in sensitive and isinstance(v, str) and v:
                obj[k] = v[:4] + "•" * max(len(v) - 4, 0)
            else:
                _mask_keys(v, sensitive)
    elif isinstance(obj, list):
        for item in obj:
            _mask_keys(item, sensitive)


def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge *patch* into *base* (patch wins). Mutates *base*."""
    for key, value in patch.items():
        if (
            key in base
            and isinstance(base[key], dict)
            and isinstance(value, dict)
        ):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


@app.get("/config")
async def get_config():
    """Return the current config as JSON (API keys masked)."""
    config = load_config()
    data = config.model_dump(by_alias=True)
    _mask_keys(data)
    return data


class ConfigUpdateRequest(BaseModel):
    patch: dict  # Partial config in camelCase


@app.put("/config")
async def update_config(req: ConfigUpdateRequest):
    """Deep-merge the patch into the current config and persist."""
    config = load_config()
    current = config.model_dump(by_alias=True)
    _deep_merge(current, req.patch)

    try:
        updated = Config.model_validate(current)
    except ValidationError as e:
        raise HTTPException(422, detail=e.errors())

    save_config(updated)
    return {"status": "saved", "path": str(get_config_path())}


@app.post("/config/reload")
async def reload_config():
    """Re-read config.json and hot-patch the running AgentLoop."""
    if _agent is None:
        raise HTTPException(503, "Agent not initialized")

    config = load_config()
    changes: list[str] = []

    new_model = config.agents.defaults.model
    if _agent.model != new_model:
        _agent.model = new_model
        changes.append(f"model → {new_model}")

    if _agent.temperature != config.agents.defaults.temperature:
        _agent.temperature = config.agents.defaults.temperature
        changes.append(f"temperature → {config.agents.defaults.temperature}")

    if _agent.max_tokens != config.agents.defaults.max_tokens:
        _agent.max_tokens = config.agents.defaults.max_tokens
        changes.append(f"max_tokens → {config.agents.defaults.max_tokens}")

    new_provider = _make_provider(config)
    if (
        new_provider._api_key != _agent.provider._api_key
        or new_provider._api_base != _agent.provider._api_base
    ):
        _agent.provider = new_provider
        changes.append("provider re-instantiated")

    return {
        "status": "reloaded",
        "changes": changes or ["no changes detected"],
    }


# ---------------------------------------------------------------------------
# Google OAuth endpoints
# ---------------------------------------------------------------------------
class GoogleAuthRequest(BaseModel):
    email: str
    service: str = "gmail"  # gmail | calendar | drive


@app.post("/auth/google/start")
async def start_google_auth(req: GoogleAuthRequest):
    """Invoke the MCP auth tool directly and return the OAuth URL."""
    if _agent is None:
        raise HTTPException(503, "Agent not initialized")

    auth_tool = _agent.tools.get("mcp_google_workspace_mcp_start_google_auth")
    if auth_tool is None:
        raise HTTPException(501, "Google Workspace MCP not connected")

    result = await auth_tool.execute(
        user_google_email=req.email,
        service_name=req.service,
    )

    match = re.search(
        r'(https://accounts\.google\.com/o/oauth2/auth\?[^\s\)]+)',
        str(result),
    )
    if not match:
        raise HTTPException(502, f"MCP tool did not return an OAuth URL: {result}")

    return {"auth_url": match.group(1)}


@app.get("/auth/google/status")
async def google_auth_status():
    """Check if OAuth tokens exist (the MCP server caches them locally)."""
    token_dir = Path.home() / ".workspace-mcp" / "tokens"
    connected = token_dir.exists() and any(token_dir.glob("*.json"))
    return {"connected": connected, "token_dir": str(token_dir)}


# ---------------------------------------------------------------------------
# Workspace file-browser endpoints
# ---------------------------------------------------------------------------
@app.get("/workspace/files")
async def list_workspace_files(path: str = ""):
    """List files/directories in the agent workspace."""
    config = load_config()
    root = config.workspace_path.resolve()
    target = (root / path).resolve()

    if not str(target).startswith(str(root)):
        raise HTTPException(403, "Access denied: path outside workspace")
    if not target.exists():
        raise HTTPException(404, "Path not found")

    if target.is_file():
        stat = target.stat()
        return {
            "type": "file",
            "name": target.name,
            "path": str(target.relative_to(root)),
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "mime": mimetypes.guess_type(target.name)[0] or "application/octet-stream",
        }

    entries = []
    for child in sorted(target.iterdir()):
        try:
            stat = child.stat()
        except OSError:
            continue
        entries.append({
            "type": "directory" if child.is_dir() else "file",
            "name": child.name,
            "path": str(child.relative_to(root)),
            "size": stat.st_size if child.is_file() else None,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "mime": mimetypes.guess_type(child.name)[0] if child.is_file() else None,
            "children": len(list(child.iterdir())) if child.is_dir() else None,
        })

    return {
        "type": "directory",
        "path": str(target.relative_to(root)) or ".",
        "entries": entries,
    }


_TEXT_EXTENSIONS = {".md", ".json", ".txt", ".py", ".yaml", ".yml", ".toml", ".sh", ".log", ".html", ".css", ".js", ".ts", ".tsx"}


@app.get("/workspace/files/read")
async def read_workspace_file(path: str, download: bool = False):
    """Read a file from the workspace."""
    config = load_config()
    root = config.workspace_path.resolve()
    target = (root / path).resolve()

    if not str(target).startswith(str(root)):
        raise HTTPException(403, "Access denied")
    if not target.is_file():
        raise HTTPException(404, "File not found")

    if download:
        return FileResponse(target, filename=target.name)

    mime = mimetypes.guess_type(target.name)[0] or ""
    if mime.startswith("text/") or target.suffix in _TEXT_EXTENSIONS:
        content = target.read_text(encoding="utf-8", errors="replace")
        if len(content) > 1_048_576:
            content = content[:1_048_576] + "\n\n... (truncated at 1MB)"
        return PlainTextResponse(content)

    return FileResponse(target, filename=target.name)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )