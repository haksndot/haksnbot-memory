# haksnbot-memory

An MCP (Model Context Protocol) server that provides persistent memory storage for AI agents. Uses SQLite with full-text search for efficient storage and retrieval of memories.

> **Part of the Haksnbot suite:** This project was originally developed as part of [Haksnbot](https://github.com/haksndot), an autonomous Minecraft bot. The suite includes four repos that work together: [haksnbot-tools](https://github.com/haksndot/haksnbot-tools) (Minecraft bot control), [haksnbot-agent](https://github.com/haksndot/haksnbot-agent) (the autonomous agent), [haksnbot-admin](https://github.com/haksndot/haksnbot-admin) (server administration), and [haksnbot-memory](https://github.com/haksndot/haksnbot-memory) (this repo - persistent memory). Each can be used independently, but they're designed to work together.

## Features

- **Persistent storage** - Memories survive agent restarts
- **Full-text search** - Find memories by content using FTS5
- **Tagging system** - Organize memories with flexible tags
- **Importance levels** - Prioritize significant memories
- **Pagination** - Handle large memory collections efficiently

## Installation

```bash
git clone https://github.com/haksndot/haksnbot-memory.git
cd haksnbot-memory
npm install
```

## Usage with Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/haksnbot-memory/src/index.js"]
    }
  }
}
```

## Configuration

The database path can be set via environment variable:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/haksnbot-memory/src/index.js"],
      "env": {
        "MEMORY_DB_PATH": "/path/to/memories.db"
      }
    }
  }
}
```

If not set, defaults to `memories.db` in the package directory.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_memory` | Store a new memory with optional tags, context, and importance |
| `get_memory` | Retrieve a specific memory by ID |
| `update_memory` | Update an existing memory's content, tags, or importance |
| `delete_memory` | Remove a memory |
| `list_memories` | List memories with filtering, sorting, and pagination |
| `search_memories` | Full-text search across memory content, tags, and context |
| `get_memory_stats` | Get statistics: total count, tag distribution, date range |

## Memory Structure

Each memory contains:

- **content** - The main memory text (required)
- **tags** - Array of categorization tags (e.g., `["player:Steve", "event:trade"]`)
- **context** - Additional context about when/where the memory was created
- **importance** - Priority level 1-10 (default 5)
- **created_at** / **updated_at** - Timestamps

## Examples

```
> Remember that Steve helped me find diamonds at coordinates -234, 12, 567

> Search my memories for anything about Steve

> List my most important memories (importance >= 8)

> What do I remember about trading?
```

## Requirements

- Node.js 18+

## Dependencies

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite bindings
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) - MCP server SDK

## Related Projects

- [haksnbot-agent](https://github.com/haksndot/haksnbot-agent) - Autonomous Minecraft bot using Claude Agent SDK
- [haksnbot-tools](https://github.com/haksndot/haksnbot-tools) - Minecraft MCP tools
- [haksnbot-admin](https://github.com/haksndot/haksnbot-admin) - Server administration MCP tools

## License

MIT
