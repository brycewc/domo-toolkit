# Capitalizing Domo Object Type Names

**A plain object type name is a common noun, not a proper noun.** Capitalize it only where any word would be capitalized: at the start of a sentence, or in Title Case (button labels, view titles, headings). Inside a sentence it is lowercase. This covers the single-concept types: card, page, dataset, dataflow, workflow, report, alert, group, and so on.

**`DataSet` and `DataFlow` carry an internal capital whenever they are capitalized at all**, and the lowercase form drops it entirely. **`Dataset` and `Dataflow` are always wrong, in every position.**

| Position            | Correct                                                           |
| ------------------- | ----------------------------------------------------------------- |
| Title Case label    | `Create DataSet`, `Get DataFlow Inputs`, `Get Cards`              |
| Start of a sentence | `DataSets now support Delete.`, `Cards now support Delete.`       |
| Inside a sentence   | `Deleting a dataflow now lists the cards on its output datasets.` |

## Names built on a Domo brand keep Title Case

**A type name built on a Domo product or feature brand keeps its full Title Case everywhere**, mid-sentence included: Beast Mode, App Studio App, Code Engine Package, Jupyter Workspace, Workbench Job. Only the plain types above lowercase. So both halves show up in one sentence:

> Deleting a dataflow now lists the Beast Modes on its output datasets.

A descriptive multi-word type with no brand in it is plain, so it lowercases like the rest:

> Create the dataset for this approval template.

## Scope

This governs prose only: UI copy (button labels, view titles, tooltips, toasts, alerts), comments, JSDoc, commit messages, release notes, documentation, and chat replies.

```jsx
<IconDatabasePlus /> Create DataSet                            // Title Case label
'Creating the dataset for **${name}**...'                      // plain type, mid-sentence
'Deleting a dataflow also deletes its Beast Modes.'            // plain type lowercase, brand keeps caps
```

ESLint and Prettier cannot catch violations, so apply this by hand. When editing prose that already gets the casing wrong in the region being touched, fix it as part of the edit.

## Identifiers

**In code, `dataset` and `dataflow` never take the internal capital.** Write `deleteDatasets`, never `deleteDataSets`; `dataflows`, never `dataFlows`. Ordinary camelCase and PascalCase boundaries still apply, so `Dataset` and `Dataflow` are correct inside an identifier (`DataflowInspector`, `activityLogDatasetId`) even though both are always wrong in prose.

Existing symbols, API field names, and API values keep the spelling they already have (`DATA_SOURCE`, Domo's own `dataSet` GraphQL field). Never rename one to satisfy this rule.
