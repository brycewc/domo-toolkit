# DataList Style Alignment Plan

Align the row anatomy, header pattern, and virtualization of
`TransferOwnershipView.jsx` and `GetOwnedObjectsView.jsx` with the conventions
established in `DataList.jsx` (TanStack Virtual + `min-h-9` rows + parenthetical
counts + `border-t` separators).

## Settled tradeoffs

1. **Roll back the defensive `flattenItems` normalization** in
   `GetOwnedObjectsView.jsx`. With the upstream `getOwnedGroups` and
   `getOwnedProjectsAndTasks` bugs fixed, and TanStack Virtual replacing the
   React Aria collection builder (which is what threw "Could not determine key
   for item"), the defensive layer is no longer load-bearing. Restore the
   simpler shape so future readers aren't misled into thinking the upstream
   contracts can't be trusted.
2. **Refresh stays inline** in `GetOwnedObjectsView.jsx`'s header. Apply
   DataList's "1 action inline, 2+ collapse into `IconDots` Popover" heuristic.
   Today the non-close header actions are at most two (Transfer + Refresh) and
   only on USER-typed sources — borderline, but inline keeps a single click for
   the common case.
3. **Stop at Phases 0+1+2**. Do not rebuild `GetOwnedObjectsView.jsx` on top of
   `DataList`. The per-type `loading | loaded | error` state machine doesn't
   map cleanly onto `DataList`'s static `items` shape, and adapting it would
   either require synthetic `isVirtualParent` rows or muddy `DataList`'s prop
   surface for its other consumers.

## Phase 0 — shared style primitives

These classes/values become the shared vocabulary across all three views.
No new abstractions; just consistent literals.

| Primitive | Value | Sourced from |
|---|---|---|
| Row container | `flex min-h-9 w-full flex-row items-center justify-between gap-1 border-t border-border py-1` | `DataListItemImpl` flat-row branch |
| Disclosure root | `space-0 w-full border-t border-border` | `DataListItemImpl` |
| Disclosure heading | `my-1 flex min-h-9 w-full flex-row justify-between gap-1` | `DataListItemImpl` |
| Trigger empty-space spacer | `<span aria-hidden='true' className='flex-1' />` inside `Disclosure.Trigger` | `DataListItemImpl` regular-item branch |
| Count display | `<p className='text-sm text-muted'>({count})</p>` | `DataListItemImpl` |
| Header action group | `<ButtonGroup hideSeparator className='flex shrink-0'>` | `DataList` |
| Card root | `flex max-h-fit min-h-0 w-full flex-1 flex-col p-2` | `DataList` |
| Row geometry | `ROW_HEIGHT = 36`, `MAX_VISIBLE_CHILDREN_ROWS = 12`, `VIRTUAL_OVERSCAN = 5` | `DataList` |

No new file; these values get reused literally at each call site.

## Phase 1 — `GetOwnedObjectsView.jsx`

### 1.1 Replace HeroUI `ListBox` + `Virtualizer` with TanStack Virtual

Target: lines 74–150 (the `VirtualizedItemList` memo wrapper).

- Remove imports for `ListBox`, `ListLayout`, `Virtualizer` from
  `@heroui/react`. Add `useVirtualizer` from `@tanstack/react-virtual`.
- Inline a `VirtualizedChildItems` component modeled on `DataList.jsx`'s
  `VirtualizedItems({ bounded: true })`: a `parentRef` div capped at
  `MAX_VISIBLE_CHILDREN_ROWS * ROW_HEIGHT`, with absolutely-positioned rows
  using `transform: translateY(...)`.
- Each row uses `key={item.id ?? vRow.index}` and the row container class from
  Phase 0.
- The Copy button moves into the row content alongside the label/Link.
  Tooltip + AnimatedCheck feedback flicker stays the same; the `copiedId`
  state (currently held by `VirtualizedItemList`) lifts up one level if needed,
  or stays scoped per-list since each disclosure renders its own list.

### 1.2 Roll back defensive `flattenItems` normalization

Target: lines 506–541.

Restore to the simpler shape:

```js
function flattenItems(typeKey, owned) {
  if (typeKey === 'projectsAndTasks') {
    return [
      ...(owned?.projects || []).map((p) => ({
        ...p,
        id: `project-${p.id}`,
        originalId: p.id,
        subType: 'Project'
      })),
      ...(owned?.tasks || []).map((t) => ({
        ...t,
        id: `task-${t.id}`,
        originalId: t.id,
        subType: 'Task'
      }))
    ];
  }
  return Array.isArray(owned) ? owned : [];
}
```

The `id` namespacing for `projectsAndTasks` stays — projects and tasks share
an ID space so the collision risk is genuine, not paranoia. Drop the seen-set
deduplication, the `${typeKey}-fallback-${i}` synthetic keys, and the
`-dup-${i}` suffix logic.

The render path's `realId = item.originalId ?? item.id` stays — that's a real
contract for Copy-ID and stays correct without the defensive shell.

### 1.3 Adopt DataList's Disclosure heading layout

Target: lines 355–385 (the loaded-with-items branch of `renderTypeRow`).

Switch from the current "entire row is the Trigger" pattern to DataList's
split:

```jsx
<Disclosure className='space-0 w-full border-t border-border'>
  <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row justify-between gap-1'>
    <div className='flex w-full min-w-0 flex-1 items-center gap-2'>
      <IconCheck className='shrink-0 text-success' size={18} />
      <span className='truncate text-sm'>{type.label}</span>
      <Disclosure.Trigger
        aria-label='Toggle'
        className='flex flex-1 flex-row items-center gap-1'
        variant='tertiary'
      >
        <span aria-hidden='true' className='flex-1' />
        <p className='text-sm text-muted'>({result.count})</p>
        <Disclosure.Indicator>
          <IconChevronDown stroke={1.5} />
        </Disclosure.Indicator>
      </Disclosure.Trigger>
    </div>
  </Disclosure.Heading>
  <Disclosure.Content>
    <Disclosure.Body>
      <VirtualizedChildItems ... />
    </Disclosure.Body>
  </Disclosure.Content>
</Disclosure>
```

The status icon (`IconCheck` / `IconLoader2` / `IconX`) stays at the head of
the row — it's the visual signal of fetch state, distinct from DataList's
`ObjectTypeIcon` (which conveys object type). Keep it at `size={18}` so it
remains the primary glyph at this density.

### 1.4 Replace Chip count with parenthetical count

Targets:
- Loaded-with-items branch (currently `<Chip color='accent' size='sm' variant='soft'>{result.count}</Chip>`)
- Loaded-with-zero branch (currently `<Chip size='sm' variant='soft'>0</Chip>`)

Both → `<p className='text-sm text-muted'>({count})</p>`.

The zero-count branch can also drop its trailing greyed-out chevron — without
items there's nothing to expand, and a chevron implies expandability.

### 1.5 Loading/error/idle row containers

Targets: lines 311–333 (loading and error branches), 337–351 (zero branch).

Each gets the Phase 0 row container so all five visual states (loading,
loaded-zero, loaded-with-items collapsed, loaded-with-items expanded, error)
share a height and bottom rule. Currently they use `py-1.5` with no border.

### 1.6 Header actions

Target: lines 432–468.

No structural change — leave Transfer + Refresh + Close inline per settled
tradeoff #2. Just confirm `<ButtonGroup hideSeparator className='flex shrink-0'>`
matches DataList. The current `<ButtonGroup>` may need `hideSeparator` added.

## Phase 2 — `TransferOwnershipView.jsx`

### 2.1 Per-type rows

Target: lines 399–525, all five branches of `renderTypeRow`.

All branches adopt the Phase 0 row container:

```
flex min-h-9 w-full flex-row items-center justify-between gap-1 border-t border-border py-1
```

Currently each branch uses `flex items-center justify-between py-1` with no
border and no min-height.

The Checkbox + Label + status-icon + count cluster keeps its current internal
structure — just the outer container changes.

### 2.2 Failure-disclosure branch

Target: lines 472–509 (the `status === 'done' && result?.failed > 0` branch).

Adopt DataList's Disclosure shell:

```jsx
<Disclosure className='space-0 w-full border-t border-border'>
  <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row justify-between gap-1'>
    <div className='flex w-full min-w-0 flex-1 items-center gap-2'>
      <IconX className='shrink-0 text-danger' size={18} />
      <span className='truncate text-sm'>{type.label}</span>
      <Disclosure.Trigger
        aria-label='Toggle'
        className='flex flex-1 flex-row items-center gap-1 text-danger'
        variant='tertiary'
      >
        <span aria-hidden='true' className='flex-1' />
        <p className='text-sm'>{result.succeeded}/{count}</p>
        <Disclosure.Indicator>
          <IconChevronDown stroke={1.5} />
        </Disclosure.Indicator>
      </Disclosure.Trigger>
    </div>
  </Disclosure.Heading>
  <Disclosure.Content>
    <Disclosure.Body className='pt-0 pb-1 pl-7'>
      {/* existing error list */}
    </Disclosure.Body>
  </Disclosure.Content>
</Disclosure>
```

### 2.3 Header

Target: lines 540–553.

Drop the `<Separator />` inside `<Card.Header>` (DataList's `Card.Header`
doesn't render an inner Separator). Update `<Card.Title>` className to
`flex items-start justify-between gap-2`.

### 2.4 Body sections preserved

The TextField, UserComboBox, two Switches, Select-All Checkbox, and submit
Button stay structurally identical — they're form controls, not list items.
Spacing between them stays at `gap-2` to match the current rhythm.

## Out of scope

- Rebuilding `GetOwnedObjectsView` on top of `DataList` (settled tradeoff #3).
- Adding new per-item actions in `GetOwnedObjectsView`. The single-action
  inline path (Copy only) is preserved; if Share or Lineage is added later,
  it should adopt DataList's `IconDots` Popover at that point.
- Changes to the activity log, settings, or other views.
- Changes to `DataList.jsx` itself.

## Validation checklist

After implementation:

- [ ] Both views lint clean: `npx eslint --no-warn-ignored <files>`
- [ ] `GetOwnedObjectsView` opens without "Could not determine key for item"
      on a user with mixed object types (no longer relying on defensive
      `flattenItems`).
- [ ] Type rows in both views align visually at the same row height and
      bottom-rule cadence as `DataList`'s rows.
- [ ] Counts render as `(N)` muted text, not Chips.
- [ ] Disclosure expansion in `GetOwnedObjects` virtualizes via TanStack
      (verify by checking that 100+ items inside a single type don't mount
      all at once — devtools "Components" panel).
- [ ] Copy-ID still copies the raw API id (not the namespaced
      `project-<id>` / `task-<id>` form).
- [ ] Transfer-ownership handoff from `GetOwnedObjects` → `TransferOwnership`
      still works (seeded items retain `id` shape `transferOwnership.js`
      expects).
