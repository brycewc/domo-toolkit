---
description: Use Postman MCP for Domo API reference
---

# Domo API Reference

When working with Domo API endpoints (fetching data, building service functions, debugging API issues):

1. **User-provided endpoints take precedence.** If the user gives you an endpoint path, method, or usage instructions directly, use those as the source of truth, even if Postman doesn't have a matching entry.
2. When the user hasn't specified the endpoint, use the **Postman MCP** tools (prefixed `mcp__postman__`) to look up the correct endpoint, method, request body, and response format before writing or modifying API calls. Prefer the **local STDIO MCP server** if available; fall back to the **remote streamable HTTP MCP server** otherwise. The tool names and capabilities are the same across both.
3. Search with `searchPostmanElements` to find the endpoint. The search term **must** go in the `q` parameter (e.g. `q: "adminsummary dataapps"`). This is a hard gotcha: the tool does **not** error on an unknown key, so passing the term under any other name (`query`, `search`, etc.) is silently ignored and the tool returns a generic, unfiltered default list. That empty-search result looks like real results but is unrelated to your term, so never read it as "the endpoint doesn't exist." Confirm the search actually ran by checking that the response `meta.q` echoes your term, and prefer keyword-style terms (`"adminsummary"`) over long natural-language phrases. A search that genuinely finds nothing is still not proof of absence: fall back to fetching the collection tree (see step 5) or verify with the user.
4. Use `getCollectionRequest` with `populate: true` to get full request details including example responses.
5. The primary collection is **"Domo Product APIs"** (collection ID `17302996-d887dd51-ea30-43be-a2bd-3a81f15cce13`), workspace **"Domo Product APIs"**.
6. Never guess at endpoint paths, request body shapes, or response formats; verify via Postman or the user first.
