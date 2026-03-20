"""Domain-based Tool Router for efficient LLM context management."""

from pathlib import Path
from typing import Any
from loguru import logger

class ToolRouterResult:
    def __init__(self, tool_definitions: list[dict[str, Any]], system_addendum: str, tool_names: list[str]):
        self.tool_definitions = tool_definitions
        self.system_addendum = system_addendum
        self.tool_names = tool_names

class ToolRouter:
    """Routes user queries to specific tool domains to optimize the LLM context window."""

    def __init__(self, registry: "ToolRegistry", workspace_path: Path, **kwargs):
        self._registry = registry

    async def initialize(self) -> None:
        logger.info("Domain-based ToolRouter initialized.")

    def query(self, prompt: str) -> ToolRouterResult:
        prompt_lower = prompt.lower()
        
        # 1. Base tools required for core agent operation and authentication
        base_tools = [
            "message", 
            "mcp_google_workspace_mcp_start_google_auth"
        ]
        
        # 2. Domain-specific tool collections (Top ~20 most useful workspace tools)
        gmail_tools = [
            "mcp_google_workspace_mcp_search_gmail_messages",
            "mcp_google_workspace_mcp_get_gmail_message_content",
            "mcp_google_workspace_mcp_send_gmail_message",
            "mcp_google_workspace_mcp_draft_gmail_message"
        ]
        
        calendar_tools = [
            "mcp_google_workspace_mcp_get_events",
            "mcp_google_workspace_mcp_manage_event",
            "mcp_google_workspace_mcp_query_freebusy"
        ]
        
        drive_docs_tools = [
            "mcp_google_workspace_mcp_search_drive_files",
            "mcp_google_workspace_mcp_get_drive_file_content",
            "mcp_google_workspace_mcp_create_doc",
            "mcp_google_workspace_mcp_modify_doc_text"
        ]
        
        tasks_tools = [
            "mcp_google_workspace_mcp_list_tasks",
            "mcp_google_workspace_mcp_manage_task"
        ]

        # 3. Domain Routing Logic
        selected_names = list(base_tools)
        domain_matched = "General"

        if any(w in prompt_lower for w in ["mail", "inbox", "email"]):
            selected_names.extend(gmail_tools)
            domain_matched = "Gmail"
        elif any(w in prompt_lower for w in ["calendar", "meeting", "schedule", "event", "free"]):
            selected_names.extend(calendar_tools)
            domain_matched = "Calendar"
        elif any(w in prompt_lower for w in ["drive", "doc", "file", "folder", "write"]):
            selected_names.extend(drive_docs_tools)
            domain_matched = "Drive/Docs"
        elif any(w in prompt_lower for w in ["task", "todo", "to-do", "remind"]):
            selected_names.extend(tasks_tools)
            domain_matched = "Tasks"

        # 4. Include native OS tools (read_file, exec, etc.) automatically
        for name in self._registry.tool_names:
            if not name.startswith("mcp_") and name not in selected_names:
                selected_names.append(name)

        # 5. Construct tool definitions for the LLM
        final_tools = []
        definitions = []
        for name in selected_names:
            tool = self._registry.get(name)
            if tool:
                final_tools.append(name)
                definitions.append(tool.to_schema())

        logger.info("ToolRouter mapped prompt to domain: {} ({} tools loaded)", domain_matched, len(final_tools))

        # 6. Context-optimized system prompt addendum
        addendum = (
            "## Active Tools\n"
            "You have been provided a curated set of tools for this specific request.\n"
            "CRITICAL: Do NOT invent tools or parameters. Use ONLY the provided tools.\n"
            "If checking email, you MUST use the provided email address in the arguments."
        )

        return ToolRouterResult(
            tool_definitions=definitions,
            system_addendum=addendum,
            tool_names=final_tools
        )