import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const NOCOBASE_URL = (process.env.NOCOBASE_URL ?? "http://localhost:13000").replace(/\/$/, "");
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

// ── Collections ──────────────────────────────────────────────────────────────

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

// ── UI Schemas ────────────────────────────────────────────────────────────────

// 3. list_pages
server.registerTool(
  "list_pages",
  { description: "List all UI schemas in NocoBase (returns raw schema nodes, not page-level navigation)" },
  async () => ok(await nocoFetch("/api/uiSchemas"))
);

// 4. get_page
server.registerTool(
  "get_page",
  {
    description: "Get the full nested UI schema tree for a node by UID (uses :getProperties to include all descendants)",
    inputSchema: { uid: z.string().describe("UI schema UID") },
  },
  async ({ uid }) => ok(await nocoFetch(`/api/uiSchemas:getProperties/${uid}`))
);

// 5. get_page_properties
server.registerTool(
  "get_page_properties",
  {
    description: "Get only the direct child properties of a UI schema node by UID (shallow, without the node itself)",
    inputSchema: { uid: z.string().describe("UI schema UID") },
  },
  async ({ uid }) => ok(await nocoFetch(`/api/uiSchemas:getProperties/${uid}`))
);

// 6. get_parent_schema
server.registerTool(
  "get_parent_schema",
  {
    description: "Get the parent UI schema of a node by UID",
    inputSchema: { uid: z.string().describe("UI schema UID of the child node") },
  },
  async ({ uid }) => ok(await nocoFetch(`/api/uiSchemas:getParentJsonSchema/${uid}`))
);

// 7. create_page
server.registerTool(
  "create_page",
  {
    description: "Create a new root-level UI schema node in NocoBase",
    inputSchema: { schema: JsonObject.describe("UI schema object to create (JSON)") },
  },
  async ({ schema }) =>
    ok(await nocoFetch("/api/uiSchemas", { method: "POST", body: JSON.stringify(schema) }))
);

// 8. insert_new_schema
server.registerTool(
  "insert_new_schema",
  {
    description: "Create and insert a new UI schema node via NocoBase's insertNewSchema action",
    inputSchema: { schema: JsonObject.describe("Schema node to create and insert (JSON)") },
  },
  async ({ schema }) =>
    ok(await nocoFetch("/api/uiSchemas:insertNewSchema", { method: "POST", body: JSON.stringify({ schema }) }))
);

// 9. insert_adjacent_schema
server.registerTool(
  "insert_adjacent_schema",
  {
    description: "Insert a schema node at a position relative to a target node. Position values: beforeBegin (prev sibling), afterBegin (first child), beforeEnd (last child), afterEnd (next sibling)",
    inputSchema: {
      uid: z.string().describe("Target UI schema UID to insert relative to"),
      schema: JsonObject.describe("New schema node to insert (JSON)"),
      position: z.enum(["beforeBegin", "afterBegin", "beforeEnd", "afterEnd"]).describe("Insert position relative to the target node"),
    },
  },
  async ({ uid, schema, position }) =>
    ok(await nocoFetch(`/api/uiSchemas:insertAdjacent/${uid}`, {
      method: "POST",
      body: JSON.stringify({ schema, position }),
    }))
);

// 10. update_ui_schema
server.registerTool(
  "update_ui_schema",
  {
    description: "Patch an existing UI schema node by UID (partial update)",
    inputSchema: {
      uid: z.string().describe("UI schema UID"),
      patch: JsonObject.describe("Partial schema fields to update (JSON)"),
    },
  },
  async ({ uid, patch }) =>
    ok(await nocoFetch(`/api/uiSchemas:patch`, { method: "POST", body: JSON.stringify({ ...patch, "x-uid": uid }) }))
);

// 11. batch_patch_ui_schema
server.registerTool(
  "batch_patch_ui_schema",
  {
    description: "Patch multiple UI schema nodes in a single request. Each object in the patches array must include 'x-uid' plus the fields to update.",
    inputSchema: {
      patches: z.array(JsonObject).describe("Array of partial schema patch objects, each identified by x-uid"),
    },
  },
  async ({ patches }) =>
    ok(await nocoFetch("/api/uiSchemas:batchPatch", { method: "POST", body: JSON.stringify(patches) }))
);

// 12. remove_ui_schema
server.registerTool(
  "remove_ui_schema",
  {
    description: "Remove a UI schema node and all its descendants by UID. DESTRUCTIVE — cannot be undone.",
    inputSchema: { uid: z.string().describe("UI schema UID to remove") },
  },
  async ({ uid }) =>
    ok(await nocoFetch(`/api/uiSchemas:remove/${uid}`, { method: "DELETE" }))
);

// 13. save_as_template
server.registerTool(
  "save_as_template",
  {
    description: "Save an existing UI schema node as a reusable block template",
    inputSchema: {
      uid: z.string().describe("UI schema UID to save as template"),
      values: JsonObject.describe("Template metadata (e.g. name, componentName, collectionName)"),
    },
  },
  async ({ uid, values }) =>
    ok(await nocoFetch(`/api/uiSchemas:saveAsTemplate/${uid}`, {
      method: "POST",
      body: JSON.stringify({ values }),
    }))
);

// ── Desktop Routes (Navigation / Pages) ──────────────────────────────────────

// 14. list_desktop_routes
server.registerTool(
  "list_desktop_routes",
  {
    description: "List all desktop routes (pages and menus) in NocoBase v2. Each route has a type: 'page', 'flowPage', 'group', 'tabs'. Use schemaUid to fetch page content. Works for both classic pages and flowPages.",
    inputSchema: {
      pageSize: z.number().optional().describe("Number of routes per page (default 100)"),
    },
  },
  async ({ pageSize = 100 }) =>
    ok(await nocoFetch(`/api/desktopRoutes?pageSize=${pageSize}`))
);

// ── Flow Models (flowPage content) ───────────────────────────────────────────

// 15. get_flow_model
server.registerTool(
  "get_flow_model",
  {
    description: "Get a flowPage block/model by UID. Use this for blocks inside flowPage type pages (not classic 'page' type). Returns the block's model data including 'use' (component type), 'parentId', 'stepParams', etc.",
    inputSchema: {
      uid: z.string().describe("Flow model UID (from 'Copy UID' on a block inside a flowPage)"),
      includeAsyncNode: z.boolean().optional().describe("Whether to include async node data (default false)"),
    },
  },
  async ({ uid, includeAsyncNode = false }) =>
    ok(await nocoFetch(`/api/flowModels:findOne?uid=${uid}&includeAsyncNode=${includeAsyncNode}`))
);

// 16. get_flow_model_by_parent
server.registerTool(
  "get_flow_model_by_parent",
  {
    description: "Get a flowPage block/model by its parent ID and subKey. Useful for navigating the flowPage block tree.",
    inputSchema: {
      parentId: z.string().describe("Parent flow model UID"),
      subKey: z.string().optional().describe("Sub-key within the parent (e.g. 'items')"),
      includeAsyncNode: z.boolean().optional().describe("Whether to include async node data (default false)"),
    },
  },
  async ({ parentId, subKey, includeAsyncNode = false }) => {
    const qs = new URLSearchParams({ parentId, includeAsyncNode: String(includeAsyncNode) });
    if (subKey) qs.set("subKey", subKey);
    return ok(await nocoFetch(`/api/flowModels:findOne?${qs}`));
  }
);

// 17. save_flow_model
server.registerTool(
  "save_flow_model",
  {
    description: "Create or update a flowPage block/model. If 'uid' is provided in values, it updates; otherwise creates a new one. The 'use' field specifies the component type (e.g. 'JSBlockModel', 'TableBlockModel'). NOTE: after creating, call attach_flow_model to make it appear on the page.",
    inputSchema: {
      values: JsonObject.describe("Flow model data. Key fields: uid (optional), use (component type), parentId, subKey, subType, stepParams, sortIndex"),
    },
  },
  // NocoBase assigns the entire body as ctx.action.params.values, so send data directly (no { values } wrapper)
  async ({ values }) =>
    ok(await nocoFetch("/api/flowModels:save", { method: "POST", body: JSON.stringify(values) }))
);

// 18. attach_flow_model
server.registerTool(
  "attach_flow_model",
  {
    description: "Attach an existing flowPage block/model to a parent. Use this to add an existing block into a flowPage container at a specific position.",
    inputSchema: {
      uid: z.string().describe("Flow model UID to attach"),
      parentId: z.string().describe("Parent flow model UID to attach to"),
      subKey: z.string().describe("Sub-key within the parent (e.g. 'items')"),
      subType: z.string().optional().describe("Sub-type (e.g. 'array')"),
      position: z.number().optional().describe("Sort position index"),
    },
  },
  async ({ uid, parentId, subKey, subType, position }) => {
    const qs = new URLSearchParams({ uid, parentId, subKey });
    if (subType) qs.set("subType", subType);
    if (position !== undefined) qs.set("position", String(position));
    return ok(await nocoFetch(`/api/flowModels:attach?${qs}`, { method: "POST" }));
  }
);

// 19. move_flow_model
server.registerTool(
  "move_flow_model",
  {
    description: "Move a flowPage block/model to a different position relative to another block.",
    inputSchema: {
      sourceId: z.string().describe("UID of the flow model to move"),
      targetId: z.string().describe("UID of the target flow model (reference position)"),
      position: z.number().optional().describe("Target sort position index"),
    },
  },
  async ({ sourceId, targetId, position }) => {
    const qs = new URLSearchParams({ sourceId, targetId });
    if (position !== undefined) qs.set("position", String(position));
    return ok(await nocoFetch(`/api/flowModels:move?${qs}`, { method: "POST" }));
  }
);

// 20. duplicate_flow_model
server.registerTool(
  "duplicate_flow_model",
  {
    description: "Duplicate an existing flowPage block/model (deep copy) and automatically attach it to the same parent. Returns the new block's data.",
    inputSchema: {
      uid: z.string().describe("Flow model UID to duplicate"),
    },
  },
  async ({ uid }) => {
    // Step 1: duplicate
    const result = await nocoFetch(`/api/flowModels:duplicate?uid=${uid}`, { method: "POST" }) as { data: Record<string, unknown> };
    const model = result?.data;
    const newUid = model?.uid as string;
    const parentId = model?.parentId as string;
    const subKey = model?.subKey as string;
    const subType = model?.subType as string | undefined;

    if (!newUid || !parentId || !subKey) {
      return ok(result);
    }

    // Step 2: auto-attach to the same parent
    const qs = new URLSearchParams({ uid: newUid, parentId, subKey });
    if (subType) qs.set("subType", subType);
    await nocoFetch(`/api/flowModels:attach?${qs}`, { method: "POST" });

    return ok(result);
  }
);

// 21. destroy_flow_model
server.registerTool(
  "destroy_flow_model",
  {
    description: "Delete a flowPage block/model by UID. DESTRUCTIVE — also removes child blocks.",
    inputSchema: {
      uid: z.string().describe("Flow model UID to delete"),
    },
  },
  async ({ uid }) =>
    ok(await nocoFetch(`/api/flowModels:destroy?filterByTk=${uid}`, { method: "DELETE" }))
);

// ── JS Blocks ─────────────────────────────────────────────────────────────────

// 22. get_js_block
server.registerTool(
  "get_js_block",
  {
    description: "Get a JS block UI schema by UID (for classic 'page' type pages, not flowPage)",
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

// 23. update_js_block (classic page)
server.registerTool(
  "update_js_block",
  {
    description: "Update the code content of a JS block UI schema by UID (for classic 'page' type pages, not flowPage)",
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

// 24. update_flow_js_block
server.registerTool(
  "update_flow_js_block",
  {
    description: "Update the JavaScript code of a JSBlockModel inside a flowPage. Code runs in NocoBase sandbox — use ctx.render(htmlString) to render output. Example: ctx.render(`<h1>Hello</h1>`);",
    inputSchema: {
      uid: z.string().describe("Flow model UID of the JS block (JSBlockModel)"),
      code: z.string().describe("JavaScript code using ctx.render(htmlString) sandbox API"),
    },
  },
  async ({ uid, code }) =>
    ok(
      await nocoFetch("/api/flowModels:save", {
        method: "POST",
        body: JSON.stringify({
          uid,
          stepParams: {
            jsSettings: {
              runJs: { code, version: "v2" },
            },
          },
        }),
      })
    )
);

// ── Dynamic tools from OpenAPI/Swagger ───────────────────────────────────────

const MANUAL_TOOLS = new Set([
  "list_collections","get_collection","list_pages","get_page","get_page_properties",
  "get_parent_schema","create_page","insert_new_schema","insert_adjacent_schema",
  "update_ui_schema","batch_patch_ui_schema","remove_ui_schema","save_as_template",
  "list_desktop_routes","get_flow_model","get_flow_model_by_parent","save_flow_model",
  "attach_flow_model","move_flow_model","duplicate_flow_model","destroy_flow_model",
  "get_js_block","update_js_block",
]);

function jsonPropToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (prop.type) {
    case "string":  schema = z.string(); break;
    case "integer":
    case "number":  schema = z.number(); break;
    case "boolean": schema = z.boolean(); break;
    case "array":   schema = z.array(z.unknown()); break;
    case "object":  schema = z.record(z.string(), z.unknown()); break;
    default:        schema = z.unknown();
  }
  if (prop.description) schema = schema.describe(prop.description as string);
  if (!prop.required)   schema = schema.optional();
  return schema;
}

try {
  const { Converter } = await import("openapi2mcptools");

  const httpClient = {
    request: async (requestConfig: {
      url?: string; method?: string;
      headers?: Record<string, string>; params?: Record<string, string>;
      data?: Record<string, unknown>;
    }) => {
      const { url = "", method = "GET", headers = {}, params = {}, data = {} } = requestConfig;
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
      ).toString();
      const fullUrl = `${NOCOBASE_URL}${url}${qs ? "?" + qs : ""}`;
      const hasBody = Object.keys(data).length > 0;
      const res = await fetch(fullUrl, {
        method: method.toUpperCase(),
        headers: { ...reqHeaders, ...headers },
        body: hasBody ? JSON.stringify(data) : undefined,
      });
      const text = await res.text();
      try { return { data: JSON.parse(text) }; } catch { return { data: text }; }
    },
  };

  const swaggerSpec = await nocoFetch("/api/swagger:get");
  const converter = new Converter({ httpClient });
  await converter.load(swaggerSpec);

  const toolCaller = converter.getToolsCaller();
  const dynamicTools = converter.getToolsList();
  let registered = 0;

  for (const tool of dynamicTools) {
    if (!tool.name || MANUAL_TOOLS.has(tool.name)) continue;
    const props = (tool.inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
    const inputSchema = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, jsonPropToZod(v)])
    );
    const toolName = tool.name;
    server.registerTool(
      toolName,
      { description: tool.description ?? toolName, inputSchema },
      async (args) => {
        const result = await toolCaller({ params: { name: toolName, arguments: args } });
        return ok((result as { toolResult?: unknown }).toolResult ?? result);
      }
    );
    registered++;
  }

  process.stderr.write(`Dynamic tools loaded: ${registered} (swagger paths: ${dynamicTools.length})\n`);
} catch (e) {
  process.stderr.write(`Dynamic tools skipped: ${e}\n`);
}

const transport = new StdioServerTransport();
await server.connect(transport);
