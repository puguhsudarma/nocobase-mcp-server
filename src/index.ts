import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const NOCOBASE_URL = "http://localhost:13000";
const API_TOKEN = process.env.NOCOBASE_API_TOKEN ?? "";

if (!API_TOKEN) {
  process.stderr.write("NOCOBASE_API_TOKEN env variable is required\n");
  process.exit(1);
}

const reqHeaders: Record<string, string> = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
};

async function nocoFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${NOCOBASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...reqHeaders, ...(options.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const server = new McpServer({ name: "nocobase-mcp-server", version: "1.0.0" });

// Reusable schema for arbitrary JSON objects (Zod v4: record needs key + value)
const JsonObject = z.record(z.string(), z.unknown());

// 1. list_collections
server.registerTool(
  "list_collections",
  { description: "List all collections in NocoBase" },
  async () => ok(await nocoFetch("/api/collections"))
);

// 2. get_collection
server.registerTool(
  "get_collection",
  {
    description: "Get a specific collection by name",
    inputSchema: { name: z.string().describe("Collection name") },
  },
  async ({ name }) => ok(await nocoFetch(`/api/collections/${name}`))
);

// 3. list_pages
server.registerTool(
  "list_pages",
  { description: "List all UI schemas (pages) in NocoBase" },
  async () => ok(await nocoFetch("/api/uiSchemas"))
);

// 4. get_page
server.registerTool(
  "get_page",
  {
    description: "Get a specific UI schema (page) by UID",
    inputSchema: { uid: z.string().describe("UI schema UID") },
  },
  async ({ uid }) => ok(await nocoFetch(`/api/uiSchemas/${uid}`))
);

// 5. create_page
server.registerTool(
  "create_page",
  {
    description: "Create a new UI schema (page) in NocoBase",
    inputSchema: { schema: JsonObject.describe("UI schema object to create (JSON)") },
  },
  async ({ schema }) =>
    ok(await nocoFetch("/api/uiSchemas", { method: "POST", body: JSON.stringify(schema) }))
);

// 6. update_ui_schema
server.registerTool(
  "update_ui_schema",
  {
    description: "Update an existing UI schema by UID",
    inputSchema: {
      uid: z.string().describe("UI schema UID"),
      patch: JsonObject.describe("Partial schema fields to update (JSON)"),
    },
  },
  async ({ uid, patch }) =>
    ok(await nocoFetch(`/api/uiSchemas/${uid}`, { method: "PATCH", body: JSON.stringify(patch) }))
);

// 7. list_menus
server.registerTool(
  "list_menus",
  { description: "List all menu items in NocoBase" },
  async () => ok(await nocoFetch("/api/menuItems"))
);

// 8. create_menu
server.registerTool(
  "create_menu",
  {
    description: "Create a new menu item in NocoBase",
    inputSchema: { item: JsonObject.describe("Menu item object to create (JSON)") },
  },
  async ({ item }) =>
    ok(await nocoFetch("/api/menuItems", { method: "POST", body: JSON.stringify(item) }))
);

// 9. get_js_block
server.registerTool(
  "get_js_block",
  {
    description: "Get a JS block UI schema by UID",
    inputSchema: { uid: z.string().describe("UI schema UID of the JS block") },
  },
  async ({ uid }) => {
    const data = await nocoFetch(`/api/uiSchemas/${uid}`);
    const schema = ((data as { data?: Record<string, unknown> })?.data ?? data) as Record<string, unknown>;
    const note =
      schema?.["x-component"] !== "CustomRequestBlock" && schema?.["type"] !== "jsBlock"
        ? "Note: schema type may not be jsBlock.\n\n"
        : "";
    return { content: [{ type: "text" as const, text: `${note}${JSON.stringify(data, null, 2)}` }] };
  }
);

// 10. update_js_block
server.registerTool(
  "update_js_block",
  {
    description: "Update the code content of a JS block UI schema by UID",
    inputSchema: {
      uid: z.string().describe("UI schema UID of the JS block"),
      code: z.string().describe("New JavaScript code content"),
    },
  },
  async ({ uid, code }) =>
    ok(
      await nocoFetch(`/api/uiSchemas/${uid}`, {
        method: "PATCH",
        body: JSON.stringify({ "x-component-props": { code } }),
      })
    )
);

const transport = new StdioServerTransport();
await server.connect(transport);
