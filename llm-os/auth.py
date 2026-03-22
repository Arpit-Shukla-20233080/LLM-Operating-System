"""
bypass_auth.py — "Driver Installer" for Google Workspace MCP OAuth.
"""

import asyncio
import sys
import re
import webbrowser
from contextlib import AsyncExitStack

from nanobot.config.loader import load_config
from nanobot.agent.tools.registry import ToolRegistry
from nanobot.agent.tools.mcp import connect_mcp_servers

# ── Configuration ───────────────────────────────────────────────
AUTH_TOOL_NAME = "mcp_google_workspace_mcp_start_google_auth"
CALLBACK_WAIT_SECS = 120                     

async def main() -> None:
    # 0. Prompt ──────────────────────────────────────────────────
    print("=== Google Workspace MCP Setup ===")
    target_email = input("Enter your test Gmail address: ").strip()
    
    if not target_email:
        print("[✗] Email is required. Exiting.")
        sys.exit(1)

    # 1. Boot the bus ─────────────────────────────────────────────
    config = load_config()
    registry = ToolRegistry()

    async with AsyncExitStack() as stack:
        mcp_servers = config.tools.mcp_servers or {}
        print("\n[*] Booting MCP peripheral bus …")
        await connect_mcp_servers(mcp_servers, registry, stack)
        print(f"[✓] Bus online — {len(registry.tool_names)} tools registered.\n")

        # 2. Retrieve the auth tool ──────────────────────────────
        auth_tool = registry.get(AUTH_TOOL_NAME)
        if auth_tool is None:
            print(f"[✗] Tool '{AUTH_TOOL_NAME}' not found!")
            sys.exit(1)

        # 3. Execute & extract the OAuth URL ─────────────────────
        print(f"[*] Executing {AUTH_TOOL_NAME} …")
        result = await auth_tool.execute(user_google_email=target_email, service_name="gmail")

        # Extract just the raw https link using regex
        result_str = str(result)
        match = re.search(r'(https://accounts\.google\.com/o/oauth2/auth\?[^\s\)]+)', result_str)
        
        if not match:
            print("[✗] Could not find the URL in the response. Raw output:")
            print(result_str)
            sys.exit(1)
            
        clean_url = match.group(1)

        print("\n============================================================")
        print("       ★  CLEAN GOOGLE OAUTH URL  ★")
        print("============================================================")
        print(f"\n{clean_url}\n")
        print("============================================================\n")

        # Automatically pop open the browser!
        print("[*] Automatically opening your default web browser...")
        webbrowser.open(clean_url)

        # 4. Callback window ─────────────────────────────────────
        print(f"\n[⏳] Waiting {CALLBACK_WAIT_SECS}s for you to complete the flow …")
        print("     Log in via the browser window that just opened.")
        print("     The redirect server at http://localhost:8080/oauth2callback")
        print("     will catch the token.\n")
        print("     Press Ctrl+C here in the terminal AFTER you see the success page in your browser.\n")

        try:
            await asyncio.sleep(CALLBACK_WAIT_SECS)
        except asyncio.CancelledError:
            pass

        print("\n[✓] Callback window closed. Token should be cached locally.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[✓] Auth flow interrupted — if you completed the OAuth consent,")
        print("    the token is already cached. You're good to go.")