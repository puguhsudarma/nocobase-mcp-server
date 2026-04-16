# nocobase-mcp-server

An MCP (Model Context Protocol) server for [NocoBase](https://www.nocobase.com/), enabling AI assistants like Claude to interact with your NocoBase instance — read collections, manage UI schemas, build flowPage blocks, and run dynamic API operations via OpenAPI.

## Features

- **24 hand-crafted tools** covering collections, UI schemas, desktop routes, flow models, and JS blocks
- **Dynamic tools** auto-generated from your NocoBase's OpenAPI/Swagger spec (requires API documentation plugin)
- Works with NocoBase v2.x (tested on `2.0.17-full`)

## Requirements

- Node.js 18+
- A running NocoBase instance
- A NocoBase API token (root or sufficient permissions)

## Installation

### Option A — via npm (recommended)

```bash
npm install -g @reroet/nocobase-mcp-server
```

Then add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "nocobase": {
      "type": "stdio",
      "command": "nocobase-mcp-server",
      "env": {
        "NOCOBASE_URL": "http://localhost:13000",
        "NOCOBASE_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

Or use `npx` without installing globally:

```json
{
  "mcpServers": {
    "nocobase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@reroet/nocobase-mcp-server"],
      "env": {
        "NOCOBASE_URL": "http://localhost:13000",
        "NOCOBASE_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

### Option B — from source

```bash
git clone https://github.com/puguhsudarma/nocobase-mcp-server.git
cd nocobase-mcp-server
pnpm install
```

Then add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "nocobase": {
      "type": "stdio",
      "command": "/absolute/path/to/nocobase-mcp-server/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/nocobase-mcp-server/src/index.ts"],
      "env": {
        "NOCOBASE_URL": "http://localhost:13000",
        "NOCOBASE_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

Replace `/absolute/path/to/nocobase-mcp-server` with the actual path (e.g. `/Users/yourname/Projects/nocobase-mcp-server`).

### Environment Variables

| Variable             | Required | Default                  | Description                |
| -------------------- | -------- | ------------------------ | -------------------------- |
| `NOCOBASE_API_TOKEN` | **Yes**  | —                        | NocoBase API token         |
| `NOCOBASE_URL`       | No       | `http://localhost:13000` | NocoBase instance base URL |

### Getting an API Token

1. In NocoBase UI: **Settings → Plugins** → enable the **API keys** plugin
2. Go to **Settings → API keys → Add API key**
3. Copy the generated token

### Enabling Dynamic Tools (optional)

Enable the **API documentation** plugin in NocoBase (**Settings → Plugins**). Once active, the server will automatically load all additional API endpoints as tools on startup.

## Tools Reference

### Collections

| Tool               | Description              |
| ------------------ | ------------------------ |
| `list_collections` | List all collections     |
| `get_collection`   | Get a collection by name |

### UI Schemas (Classic Pages)

| Tool                     | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `list_pages`             | List all UI schema nodes                           |
| `get_page`               | Get full nested UI schema tree by UID              |
| `get_parent_schema`      | Get the parent schema of a node                    |
| `create_page`            | Create a new root-level UI schema node             |
| `insert_new_schema`      | Create and insert a new UI schema node             |
| `insert_adjacent_schema` | Insert a schema node relative to a target node     |
| `update_ui_schema`       | Patch an existing UI schema node                   |
| `batch_patch_ui_schema`  | Patch multiple UI schema nodes in one request      |
| `remove_ui_schema`       | Remove a UI schema node and its descendants ⚠️     |
| `save_as_template`       | Save a UI schema node as a reusable block template |

### Desktop Routes / Navigation

| Tool                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `list_desktop_routes` | List all desktop routes (pages, menus, groups, tabs) |

### Flow Models (flowPage blocks)

| Tool                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| `get_flow_model`           | Get a flowPage block by UID                  |
| `get_flow_model_by_parent` | Get a flowPage block by parent ID and subKey |
| `save_flow_model`          | Create or update a flowPage block            |
| `attach_flow_model`        | Attach a block to a flowPage container       |
| `move_flow_model`          | Move a block to a different position         |
| `duplicate_flow_model`     | Deep-copy a block and auto-attach it         |
| `destroy_flow_model`       | Delete a block and its children ⚠️           |

### JS Blocks

| Tool                   | Description                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `get_js_block`         | Get a JS block schema (classic page)                                                    |
| `update_js_block`      | Update JS block code (classic page)                                                     |
| `update_flow_js_block` | Update JS block code inside a flowPage — use `ctx.render()` or JSX via `ctx.libs.React` |

> ⚠️ Destructive operations cannot be undone.

## JS Block Sandbox

flowPage JS blocks run in NocoBase's sandbox. Available APIs:

```js
// Render HTML
ctx.render(`<h1>Hello</h1>`);

// Render JSX with React + Ant Design
const { React, antd } = ctx.libs;
const { useState } = React;
const { Table, Tag } = antd;

function MyComponent() {
  const [tab, setTab] = useState("a");
  return <div>...</div>;
}

ctx.render(<MyComponent />);
```

## Example Prompts

> **How to get UIDs:**
>
> - **Block UID** — right-click any block in NocoBase UI → **Copy UID** (e.g. `add17a3cf3f`)
> - **Page UID** — visible in the browser URL when you open a page (e.g. `http://localhost:13000/page/96acpujiwc6` → UID is `96acpujiwc6`)

### Without Figma MCP

```
List all collections in my NocoBase, then create a JS block on flowPage "<your-page-uid>"
that shows a summary dashboard with total records from the "users" collection.
```

```
Get the flowPage with UID "<your-page-uid>", add a new JS block below the existing ones
(the grid block UID is "<your-grid-uid>"), and implement a tabbed table showing data
from the "orders" and "products" collections.
```

```
Show me all desktop routes, then fetch the UI schema tree of the first page
and explain its block structure.
```

### With Figma MCP

```
Here's my Figma design: https://www.figma.com/board/XXXXXXXXXXXXXXXX/MyApp?node-id=8273-xxxx
Implement it as a JS block on flowPage "<your-page-uid>" (grid UID: "<your-grid-uid>").
Use React + Ant Design from ctx.libs. Use dummy data for now.
```

```
Fetch the Figma design at the link above, then create a new JS block on my NocoBase
flowPage and implement the tabs component with the exact columns from the Figma table.
The block UID I want to update is "<your-block-uid>".
```

## Contributing

Contributions are welcome! To add a new tool:

1. Fork the repo and create a feature branch
2. Add your tool in `src/index.ts` using `server.registerTool()`
3. Follow the existing pattern — use `nocoFetch()` for API calls and `ok()` to format responses
4. Update the tool list in `README.md`
5. Open a pull request

For bug reports or feature requests, open an issue on GitHub.

## License

MIT — see [LICENSE](LICENSE) for details.
