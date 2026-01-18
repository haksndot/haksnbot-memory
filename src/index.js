import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Database path - stored alongside the MCP server
const DB_PATH = process.env.MEMORY_DB_PATH || path.join(__dirname, '..', 'memories.db')

class MemoryMCP {
  constructor() {
    this.server = new Server(
      { name: 'memory-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )

    this.db = null
    this.initDatabase()
    this.setupHandlers()
  }

  initDatabase() {
    this.db = new Database(DB_PATH)

    // Create memories table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        context TEXT,
        importance INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create full-text search virtual table for efficient searching
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, tags, context,
        content='memories',
        content_rowid='id'
      )
    `)

    // Triggers to keep FTS index in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags, context)
        VALUES (new.id, new.content, new.tags, new.context);
      END
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags, context)
        VALUES ('delete', old.id, old.content, old.tags, old.context);
      END
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags, context)
        VALUES ('delete', old.id, old.content, old.tags, old.context);
        INSERT INTO memories_fts(rowid, content, tags, context)
        VALUES (new.id, new.content, new.tags, new.context);
      END
    `)
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.listTools()
    }))

    this.server.setRequestHandler(CallToolRequestSchema, (request) => {
      return this.callTool(request)
    })
  }

  listTools() {
    return [
      {
        name: 'create_memory',
        description: 'Create a new memory. Use this to remember important events, player interactions, discoveries, or anything worth recalling later. Memories should be specific experiences, not general knowledge.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The memory content - what happened, what was said, what was observed'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags to categorize the memory (e.g., ["player:Steve", "event:trade", "location:spawn"])'
            },
            context: {
              type: 'string',
              description: 'Additional context about the memory (e.g., "During a farming session with Steve")'
            },
            importance: {
              type: 'number',
              description: 'Importance level 1-10 (default 5). Use higher for significant events.',
              default: 5
            }
          },
          required: ['content']
        }
      },
      {
        name: 'get_memory',
        description: 'Retrieve a specific memory by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The memory ID to retrieve'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'update_memory',
        description: 'Update an existing memory. Use to add details or correct information.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The memory ID to update'
            },
            content: {
              type: 'string',
              description: 'New content for the memory'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'New tags (replaces existing tags)'
            },
            context: {
              type: 'string',
              description: 'New context'
            },
            importance: {
              type: 'number',
              description: 'New importance level 1-10'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_memory',
        description: 'Delete a memory by ID. Use sparingly - only for incorrect or duplicate memories.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The memory ID to delete'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'list_memories',
        description: 'List all memories, optionally filtered by tag or sorted by various criteria',
        inputSchema: {
          type: 'object',
          properties: {
            tag: {
              type: 'string',
              description: 'Filter by tag (e.g., "player:Steve" or just "Steve" for partial match)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of memories to return (default 50)',
              default: 50
            },
            offset: {
              type: 'number',
              description: 'Number of memories to skip (for pagination)',
              default: 0
            },
            sort: {
              type: 'string',
              enum: ['newest', 'oldest', 'importance'],
              description: 'Sort order (default: newest)',
              default: 'newest'
            },
            min_importance: {
              type: 'number',
              description: 'Filter to memories with importance >= this value'
            }
          }
        }
      },
      {
        name: 'search_memories',
        description: 'Search memories by content using full-text search. Great for finding memories about specific topics, players, or events.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query - matches against content, tags, and context'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default 20)',
              default: 20
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_memory_stats',
        description: 'Get statistics about stored memories - total count, tag distribution, etc.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  }

  async callTool(request) {
    const { name, arguments: args = {} } = request.params

    try {
      switch (name) {
        case 'create_memory':
          return this.createMemory(args)
        case 'get_memory':
          return this.getMemory(args)
        case 'update_memory':
          return this.updateMemory(args)
        case 'delete_memory':
          return this.deleteMemory(args)
        case 'list_memories':
          return this.listMemories(args)
        case 'search_memories':
          return this.searchMemories(args)
        case 'get_memory_stats':
          return this.getMemoryStats()
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      }
    }
  }

  createMemory(args) {
    const { content, tags = [], context = null, importance = 5 } = args

    if (!content || content.trim() === '') {
      throw new Error('Memory content cannot be empty')
    }

    const tagsJson = JSON.stringify(tags)
    const clampedImportance = Math.max(1, Math.min(10, importance))

    const stmt = this.db.prepare(`
      INSERT INTO memories (content, tags, context, importance)
      VALUES (?, ?, ?, ?)
    `)

    const result = stmt.run(content, tagsJson, context, clampedImportance)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          id: result.lastInsertRowid,
          message: `Memory created with ID ${result.lastInsertRowid}`
        }, null, 2)
      }]
    }
  }

  getMemory(args) {
    const { id } = args

    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?')
    const memory = stmt.get(id)

    if (!memory) {
      throw new Error(`Memory with ID ${id} not found`)
    }

    memory.tags = JSON.parse(memory.tags)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(memory, null, 2)
      }]
    }
  }

  updateMemory(args) {
    const { id, content, tags, context, importance } = args

    // Check if memory exists
    const existing = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
    if (!existing) {
      throw new Error(`Memory with ID ${id} not found`)
    }

    // Build update query dynamically based on provided fields
    const updates = []
    const values = []

    if (content !== undefined) {
      updates.push('content = ?')
      values.push(content)
    }
    if (tags !== undefined) {
      updates.push('tags = ?')
      values.push(JSON.stringify(tags))
    }
    if (context !== undefined) {
      updates.push('context = ?')
      values.push(context)
    }
    if (importance !== undefined) {
      updates.push('importance = ?')
      values.push(Math.max(1, Math.min(10, importance)))
    }

    if (updates.length === 0) {
      throw new Error('No fields to update')
    }

    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE memories SET ${updates.join(', ')} WHERE id = ?
    `)

    stmt.run(...values)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Memory ${id} updated`
        }, null, 2)
      }]
    }
  }

  deleteMemory(args) {
    const { id } = args

    const existing = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
    if (!existing) {
      throw new Error(`Memory with ID ${id} not found`)
    }

    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?')
    stmt.run(id)

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Memory ${id} deleted`
        }, null, 2)
      }]
    }
  }

  listMemories(args) {
    const { tag, limit = 50, offset = 0, sort = 'newest', min_importance } = args

    let query = 'SELECT * FROM memories WHERE 1=1'
    const params = []

    if (tag) {
      query += ' AND tags LIKE ?'
      params.push(`%${tag}%`)
    }

    if (min_importance !== undefined) {
      query += ' AND importance >= ?'
      params.push(min_importance)
    }

    // Sort order
    switch (sort) {
      case 'oldest':
        query += ' ORDER BY created_at ASC'
        break
      case 'importance':
        query += ' ORDER BY importance DESC, created_at DESC'
        break
      case 'newest':
      default:
        query += ' ORDER BY created_at DESC'
    }

    query += ' LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const stmt = this.db.prepare(query)
    const memories = stmt.all(...params)

    // Parse tags JSON for each memory
    memories.forEach(m => {
      m.tags = JSON.parse(m.tags)
    })

    // Get total count for pagination info
    let countQuery = 'SELECT COUNT(*) as count FROM memories WHERE 1=1'
    const countParams = []
    if (tag) {
      countQuery += ' AND tags LIKE ?'
      countParams.push(`%${tag}%`)
    }
    if (min_importance !== undefined) {
      countQuery += ' AND importance >= ?'
      countParams.push(min_importance)
    }
    const totalCount = this.db.prepare(countQuery).get(...countParams).count

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          memories,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + memories.length < totalCount
          }
        }, null, 2)
      }]
    }
  }

  searchMemories(args) {
    const { query, limit = 20 } = args

    if (!query || query.trim() === '') {
      throw new Error('Search query cannot be empty')
    }

    // Use FTS5 MATCH for full-text search
    const stmt = this.db.prepare(`
      SELECT m.*, rank
      FROM memories m
      JOIN memories_fts fts ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)

    const memories = stmt.all(query, limit)

    // Parse tags JSON for each memory
    memories.forEach(m => {
      m.tags = JSON.parse(m.tags)
      delete m.rank // Remove internal FTS rank from output
    })

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          results: memories,
          count: memories.length
        }, null, 2)
      }]
    }
  }

  getMemoryStats() {
    const totalCount = this.db.prepare('SELECT COUNT(*) as count FROM memories').get().count

    // Get tag distribution
    const allTags = this.db.prepare('SELECT tags FROM memories').all()
    const tagCounts = {}
    allTags.forEach(row => {
      const tags = JSON.parse(row.tags)
      tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })
    })

    // Sort tags by count
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20) // Top 20 tags

    // Get importance distribution
    const importanceDist = this.db.prepare(`
      SELECT importance, COUNT(*) as count
      FROM memories
      GROUP BY importance
      ORDER BY importance
    `).all()

    // Get date range
    const dateRange = this.db.prepare(`
      SELECT
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM memories
    `).get()

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_memories: totalCount,
          top_tags: sortedTags.map(([tag, count]) => ({ tag, count })),
          importance_distribution: importanceDist,
          date_range: dateRange.oldest ? {
            oldest: dateRange.oldest,
            newest: dateRange.newest
          } : null
        }, null, 2)
      }]
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Memory MCP server running on stdio')
  }
}

const server = new MemoryMCP()
server.run().catch(console.error)
