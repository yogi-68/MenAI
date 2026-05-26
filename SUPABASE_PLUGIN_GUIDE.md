# Supabase MCP Plugin - Complete Guide

## What is the Supabase MCP Plugin?

The Supabase MCP (Model Context Protocol) server is a plugin that provides direct database access through authenticated tools. It allows you to:
- Execute SQL queries
- Browse database schema
- Apply migrations
- Monitor performance
- Manage projects

**Location:** `C:\Users\yoges\.cursor\projects\c-Users-yoges-OneDrive-Desktop-MentalAI\mcps\plugin-supabase-supabase\`

---

## How It Works

### 1. Authentication Flow

#### Check Status
```typescript
Read("C:\Users\yoges\.cursor\projects\c-Users-yoges-OneDrive-Desktop-MentalAI\mcps\plugin-supabase-supabase\STATUS.md")
```

**Response:**
```
The MCP server needs authentication. You must call the `mcp_auth` tool...
```

#### Authenticate
```typescript
CallMcpTool("plugin-supabase-supabase", "mcp_auth", {})
```

**Response:**
```
Successfully authenticated MCP server: plugin-supabase-supabase. 
The server's tools should now be available.
```

#### Verify Tools Available
```bash
ls "C:\Users\yoges\.cursor\projects\c-Users-yoges-OneDrive-Desktop-MentalAI\mcps\plugin-supabase-supabase\tools"
```

**29 Tools Available:**
- `apply_migration.json`
- `confirm_cost.json`
- `create_branch.json`
- `create_project.json`
- `delete_branch.json`
- `deploy_edge_function.json`
- `execute_sql.json` ⭐
- `generate_typescript_types.json`
- `get_advisors.json`
- `get_cost.json`
- `get_edge_function.json`
- `get_logs.json`
- `get_organization.json`
- `get_project.json`
- `get_project_url.json`
- `get_publishable_keys.json`
- `list_branches.json`
- `list_edge_functions.json`
- `list_extensions.json` ⭐
- `list_migrations.json` ⭐
- `list_organizations.json`
- `list_projects.json` ⭐
- `list_tables.json` ⭐
- `merge_branch.json`
- `pause_project.json`
- `rebase_branch.json`
- `reset_branch.json`
- `restore_project.json`
- `search_docs.json`

---

## 2. Core Tools Usage

### List Projects

**Purpose:** Get project ID for all subsequent operations

```typescript
CallMcpTool("plugin-supabase-supabase", "list_projects", {})
```

**Response:**
```json
{
  "projects": [
    {
      "id": "zshgaiqapgesppcvfnwz",
      "ref": "zshgaiqapgesppcvfnwz",
      "name": "MenAI",
      "region": "ap-southeast-1",
      "status": "ACTIVE_HEALTHY",
      "database": {
        "host": "db.zshgaiqapgesppcvfnwz.supabase.co",
        "version": "17.6.1.121",
        "postgres_engine": "17"
      }
    }
  ]
}
```

**Key:** Save `project_id` = `"zshgaiqapgesppcvfnwz"` for all future calls.

---

### Execute SQL

**Tool Schema:**
```json
{
  "name": "execute_sql",
  "description": "Executes raw SQL in the Postgres database",
  "arguments": {
    "properties": {
      "project_id": { "type": "string" },
      "query": { "type": "string" }
    },
    "required": ["project_id", "query"]
  }
}
```

**Example: Count Goals**
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: "SELECT COUNT(*) as goal_count FROM goals;"
})
```

**Response:**
```json
{
  "result": "[{\"goal_count\":0}]"
}
```

**Example: Check Table Columns**
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'memories' 
    AND column_name IN ('embedding', 'metadata');
  `
})
```

**Response:**
```json
{
  "result": "[
    {\"column_name\":\"embedding\",\"data_type\":\"USER-DEFINED\"},
    {\"column_name\":\"metadata\",\"data_type\":\"jsonb\"}
  ]"
}
```

**Example: Create Table**
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    CREATE TABLE IF NOT EXISTS relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name text NOT NULL,
      role text NOT NULL,
      notes text,
      last_mentioned_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
  `
})
```

---

### List Extensions

**Purpose:** Check which Postgres extensions are installed

```typescript
CallMcpTool("plugin-supabase-supabase", "list_extensions", {
  project_id: "zshgaiqapgesppcvfnwz"
})
```

**Key Extensions:**
```json
{
  "extensions": [
    {
      "name": "vector",
      "schema": "public",
      "default_version": "0.8.0",
      "installed_version": "0.8.0",
      "comment": "vector data type and ivfflat and hnsw access methods"
    },
    {
      "name": "pgcrypto",
      "installed_version": "1.3"
    },
    {
      "name": "uuid-ossp",
      "installed_version": "1.1"
    }
  ]
}
```

---

### List Tables

**Purpose:** Browse database schema

```typescript
CallMcpTool("plugin-supabase-supabase", "list_tables", {
  project_id: "zshgaiqapgesppcvfnwz"
})
```

**Response:**
```json
{
  "tables": [
    "behavioral_observations",
    "commitments",
    "conversations",
    "crisis_events",
    "goals",
    "memories",
    "messages",
    "profiles",
    "relationships",
    "tasks"
  ]
}
```

---

### List Migrations

**Purpose:** Check which migrations have been applied

```typescript
CallMcpTool("plugin-supabase-supabase", "list_migrations", {
  project_id: "zshgaiqapgesppcvfnwz"
})
```

**Response:**
```json
{
  "migrations": []
}
```

**Note:** Empty means local migration files haven't been tracked in Supabase cloud. Tables were created manually.

---

## 3. Real-World Usage Examples

### Example 1: Debugging Extraction Pipeline

**Goal:** Find out why goals aren't being extracted

**Step 1:** Check if goals exist
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: "SELECT COUNT(*) FROM goals;"
})
// Result: 0 goals
```

**Step 2:** Check if memories exist
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: "SELECT COUNT(*) as total, COUNT(embedding) as with_embeddings FROM memories;"
})
// Result: 69 memories, 69 with embeddings
```

**Step 3:** Check recent memory content
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    SELECT content, memory_type, created_at 
    FROM memories 
    ORDER BY created_at DESC 
    LIMIT 5;
  `
})
```

**Result:**
```json
[
  {
    "content": "User: \"I want to build a customer support AI SaaS.\" State: FOUNDER_COACHING. Emotion: anticipation (7/10).",
    "memory_type": "conversation",
    "created_at": "2026-05-26 20:51:24"
  }
]
```

**Conclusion:** Memories being stored, but extraction not persisting goals. Check extraction engine.

---

### Example 2: Verify Vector Extension

**Goal:** Confirm pgvector is installed and working

**Step 1:** List extensions
```typescript
CallMcpTool("plugin-supabase-supabase", "list_extensions", {
  project_id: "zshgaiqapgesppcvfnwz"
})
```

**Step 2:** Check if embedding column exists
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'memories' 
    AND column_name = 'embedding';
  `
})
```

**Step 3:** Test vector function
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    SELECT EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'match_memories'
    ) as function_exists;
  `
})
```

---

### Example 3: Create Missing Table

**Goal:** Create relationships table for extraction engine

**Step 1:** Check if table exists
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'relationships'
    ) as table_exists;
  `
})
// Result: false
```

**Step 2:** Create table
```typescript
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    CREATE TABLE relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      name text NOT NULL,
      role text NOT NULL,
      notes text,
      last_mentioned_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
  `
})
```

**Step 3:** Add index and RLS
```typescript
// Create index
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: "CREATE INDEX idx_relationships_user_id ON relationships(user_id);"
})

// Enable RLS
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: "ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;"
})

// Create policy
CallMcpTool("plugin-supabase-supabase", "execute_sql", {
  project_id: "zshgaiqapgesppcvfnwz",
  query: `
    DO $$ 
    BEGIN 
      CREATE POLICY relationships_policy ON relationships
        FOR ALL USING (auth.uid() = user_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `
})
```

---

## 4. Safety Features

### Untrusted Data Boundaries

All query results are wrapped in safety tags:

```
<untrusted-data-{uuid}>
[{"column_name":"embedding","data_type":"USER-DEFINED"}]
</untrusted-data-{uuid}>
```

**Why?** To prevent SQL injection or command execution through returned data.

### Read-Only by Default

Most operations are read-only. Write operations require:
1. Explicit `execute_sql` calls
2. Project ID verification
3. Authenticated MCP session

### RLS Enforcement

Row-level security policies are enforced:
```sql
CREATE POLICY relationships_policy ON relationships
  FOR ALL USING (auth.uid() = user_id);
```

Only the authenticated user can access their own data.

---

## 5. Common Patterns

### Pattern 1: Check Before Create

```typescript
// Check if table exists
const exists = await CallMcpTool("execute_sql", {
  project_id: "...",
  query: "SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'my_table')"
});

if (!exists) {
  // Create table
  await CallMcpTool("execute_sql", {
    project_id: "...",
    query: "CREATE TABLE my_table (...)"
  });
}
```

### Pattern 2: Multiple Statements (Split Them)

**❌ BAD:**
```typescript
CallMcpTool("execute_sql", {
  query: "CREATE TABLE foo (...); CREATE INDEX idx_foo ON foo(id);"
})
// Error: syntax error at or near "CREATE"
```

**✅ GOOD:**
```typescript
await CallMcpTool("execute_sql", {
  query: "CREATE TABLE foo (...);"
});

await CallMcpTool("execute_sql", {
  query: "CREATE INDEX idx_foo ON foo(id);"
});
```

### Pattern 3: Safe Policy Creation

**❌ BAD:**
```sql
CREATE POLICY IF NOT EXISTS my_policy ON my_table ...
-- Error: IF NOT EXISTS not supported
```

**✅ GOOD:**
```sql
DO $$ 
BEGIN 
  CREATE POLICY my_policy ON my_table FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

---

## 6. Troubleshooting

### Error: "needs authentication"

**Solution:**
```typescript
CallMcpTool("plugin-supabase-supabase", "mcp_auth", {})
```

### Error: "project_id is required"

**Solution:**
```typescript
// First get project_id
const projects = await CallMcpTool("list_projects", {});
const projectId = projects.projects[0].id;

// Then use it
await CallMcpTool("execute_sql", {
  project_id: projectId,
  query: "..."
});
```

### Error: "syntax error at or near"

**Solutions:**
1. Split multiple statements into separate calls
2. Use `DO $$ BEGIN ... END $$;` blocks for conditional logic
3. Check for unsupported syntax (e.g., `IF NOT EXISTS` in policies)

### No Results Returned

**Check:**
1. Table exists: `SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'my_table')`
2. RLS policies allow access: `SELECT * FROM pg_policies WHERE tablename = 'my_table'`
3. User has permissions: Check if `auth.uid()` matches `user_id`

---

## 7. Best Practices

### 1. Always Start with Authentication
```typescript
// First call in any session
await CallMcpTool("plugin-supabase-supabase", "mcp_auth", {});
```

### 2. Cache Project ID
```typescript
const projectId = "zshgaiqapgesppcvfnwz";
// Use everywhere instead of calling list_projects repeatedly
```

### 3. Use Transactions for Related Operations
```sql
BEGIN;
  CREATE TABLE foo (...);
  CREATE INDEX idx_foo ON foo(id);
  ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
COMMIT;
```

### 4. Always Enable RLS on New Tables
```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY my_policy ON my_table FOR ALL USING (auth.uid() = user_id);
```

### 5. Log Query Results in Development
```typescript
const result = await CallMcpTool("execute_sql", { ... });
console.log("[Supabase MCP]", result);
```

---

## Summary

The Supabase MCP plugin provides:
- **Direct database access** without leaving Cursor
- **29 powerful tools** for schema, migrations, and queries
- **Safe execution** with RLS and untrusted data boundaries
- **Real-time debugging** for extraction pipelines
- **Schema management** without Supabase dashboard

**Use it to:**
- Debug why data isn't being stored
- Verify migrations are applied
- Check table structure
- Create missing tables
- Monitor extraction activity
- Validate vector embeddings

**It's the fastest way to understand and fix backend issues.**
