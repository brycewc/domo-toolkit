# Pipeline Tracer Integration

## TL;DR

> **Quick Summary**: Integrate an ETL Pipeline Tracer into the MajorDomo Chrome Extension with a two-tier UX: quick hierarchical lineage view in sidepanel + full React Flow tracer as an injected overlay on Domo pages.
> 
> **Deliverables**:
> - Sidepanel LineageView component showing upstream/downstream lineage
> - Full-page tracer overlay with React Flow graph, ETL Inspector, and Data Preview
> - Lineage and ETL parsing services adapted for client-side execution
> - ActionButtons integration for triggering lineage trace
> 
> **Estimated Effort**: Large (5-7 days)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 (CSP POC) -> Task 1 (Services) -> Task 3 (Overlay) -> Task 9 (Integration)

---

## Context

### Original Request
Port the ETL Pipeline Tracer prototype from "E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer" into the MajorDomo Chrome Extension at "D:\VS Code\domo-chrome-extension\majordomo-toolkit". The tracer should allow users to visualize dataset lineage, inspect ETL dataflow tiles, and preview dataset data.

### Interview Summary
**Key Discussions**:
- **Entry Point**: Context-aware (auto-show when on Dataset/Dataflow page) AND manual ID search
- **Primary View**: Full tracer opens as injected overlay on Domo pages; sidepanel shows hierarchical summary
- **MVP Features**: Lineage graph visualization, ETL tile inspector, Data preview (NOT cross-pipeline search)
- **Sidepanel UX**: Hierarchical list using existing DataList/DisclosureGroup pattern
- **Overlay UX**: Full-page takeover with close button, depth control in header
- **Traceable Types**: Datasets + Dataflows only (Cards display in graph but not traceable)
- **Scope Limitation**: Only works on Domo pages (uses current session)

**Research Findings**:
- Prototype uses Express backend for metadata enrichment (names, row counts) - must adapt for client-side
- Chrome extension has `executeInPage()` utility for authenticated API calls
- DomoObjectType registry already supports DATA_SOURCE and DATAFLOW types
- TanStack Table already in dependencies - reuse for data preview
- Existing patterns: Disclosure/DisclosureGroup, StatusBar, DataList

### Metis Review
**Identified Gaps** (addressed):
- **CSP Risk**: React Flow injection might be blocked by Domo's Content Security Policy - added POC task
- **Metadata Enrichment**: Lineage API returns IDs only; need batched client-side name resolution
- **TypeScript vs JS**: Stay with JavaScript to match existing codebase
- **Cards Behavior**: Display in graph as leaf nodes but NOT traceable; click opens in Domo

---

## Work Objectives

### Core Objective
Enable Domo power users to trace data lineage from datasets and dataflows, inspect ETL tile details, and preview dataset contents directly within the Chrome extension.

### Concrete Deliverables
1. `src/services/lineageService.js` - Lineage API client with metadata enrichment
2. `src/services/etlParser.js` - ETL dataflow JSON parser
3. `src/components/LineageView.jsx` - Sidepanel hierarchical lineage component
4. `src/components/tracer/TracerOverlay.jsx` - Full-page overlay with React Flow
5. `src/components/tracer/PipelineGraph.jsx` - React Flow graph component
6. `src/components/tracer/ETLInspector.jsx` - ETL tile inspector panel
7. `src/components/tracer/DataPreviewPanel.jsx` - Dataset preview table
8. `src/components/functions/TraceLineage.jsx` - ActionButton for manual trace
9. `manifest.config.js` updates - CSP permissions if needed

### Definition of Done
- [ ] User on a Dataset page sees lineage in sidepanel automatically
- [ ] Clicking "Trace Lineage" button opens full tracer overlay
- [ ] Graph shows datasets (blue), dataflows (purple), cards (gray) with edges
- [ ] Clicking a dataflow node shows ETL tiles in inspector panel
- [ ] Clicking a dataset node shows data preview in bottom panel
- [ ] Depth selector allows 1-5 levels of trace depth
- [ ] Escape or close button dismisses overlay and returns to Domo page
- [ ] All API calls work via executeInPage() without backend server

### Must Have
- Hierarchical lineage view in sidepanel
- React Flow graph in full tracer overlay
- ETL tile parsing and display (filters, joins, expressions, SQL)
- Dataset data preview (headers + rows)
- Configurable trace depth
- Works on any Domo instance (uses current session)

### Must NOT Have (Guardrails)
- **No test infrastructure setup** - Manual verification only
- **No persistent storage** of lineage results (session-only)
- **No search history** persistence
- **No mock mode** for offline development
- **No Card tracing** - Cards are leaf nodes only
- **No cross-pipeline search** - Deferred to future version
- **No TypeScript** - Stay consistent with existing JS codebase
- **No standalone extension page** - Overlay injected into Domo page only

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO
- **User wants tests**: Manual-only
- **Framework**: None

### Automated Verification (Agent-Executable)

Each TODO includes verification procedures the executing agent can run:

**For UI changes** (using playwright skill):
```
1. Navigate to: https://{instance}.domo.com/datasources/{id}/details/overview
2. Wait for: sidepanel to load (chrome.sidePanel)
3. Assert: Lineage section visible with upstream/downstream items
4. Click: "Trace Lineage" button
5. Wait for: Full overlay to appear
6. Screenshot: .sisyphus/evidence/task-N-{description}.png
```

**For service changes** (using Bash bun eval):
```bash
cd D:\VS Code\domo-chrome-extension\majordomo-toolkit
bun -e "import { parseDataflow } from './src/services/etlParser.js'; console.log(typeof parseDataflow)"
# Assert: Output is "function"
```

**Extension Load Verification**:
```
1. Build extension: npm run build
2. Load in Chrome: chrome://extensions -> Load unpacked -> dist/
3. Navigate to Domo page
4. Open sidepanel
5. Verify no console errors
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Start Immediately - CRITICAL):
+-- Task 0: CSP Proof-of-Concept

Wave 1 (After Wave 0 passes):
+-- Task 1: Port lineageService.js
+-- Task 2: Port etlParser.js
+-- Task 4: Create LineageView.jsx (sidepanel)

Wave 2 (After Task 1):
+-- Task 3: Create TracerOverlay.jsx (requires services)
+-- Task 5: Create ETLInspector.jsx
+-- Task 6: Create DataPreviewPanel.jsx

Wave 3 (Final Integration):
+-- Task 7: Create TraceLineage action button
+-- Task 8: Integrate LineageView into sidepanel
+-- Task 9: Wire up full flow and test

Critical Path: Task 0 -> Task 1 -> Task 3 -> Task 9
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1, 2, 3, 4, 5, 6, 7, 8, 9 | None (gate) |
| 1 | 0 | 3 | 2, 4 |
| 2 | 0 | 5 | 1, 4 |
| 3 | 1 | 9 | 5, 6 |
| 4 | 0 | 8 | 1, 2 |
| 5 | 2 | 9 | 3, 6 |
| 6 | 1 | 9 | 3, 5 |
| 7 | 0 | 9 | 4, 5, 6 |
| 8 | 4 | 9 | 5, 6, 7 |
| 9 | 3, 5, 6, 7, 8 | None (final) | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 0 | 0 | delegate_task(category="quick", load_skills=["frontend-ui-ux"]) |
| 1 | 1, 2, 4 | 3x delegate_task(category="unspecified-high", run_in_background=true) |
| 2 | 3, 5, 6 | 3x delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"], run_in_background=true) |
| 3 | 7, 8, 9 | Sequential, category="visual-engineering" |

---

## TODOs

### Task 0: CSP Proof-of-Concept (CRITICAL GATE)

**What to do**:
- Create a minimal test to verify React Flow can be injected into Domo pages
- Inject a simple React Flow graph via content script
- Verify no CSP violations occur
- If CSP blocks, document the error and research solutions (manifest permissions, alternative approaches)

**Must NOT do**:
- Do not build full tracer yet
- Do not add permanent dependencies if POC fails

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Understanding of Chrome extension content script injection patterns

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 0 (standalone gate)
- **Blocks**: ALL other tasks
- **Blocked By**: None

**References**:

**Pattern References**:
- `src/contentScript.js` - Existing content script injection pattern
- `manifest.config.js:content_scripts` - Content script configuration

**External References**:
- React Flow CSP requirements: https://reactflow.dev/learn/troubleshooting#content-security-policy
- Chrome Extension CSP: https://developer.chrome.com/docs/extensions/mv3/intro/mv3-migration/#content-security-policy

**Acceptance Criteria**:

```bash
# 1. Create minimal POC file
# 2. Build extension: npm run build
# 3. Load in Chrome, navigate to any Domo page
# 4. Open DevTools Console
```

**Playwright verification**:
```
1. Navigate to: https://domo-instance.domo.com/page/123
2. Open DevTools console (F12)
3. Assert: No CSP violation errors
4. Assert: React Flow container element exists in DOM
5. Screenshot: .sisyphus/evidence/task-0-csp-poc.png
```

**Success**: React Flow renders without CSP errors
**Failure**: Document error, create issue for alternative approach

**Commit**: YES
- Message: `feat(tracer): CSP proof-of-concept for React Flow injection`
- Files: `src/tracer-poc.js` (temporary)
- Pre-commit: `npm run build`

---

### Task 1: Port lineageService.js

**What to do**:
- Create `src/services/lineageService.js` based on prototype's `src/services/lineageService.ts`
- Convert TypeScript to JavaScript
- Replace `fetch()` calls with `executeInPage()` wrapper
- Implement `tracePipeline(entityType, entityId, depth)` function
- Implement client-side metadata enrichment (batch fetch names for datasets/dataflows)
- Return graph structure: `{ nodes: PipelineNode[], edges: PipelineEdge[], dataflowIds: string[] }`

**Must NOT do**:
- Do not use Zustand (use React state instead)
- Do not implement caching (keep it simple for v1)
- Do not trace Cards (filter them out)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Understanding of service patterns and async data flow

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 4)
- **Blocks**: Tasks 3, 6
- **Blocked By**: Task 0

**References**:

**Pattern References** (existing code to follow):
- `src/services/allObjects.js:fetchObjectDetailsInPage()` - Pattern for executeInPage API calls
- `src/utils/executeInPage.js` - Core utility for MAIN world execution

**Source References** (prototype code to port):
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\services\lineageService.ts` - Full lineage service to port
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\types\lineage.types.ts` - Type definitions for reference

**API References**:
- Lineage API: `GET /api/datalineage/v1/lineage?entityType={type}&entityId={id}`
- Dataset metadata: `GET /api/data/v3/datasources/{id}`
- Dataflow metadata: `GET /api/dataprocessing/v1/dataflows/{id}`

**WHY Each Reference Matters**:
- `fetchObjectDetailsInPage()` shows how to wrap API calls with executeInPage for auth
- Prototype's lineageService.ts has the core algorithm for converting flat API response to graph
- Type definitions clarify expected shapes without enforcing TypeScript

**Acceptance Criteria**:

```bash
# Syntax check
cd "D:\VS Code\domo-chrome-extension\majordomo-toolkit"
bun -e "import { tracePipeline } from './src/services/lineageService.js'; console.log(typeof tracePipeline)"
# Assert: Output is "function"
```

**Extension verification**:
```
1. Build: npm run build
2. Load extension in Chrome
3. Navigate to Domo dataset page
4. Open DevTools console
5. Run: await tracePipeline('DATA_SOURCE', 'dataset-uuid', 1)
6. Assert: Returns object with nodes and edges arrays
```

**Commit**: YES
- Message: `feat(tracer): add lineageService for tracing data pipelines`
- Files: `src/services/lineageService.js`, `src/services/index.js`
- Pre-commit: `npm run build`

---

### Task 2: Port etlParser.js

**What to do**:
- Create `src/services/etlParser.js` based on prototype's `src/services/etlParser.ts`
- Convert TypeScript to JavaScript
- Implement `parseDataflow(dataflowDetail)` function
- Parse Magic ETL tiles into structured format: filters, joins, expressions, SQL, columns
- Implement tile categorization (Input/Output, Transform, Filter, Join, Other)
- Implement `searchTiles(tiles, query)` for tile searching

**Must NOT do**:
- Do not implement mock data
- Do not add type annotations (stay JS)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: []
- **Skills Evaluated but Omitted**:
  - `frontend-ui-ux`: This is pure data transformation, no UI

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 4)
- **Blocks**: Task 5
- **Blocked By**: Task 0

**References**:

**Source References** (prototype code to port):
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\services\etlParser.ts` - Full parser to port
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\types\etl.types.ts` - Tile type definitions

**WHY Each Reference Matters**:
- etlParser.ts contains the complete tile parsing logic for 15+ tile types
- etl.types.ts defines TILE_DISPLAY_NAMES and TILE_CATEGORY_MAP constants

**Acceptance Criteria**:

```bash
# Syntax check
cd "D:\VS Code\domo-chrome-extension\majordomo-toolkit"
bun -e "import { parseDataflow, searchTiles } from './src/services/etlParser.js'; console.log(typeof parseDataflow, typeof searchTiles)"
# Assert: Output is "function function"
```

**Unit test (inline)**:
```bash
bun -e "
import { parseDataflow } from './src/services/etlParser.js';
const mockDataflow = {
  id: '123',
  name: 'Test ETL',
  actions: [
    { id: 'a1', name: 'Filter Step', type: 'Filter', filterList: [{ field: 'status', operator: '=', value: 'active' }] }
  ]
};
const result = parseDataflow(mockDataflow);
console.log(result.tiles.length === 1 ? 'PASS' : 'FAIL');
"
# Assert: Output is "PASS"
```

**Commit**: YES
- Message: `feat(tracer): add etlParser for parsing dataflow tiles`
- Files: `src/services/etlParser.js`, `src/services/index.js`
- Pre-commit: `npm run build`

---

### Task 3: Create TracerOverlay.jsx

**What to do**:
- Create `src/components/tracer/TracerOverlay.jsx` - full-page overlay container
- Create injection mechanism via content script
- Implement overlay structure: header (with depth selector, close button) + main area (graph + panels)
- Create React root in page context and render overlay
- Handle Escape key to close
- Implement depth selector dropdown (1-5 levels)
- Pass callbacks for node clicks to child components

**Must NOT do**:
- Do not implement the actual graph (Task 3a handles that)
- Do not persist depth preference
- Do not add animation/transitions (keep it simple)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Complex overlay layout and interaction design

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 5, 6)
- **Blocks**: Task 9
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/contentScript.js` - Content script injection pattern
- `src/sidepanel/App.jsx` - Layout structure and state management patterns
- `src/components/ActionButtons.jsx:Disclosure` - Expandable panel pattern

**External References**:
- React Flow container setup: https://reactflow.dev/learn

**API References**:
- Chrome scripting API: `chrome.scripting.executeScript()` for injecting React root

**WHY Each Reference Matters**:
- contentScript.js shows how to inject into page context
- sidepanel/App.jsx demonstrates layout patterns and state organization
- React Flow docs explain required container styling (height: 100%)

**Acceptance Criteria**:

**Playwright verification**:
```
1. Navigate to: https://{instance}.domo.com/datasources/{id}/details/overview
2. Trigger overlay (via console or test button)
3. Assert: Overlay covers full viewport
4. Assert: Header with "Pipeline Tracer" title visible
5. Assert: Close (X) button in header
6. Assert: Depth dropdown with options 1-5
7. Press: Escape key
8. Assert: Overlay disappears
9. Screenshot: .sisyphus/evidence/task-3-tracer-overlay.png
```

**Commit**: YES
- Message: `feat(tracer): create TracerOverlay with depth selector and close handling`
- Files: `src/components/tracer/TracerOverlay.jsx`, `src/components/tracer/index.js`
- Pre-commit: `npm run build`

---

### Task 3a: Create PipelineGraph.jsx

**What to do**:
- Create `src/components/tracer/PipelineGraph.jsx` - React Flow graph component
- Add @xyflow/react dependency: `npm install @xyflow/react`
- Implement depth-based horizontal layout (upstream left, downstream right)
- Create custom node component with entity type styling (dataset=blue, dataflow=purple, card=gray)
- Handle node click events and emit to parent
- Implement zoom controls and minimap
- Style edges with appropriate colors

**Must NOT do**:
- Do not handle inspector/preview logic (just emit events)
- Do not implement node tooltips (keep nodes simple)
- Do not add drag-to-create edges (read-only graph)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: React Flow customization and visual design

**Parallelization**:
- **Can Run In Parallel**: NO (runs with Task 3)
- **Parallel Group**: Part of Task 3
- **Blocks**: Task 9
- **Blocked By**: Task 1

**References**:

**Source References** (prototype code to adapt):
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\components\PipelineGraph.tsx` - Graph component
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\components\PipelineNode.tsx` - Custom node

**External References**:
- React Flow custom nodes: https://reactflow.dev/learn/customization/custom-nodes
- React Flow styling: https://reactflow.dev/learn/customization/theming

**WHY Each Reference Matters**:
- PipelineGraph.tsx has the depth-based layout algorithm
- PipelineNode.tsx shows custom node styling with handles

**Acceptance Criteria**:

**Playwright verification**:
```
1. Navigate to Domo dataset page
2. Open tracer overlay with traced data
3. Assert: React Flow canvas renders
4. Assert: Nodes positioned horizontally by depth
5. Assert: Edges connect nodes correctly
6. Assert: Zoom controls visible
7. Assert: Minimap visible
8. Click: A dataflow node
9. Assert: onNodeClick event fired (check console log)
10. Screenshot: .sisyphus/evidence/task-3a-pipeline-graph.png
```

**Commit**: YES (combined with Task 3)
- Message: `feat(tracer): add PipelineGraph with React Flow visualization`
- Files: `src/components/tracer/PipelineGraph.jsx`, `package.json`
- Pre-commit: `npm install && npm run build`

---

### Task 4: Create LineageView.jsx (Sidepanel)

**What to do**:
- Create `src/components/LineageView.jsx` - sidepanel hierarchical lineage view
- Use existing DataList/DisclosureGroup patterns
- Show structure: Upstream (collapsed) -> Current Object (highlighted) -> Downstream (collapsed)
- Fetch lineage on mount when context has DATA_SOURCE or DATAFLOW
- Add "Trace Full Lineage" button to open overlay
- Handle loading and error states
- Show entity type icons (dataset, dataflow, card)

**Must NOT do**:
- Do not fetch if not on Dataset/Dataflow page
- Do not implement inline ETL/data preview (click opens overlay)
- Do not cache results

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Following existing sidepanel patterns

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 1, 2)
- **Blocks**: Task 8
- **Blocked By**: Task 0

**References**:

**Pattern References**:
- `src/components/DataList.jsx` - Hierarchical list with DisclosureGroup
- `src/components/GetPagesView.jsx` - Similar hierarchical view pattern
- `src/sidepanel/App.jsx:transformGroupedPagesData` - Data transformation pattern

**Icon References**:
- `@tabler/icons-react`: IconDatabase (dataset), IconArrowsSplit (dataflow), IconChartBar (card)

**WHY Each Reference Matters**:
- DataList.jsx is the exact pattern to follow for hierarchical display
- GetPagesView.jsx shows how to structure a sidepanel view with loading states
- Icons maintain visual consistency with rest of extension

**Acceptance Criteria**:

**Playwright verification**:
```
1. Navigate to: https://{instance}.domo.com/datasources/{id}/details/overview
2. Open sidepanel
3. Assert: LineageView section visible
4. Assert: Shows "Upstream" disclosure group
5. Assert: Shows "Current: [Dataset Name]" highlighted
6. Assert: Shows "Downstream" disclosure group
7. Assert: "Trace Full Lineage" button visible
8. Click: "Trace Full Lineage"
9. Assert: Overlay opens
10. Screenshot: .sisyphus/evidence/task-4-lineage-view.png
```

**Commit**: YES
- Message: `feat(tracer): add LineageView sidepanel component`
- Files: `src/components/LineageView.jsx`, `src/components/index.js`
- Pre-commit: `npm run build`

---

### Task 5: Create ETLInspector.jsx

**What to do**:
- Create `src/components/tracer/ETLInspector.jsx` - right panel for ETL tile display
- Port design from prototype's `EtlInspector.tsx`
- Display tiles grouped by category (Input/Output, Transform, Filter, Join, Other)
- Show tile details: name, type, filters, joins, expressions, SQL
- Implement tile search input
- Highlight search matches in tile content
- Add close button

**Must NOT do**:
- Do not implement cross-pipeline search (scope limited to current dataflow)
- Do not allow editing tiles

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Complex panel layout with search and grouping

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 6)
- **Blocks**: Task 9
- **Blocked By**: Task 2

**References**:

**Source References** (prototype code to adapt):
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\components\EtlInspector.tsx` - Full inspector component

**Pattern References**:
- `src/components/DataList.jsx` - DisclosureGroup for expandable sections
- `src/components/ActionButtons.jsx` - Search input styling

**WHY Each Reference Matters**:
- EtlInspector.tsx has complete tile rendering logic with TileDetail component
- DataList.jsx patterns for collapsible category groups

**Acceptance Criteria**:

**Playwright verification**:
```
1. Open tracer overlay with traced dataflow
2. Click: A dataflow node
3. Assert: ETLInspector panel appears on right
4. Assert: Header shows dataflow name and tile count
5. Assert: Tiles grouped by category
6. Assert: Each tile shows name and type
7. Click: Expand a filter tile
8. Assert: Shows filter conditions (field, operator, value)
9. Type: Search for column name
10. Assert: Non-matching tiles hidden
11. Screenshot: .sisyphus/evidence/task-5-etl-inspector.png
```

**Commit**: YES
- Message: `feat(tracer): add ETLInspector panel for dataflow tile display`
- Files: `src/components/tracer/ETLInspector.jsx`
- Pre-commit: `npm run build`

---

### Task 6: Create DataPreviewPanel.jsx

**What to do**:
- Create `src/components/tracer/DataPreviewPanel.jsx` - bottom panel for data preview
- Use TanStack Table (already in dependencies) for table rendering
- Fetch data preview via executeInPage: `GET /api/data/v3/datasources/{id}/data?limit=100`
- Display headers and rows with horizontal scroll
- Show dataset name, column count, row count in header
- Add close button
- Handle loading and error states

**Must NOT do**:
- Do not implement export (defer to future)
- Do not implement column sorting/filtering
- Do not implement pagination (just first 100 rows)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Table layout and data display patterns

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 3, 5)
- **Blocks**: Task 9
- **Blocked By**: Task 1

**References**:

**Source References** (prototype code to adapt):
- `E:\F Drive\Downloads\Custom Apps\alchemer\etl-pipeline-tracer\src\components\DataPreviewPanel.tsx` - Preview panel

**Pattern References**:
- `src/utils/executeInPage.js` - For API calls
- TanStack Table docs: https://tanstack.com/table/latest/docs/introduction

**API References**:
- Data preview: `GET /api/data/v3/datasources/{id}/data?limit=100`
- Response: `{ columns: [...], rows: [...] }`

**WHY Each Reference Matters**:
- DataPreviewPanel.tsx shows header layout and table structure
- TanStack Table provides virtualization for large datasets

**Acceptance Criteria**:

**Playwright verification**:
```
1. Open tracer overlay with traced pipeline
2. Click: A dataset node
3. Assert: DataPreviewPanel appears at bottom
4. Assert: Header shows dataset name
5. Assert: Header shows "X columns, 100 rows"
6. Assert: Table headers visible
7. Assert: Table rows visible with data
8. Assert: Horizontal scroll works for wide tables
9. Click: Close button
10. Assert: Panel disappears
11. Screenshot: .sisyphus/evidence/task-6-data-preview.png
```

**Commit**: YES
- Message: `feat(tracer): add DataPreviewPanel for dataset data display`
- Files: `src/components/tracer/DataPreviewPanel.jsx`
- Pre-commit: `npm run build`

---

### Task 7: Create TraceLineage Action Button

**What to do**:
- Create `src/components/functions/TraceLineage.jsx` - ActionButton for manual tracing
- Add to ActionButtons component
- Show only when on Dataset or Dataflow page (conditional render)
- On click, trigger lineage trace and open overlay
- Use existing button patterns and status callbacks

**Must NOT do**:
- Do not implement ID input modal (use detected object from context)
- Do not add to popup (sidepanel only)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Following ActionButton patterns

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
- **Blocks**: Task 9
- **Blocked By**: Task 0

**References**:

**Pattern References**:
- `src/components/functions/Copy.jsx` - Action button pattern
- `src/components/functions/GetPages.jsx` - Conditional action with loading state
- `src/components/ActionButtons.jsx` - Button integration location

**WHY Each Reference Matters**:
- Copy.jsx shows simplest button pattern with status callback
- GetPages.jsx shows conditional rendering based on object type

**Acceptance Criteria**:

**Playwright verification**:
```
1. Navigate to: Dataset page
2. Open sidepanel
3. Assert: "Trace Lineage" button visible in ActionButtons
4. Navigate to: Page (non-dataset)
5. Assert: "Trace Lineage" button NOT visible
6. Navigate back to: Dataset page
7. Click: "Trace Lineage"
8. Assert: Loading state shown
9. Assert: Tracer overlay opens
10. Screenshot: .sisyphus/evidence/task-7-trace-button.png
```

**Commit**: YES
- Message: `feat(tracer): add TraceLineage action button`
- Files: `src/components/functions/TraceLineage.jsx`, `src/components/functions/index.js`
- Pre-commit: `npm run build`

---

### Task 8: Integrate LineageView into Sidepanel

**What to do**:
- Import LineageView into `src/sidepanel/App.jsx`
- Add LineageView as a new section (after ActionButtons, before EmailSyncPanel)
- Conditionally render when context.domoObject.typeId is 'DATA_SOURCE' or 'DATAFLOW'
- Pass currentContext and status callback
- Ensure proper spacing with existing layout

**Must NOT do**:
- Do not restructure existing sidepanel layout significantly
- Do not add to popup

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`frontend-ui-ux`]
  - `frontend-ui-ux`: Simple integration following existing patterns

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
- **Blocks**: Task 9
- **Blocked By**: Task 4

**References**:

**Pattern References**:
- `src/sidepanel/App.jsx` - Main sidepanel layout
- Conditional rendering: See how EmailSyncPanel is conditionally shown

**WHY Each Reference Matters**:
- App.jsx shows exactly where to add the component and how to pass props

**Acceptance Criteria**:

**Playwright verification**:
```
1. Navigate to: Dataset page
2. Open sidepanel
3. Assert: ActionButtons section at top
4. Assert: LineageView section appears below ActionButtons
5. Assert: EmailSyncPanel below LineageView
6. Navigate to: Page (non-dataset)
7. Assert: LineageView section NOT visible
8. Screenshot: .sisyphus/evidence/task-8-sidepanel-integration.png
```

**Commit**: YES
- Message: `feat(tracer): integrate LineageView into sidepanel`
- Files: `src/sidepanel/App.jsx`
- Pre-commit: `npm run build`

---

### Task 9: Wire Up Full Flow and Test

**What to do**:
- Ensure all components work together:
  1. Sidepanel LineageView loads lineage for current dataset/dataflow
  2. "Trace Full Lineage" button opens TracerOverlay
  3. TracerOverlay shows PipelineGraph with nodes/edges
  4. Clicking dataflow node opens ETLInspector
  5. Clicking dataset node opens DataPreviewPanel
  6. Escape or close button dismisses overlay
- Fix any integration issues
- Test on multiple Domo instances
- Document any known limitations

**Must NOT do**:
- Do not add new features
- Do not refactor working code

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
- **Skills**: [`frontend-ui-ux`, `playwright`]
  - `frontend-ui-ux`: Full integration understanding
  - `playwright`: For comprehensive browser testing

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final, sequential)
- **Blocks**: None (final task)
- **Blocked By**: Tasks 3, 5, 6, 7, 8

**References**:

**All previous task outputs**:
- All components created in Tasks 1-8

**Acceptance Criteria**:

**Full flow verification**:
```
1. Build: npm run build
2. Load extension in Chrome
3. Navigate to: https://{instance}.domo.com/datasources/{uuid}/details/overview
4. Open sidepanel

# Sidepanel Flow
5. Assert: LineageView shows upstream/downstream
6. Click: An upstream dataset in LineageView
7. Assert: Tracer overlay opens focused on that dataset

# Overlay Flow
8. Assert: PipelineGraph renders with multiple nodes
9. Click: A dataflow node in graph
10. Assert: ETLInspector opens showing tiles
11. Click: A dataset node in graph
12. Assert: DataPreviewPanel opens showing data
13. Press: Escape
14. Assert: Overlay closes, returns to Domo page

# Action Button Flow
15. Click: "Trace Lineage" in ActionButtons
16. Assert: Overlay opens with current dataset as root
17. Assert: Depth selector works (change to 3)
18. Assert: Graph updates with more depth

# Screenshots
19. Screenshot: .sisyphus/evidence/task-9-full-flow-1.png (sidepanel)
20. Screenshot: .sisyphus/evidence/task-9-full-flow-2.png (overlay graph)
21. Screenshot: .sisyphus/evidence/task-9-full-flow-3.png (ETL inspector)
22. Screenshot: .sisyphus/evidence/task-9-full-flow-4.png (data preview)
```

**Commit**: YES
- Message: `feat(tracer): complete integration and testing`
- Files: Any fixes needed
- Pre-commit: `npm run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `feat(tracer): CSP proof-of-concept` | poc file | Build loads |
| 1 | `feat(tracer): add lineageService` | services/ | Build loads |
| 2 | `feat(tracer): add etlParser` | services/ | Build loads |
| 3, 3a | `feat(tracer): add TracerOverlay and PipelineGraph` | components/tracer/ | npm install, build |
| 4 | `feat(tracer): add LineageView` | components/ | Build loads |
| 5 | `feat(tracer): add ETLInspector` | components/tracer/ | Build loads |
| 6 | `feat(tracer): add DataPreviewPanel` | components/tracer/ | Build loads |
| 7 | `feat(tracer): add TraceLineage button` | components/functions/ | Build loads |
| 8 | `feat(tracer): integrate into sidepanel` | sidepanel/App.jsx | Build loads |
| 9 | `feat(tracer): complete integration` | various | Full test |

---

## Success Criteria

### Verification Commands
```bash
# Build succeeds
cd "D:\VS Code\domo-chrome-extension\majordomo-toolkit"
npm run build

# No errors in console when loaded
# Check chrome://extensions for errors
```

### Final Checklist
- [ ] All "Must Have" features implemented
- [ ] All "Must NOT Have" guardrails respected
- [ ] Extension builds without errors
- [ ] Extension loads in Chrome without errors
- [ ] Sidepanel shows lineage on dataset pages
- [ ] Overlay opens and shows graph
- [ ] ETL Inspector shows tile details
- [ ] Data Preview shows dataset rows
- [ ] Escape closes overlay
- [ ] Depth selector changes trace depth
