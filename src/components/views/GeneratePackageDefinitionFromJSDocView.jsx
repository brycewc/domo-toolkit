import { Button, Card, Chip, Disclosure, DisclosureGroup, ScrollShadow, Separator, Spinner, Tooltip } from '@heroui/react';
import {
  appendModuleExports,
  computeStructuralDiff,
  findCurrentVersionInfo,
  findVersionForBaseline,
  parseSourceToManifest,
  preparePackagePayload,
  resolveTargetVersion
} from 'domo-codeengine-manifest';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DomoContext } from '@/models/DomoContext';
import {
  getCodeEngineEditorSource,
  getCodeEnginePackageVersion,
  getCodeEnginePackageVersions,
  postCodeEnginePackageVersion,
  setCodeEngineEditorSource
} from '@/services/codeEngine';
import { buildRefreshAction, buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheckCircle from '@icons/check-circle.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconCircle from '@icons/circle.svg?react';
import IconMagic from '@icons/magic.svg?react';
import IconPlusCircle from '@icons/plus-circle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { ViewHeader } from './ViewHeader';

export function GeneratePackageDefinitionFromJSDocView({
  instance = null,
  liveContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentContext, setCurrentContext] = useState(null);
  const [packageDef, setPackageDef] = useState(null);
  const [baseVersionDef, setBaseVersionDef] = useState(null);
  const [sourceRead, setSourceRead] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const bailedRef = useRef(false);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'generatePackageDefinitionFromJSDoc') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context?.domoObject) {
        onStatusUpdate?.('Error', 'No package context available', 'danger');
        onBackToDefault?.();
        return;
      }

      const packageId = context.domoObject.parentId || context.domoObject.id;
      const tabId = context.tabId;

      if (!packageId) {
        onStatusUpdate?.('Error', 'Could not determine package ID', 'danger');
        onBackToDefault?.();
        return;
      }

      setCurrentContext(context);

      // Stage 1: package envelope (versions + configuration) and live editor source
      // in parallel. The envelope tells us which versions exist so we can pick a
      // baseline; the editor source is what we'll diff *from*.
      const [envelopeResult, srcResult] = await Promise.allSettled([
        getCodeEnginePackageVersions(packageId, tabId),
        getCodeEngineEditorSource({ packageId, tabId })
      ]);

      if (!mountedRef.current) return;

      if (envelopeResult.status === 'rejected') {
        setError(envelopeResult.reason?.message || 'Failed to load package versions');
        return;
      }
      if (srcResult.status === 'rejected') {
        setError(srcResult.reason?.message || 'Failed to read package source');
        return;
      }

      const envelope = envelopeResult.value;

      // Stage 2: fetch the specific baseline version's manifest. We can only pick
      // the baseline once we know what versions exist (envelope), which is why
      // this is sequential. For brand-new packages with no versions, baseline is
      // null and we skip; the diff will show every function as "added".
      const targetForLoad = resolveTargetVersion({ versions: envelope?.versions });
      const baseline = findVersionForBaseline(envelope?.versions, targetForLoad.version);
      let versionDef = null;
      if (baseline?.version) {
        try {
          versionDef = await getCodeEnginePackageVersion(packageId, baseline.version, tabId);
        } catch (err) {
          console.warn('[GeneratePackageDefinitionFromJSDocView] Baseline version fetch failed:', err);
        }
      }

      if (!mountedRef.current) return;

      setPackageDef(envelope);
      setBaseVersionDef(versionDef);
      setSourceRead(srcResult.value);
      setError(null);
    } catch (err) {
      console.error('[GeneratePackageDefinitionFromJSDocView] Error loading data:', err);
      if (mountedRef.current) setError(err.message || 'Failed to load data');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const headerActions = [
    buildReloadAction({
      currentContext: liveContext,
      objectId: currentContext?.domoObject?.id,
      objectType: currentContext?.domoObject?.typeId,
      onStatusUpdate,
      viewType: 'generatePackageDefinitionFromJSDoc'
    }),
    buildRefreshAction({ isRefreshing, onRefresh: handleRefresh })
  ];

  const currentVersionId =
    currentContext?.domoObject?.typeId === 'CODEENGINE_PACKAGE_VERSION' ? currentContext?.domoObject?.id : null;

  const currentVersionInfo = useMemo(
    () => (packageDef ? findCurrentVersionInfo(packageDef.versions, currentVersionId) : null),
    [packageDef, currentVersionId]
  );

  const target = useMemo(
    () => (packageDef ? resolveTargetVersion({ versions: packageDef.versions }) : { mode: 'create', version: '1.0.0' }),
    [packageDef]
  );

  // baseVersionDef is fetched in loadData via the version-specific endpoint, so
  // it carries the actual function manifest and code for the baseline version.
  // We expose it under the `baseVersion` name preserved from the prior shape so
  // downstream consumers (preparePackagePayload, the parser) read the same field.
  const baseVersion = baseVersionDef;

  const parsed = useMemo(() => {
    if (!sourceRead || !packageDef) return null;
    try {
      return parseSourceToManifest(sourceRead.code, baseVersion?.functions || [], sourceRead.editorStartIndices);
    } catch (err) {
      console.error('[GeneratePackageDefinitionFromJSDocView] Parse error:', err);
      return { error: err.message || 'Parser threw an error' };
    }
  }, [sourceRead, packageDef, baseVersion]);

  const errorWarnings = parsed?.warnings?.filter((w) => w.severity === 'error') || [];
  // The live editor tree gives us both the module.exports function list and each
  // function's editorStartIndex. It's null when the tree couldn't be read and
  // absent on the API fallback. We refuse to sync without it: a version saved
  // without the regenerated module.exports block makes Workflow runs fail with
  // "function not found in package".
  const editorDataUnavailable = !!sourceRead && (!sourceRead.functionNames || !sourceRead.editorStartIndices);
  const cannotSync = !parsed || parsed.error || errorWarnings.length > 0 || editorDataUnavailable;
  const hasJSDocRewrites = (parsed?.jsdocRewrites?.length || 0) > 0;
  const newFunctionCount = parsed?.decisions?.filter((d) => d.action === 'added').length || 0;
  const updatedFunctionCount = parsed?.decisions?.filter((d) => d.action === 'updated').length || 0;
  const unchangedFunctionCount = parsed?.decisions?.filter((d) => d.action === 'unchanged').length || 0;

  // The header subtext carries the same at-a-glance counts the in-panel summary
  // row used to, plus the target version, so the panel body can go straight to
  // the change sections.
  const targetWord = target.mode === 'overwrite' ? 'overwriting' : 'new';
  const headerSummary =
    parsed && !parsed.error
      ? `+${newFunctionCount} added, ${updatedFunctionCount} updated, ${unchangedFunctionCount} unchanged · ${targetWord} **v${target.version}**`
      : null;

  // If parsing completes and there's literally nothing to sync (no added,
  // updated, or JSDoc-rewrite changes) we bail straight back to the default
  // view with a warning toast. Opening a full diff card just to say "27
  // unchanged" wastes the user's click. Skip when errors are present so the
  // user can still see what's wrong.
  useEffect(() => {
    if (bailedRef.current) return;
    if (isLoading || isRefreshing || isSubmitting) return;
    if (!parsed || parsed.error) return;
    if (cannotSync) return;
    const nothingToDo = newFunctionCount === 0 && updatedFunctionCount === 0 && !hasJSDocRewrites;
    if (!nothingToDo) return;
    bailedRef.current = true;
    onStatusUpdate?.(
      'Already up to date',
      packageDef?.name
        ? `Package **${packageDef.name}** matches the JSDoc, no sync needed`
        : 'Package matches the JSDoc, no sync needed',
      'warning',
      3000
    );
    onBackToDefault?.();
  }, [
    cannotSync,
    hasJSDocRewrites,
    isLoading,
    isRefreshing,
    isSubmitting,
    newFunctionCount,
    onBackToDefault,
    onStatusUpdate,
    packageDef,
    parsed,
    updatedFunctionCount
  ]);

  const handleSync = async () => {
    if (!parsed || cannotSync) return;
    const packageId = currentContext.domoObject.parentId || currentContext.domoObject.id;
    const tabId = currentContext.tabId;

    setIsSubmitting(true);

    const definition = preparePackagePayload({
      baseVersion,
      // Domo's IDE regenerates the trailing module.exports block on save; the
      // editor source we read has it stripped, so we reattach it before POSTing.
      // Without it the runtime can't resolve any function for a Workflow.
      code: appendModuleExports(parsed.reconciledSource, sourceRead.functionNames),
      existingDefinition: packageDef,
      manifestFunctions: parsed.mergedFunctions,
      newVersion: target.version,
      packageId
    });

    const promise = (async () => {
      if (hasJSDocRewrites) {
        const writeResult = await setCodeEngineEditorSource({
          code: parsed.reconciledSource,
          tabId
        });
        if (!writeResult.ok) {
          console.warn('[GeneratePackageDefinitionFromJSDocView] Editor write failed:', writeResult.reason);
        }
      }
      await postCodeEnginePackageVersion(definition, tabId);
      chrome.tabs.reload(tabId);
      return target;
    })();

    showPromiseStatus(promise, {
      error: (err) => err?.message || 'Sync failed',
      loading: target.mode === 'overwrite' ? `Saving to **${target.version}**…` : `Creating **${target.version}**…`,
      success: (t) =>
        t.mode === 'overwrite'
          ? `Saved to **${t.version}** (unreleased)`
          : `Created **${t.version}** (unreleased, release in Domo when ready)`
    });

    promise
      .then(() => {
        onBackToDefault?.();
      })
      .catch((err) => {
        console.error('[GeneratePackageDefinitionFromJSDocView] Sync failed:', err);
      })
      .finally(() => {
        if (mountedRef.current) setIsSubmitting(false);
      });
  };

  // Synchronous render-path version of the bail predicate. The effect above
  // fires *after* render commits, which is too late to prevent a one-frame
  // flash of the diff view between "load finished" and "navigate away." By
  // checking the same condition here and short-circuiting to the loading card,
  // the diff never paints, so the user sees spinner, then toast, then default view.
  const willBail =
    !isLoading &&
    !isRefreshing &&
    !isSubmitting &&
    parsed != null &&
    !parsed.error &&
    !cannotSync &&
    newFunctionCount === 0 &&
    updatedFunctionCount === 0 &&
    !hasJSDocRewrites;
  useViewReady(!isLoading && !willBail);

  if (isLoading || willBail) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Reading IDE source and package definition…</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='flex h-full w-full flex-col p-2'>
        <ViewHeader
          beta
          actions={headerActions}
          feature='Generate Definition from JSDoc'
          featureIcon={<IconMagic />}
          onClose={onBackToDefault}
        />
        <Separator />
        <Card.Content className='py-2'>
          <Alert className='w-full bg-danger-soft' status='danger'>
            <AlertStatusIcon />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        beta
        actions={headerActions}
        feature='Generate Definition from JSDoc'
        featureIcon={<IconMagic />}
        subject={packageDef?.name || null}
        subjectTypeId={packageDef?.name ? 'CODEENGINE_PACKAGE' : null}
        subtext={headerSummary}
        onClose={onBackToDefault}
      />
      <Separator />
      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
        <Card.Content className='flex flex-col gap-2 py-2'>
          <div className='flex flex-wrap items-center gap-1'>
            <SourcePill currentVersionInfo={currentVersionInfo} sourceRead={sourceRead} />
            <TargetPill target={target} />
          </div>

          {editorDataUnavailable && (
            <Alert className='w-full bg-danger-soft' status='danger'>
              <AlertStatusIcon />
              <Alert.Content>
                <Alert.Description>
                  Could not read the function list from the live editor. Open the Code Engine editor for this package and try
                  again. Syncing without it would omit the module.exports block and break Workflow runs.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {parsed?.error && (
            <Alert className='w-full bg-danger-soft' status='danger'>
              <AlertStatusIcon />
              <Alert.Content>
                <Alert.Description>Parser error: {parsed.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {parsed && !parsed.error && (
            <>
              {parsed.warnings.length > 0 && <WarningsSection warnings={parsed.warnings} />}
              <ManifestDecisionsSection decisions={parsed.decisions} rewrites={parsed.jsdocRewrites} />
            </>
          )}
        </Card.Content>
      </ScrollShadow>

      <div className='shrink-0 border-t border-border px-3 py-2'>
        <Button
          fullWidth
          isDisabled={cannotSync || isSubmitting}
          isPending={isSubmitting}
          size='sm'
          variant='primary'
          onPress={handleSync}
        >
          {isSubmitting ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconSync /> {target.mode === 'overwrite' ? `Save to ${target.version}` : `Save as new ${target.version}`}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

const FIELD_LABELS = {
  description: 'Description',
  displayName: 'Display Name',
  hasReturn: 'Return Value',
  inputs: 'Inputs',
  isPrivate: 'Private',
  output: 'Output'
};

function DecisionPill({ action }) {
  if (action === 'added') {
    return (
      <Chip color='success' size='sm' variant='primary'>
        <IconPlusCircle size={12} /> Added
      </Chip>
    );
  }
  if (action === 'updated') {
    return (
      <Chip color='accent' size='sm' variant='primary'>
        <IconSync size={12} /> Updated
      </Chip>
    );
  }
  if (action === 'unchanged') {
    return (
      <Chip size='sm' variant='primary'>
        <IconCheckCircle size={12} /> Unchanged
      </Chip>
    );
  }
  return (
    <Chip size='sm' variant='primary'>
      <IconCircle size={12} /> Kept
    </Chip>
  );
}

function DecisionRow({ decision, rewrites }) {
  // `hasReturn` just tracks whether an `output` exists, so when both changed the
  // output object appearing (or disappearing) already tells the story; drop the
  // redundant Return Value boolean row.
  const diffFields = (decision.diffFields || []).filter(
    (field) => !(field === 'hasReturn' && decision.diffFields.includes('output'))
  );
  const hasFieldDiff = decision.action === 'updated' && diffFields.length > 0;
  const hasRewrites = rewrites?.length > 0;
  const expandable = hasFieldDiff || hasRewrites;

  const trigger = (
    <>
      <span className='flex min-w-0 flex-1 items-center gap-2' title={decision.name}>
        <span className='truncate text-sm font-medium'>{decision.name}()</span>
      </span>
      <span className='flex shrink-0 items-center gap-1'>
        {hasRewrites && (
          <Chip color='accent' size='sm' variant='primary'>
            JSDoc
          </Chip>
        )}
        <DecisionPill action={decision.action} />
      </span>
    </>
  );

  if (!expandable) {
    return (
      <div className='flex w-full items-center justify-between gap-2 overflow-hidden rounded-3xl bg-surface-secondary p-2'>
        {trigger}
        {/* Non-expandable rows keep a chevron-sized spacer so their content aligns
            with expandable rows, but the chevron itself stays invisible. Transparent
            (not a background-matching color) so it hides regardless of the tile bg. */}
        <IconChevronDown className='size-4 shrink-0 text-transparent' />
      </div>
    );
  }

  return (
    <Disclosure className='overflow-hidden rounded-3xl bg-surface-secondary' id={decision.name}>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
          {trigger}
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='px-4'>
          <Separator variant='secondary' />
        </div>
        <div className='flex flex-col gap-2 p-2 text-xs'>
          {hasFieldDiff &&
            diffFields.map((field) => (
              <FieldDiff
                derivedValue={decision.derived?.[field]}
                existingValue={decision.existing?.[field]}
                field={field}
                key={field}
              />
            ))}
          {hasRewrites && <JSDocRewriteList rewrites={rewrites} />}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function DetailSection({ children, label }) {
  return (
    <div className='flex flex-col gap-1'>
      <div className='text-xs font-semibold'>{label}</div>
      {children}
    </div>
  );
}

function DiffRow({ diff }) {
  const pathStr = formatPath(diff.path);

  // Scalars (booleans, numbers, null, short single-line strings) collapse onto one
  // row as `path  old → new`, using the panel's horizontal space instead of stacking
  // two lines. Long or structured values fall through to the stacked block below.
  const inline =
    diff.kind === 'changed'
      ? isInlineDiffValue(diff.before) && isInlineDiffValue(diff.after)
      : isInlineDiffValue(diff.value);

  if (inline) {
    const suffix = diff.kind === 'added' ? ' (added)' : diff.kind === 'removed' ? ' (removed)' : '';
    return (
      <div className='flex items-baseline gap-3 rounded-field border border-field bg-field px-3 py-1 text-xs text-field-foreground shadow-field'>
        {pathStr && (
          <span className='min-w-0 truncate font-mono text-muted'>
            {pathStr}
            {suffix}
          </span>
        )}
        <span className='ml-auto flex shrink-0 items-baseline gap-1.5 font-mono'>
          {diff.kind !== 'added' && (
            <span className='text-danger'>{formatFieldValue(diff.kind === 'changed' ? diff.before : diff.value)}</span>
          )}
          {diff.kind === 'changed' && <span className='text-muted'>→</span>}
          {diff.kind !== 'removed' && (
            <span className='text-success'>{formatFieldValue(diff.kind === 'changed' ? diff.after : diff.value)}</span>
          )}
        </span>
      </div>
    );
  }

  // A whole nested node (e.g. an output child) being added or removed only needs to
  // announce that it happened; its inner properties are noise. The path already names
  // it. Collapse to one row, but only for a named nested node (non-empty path) so the
  // top-level field itself (empty path) still shows its full shape.
  if (
    (diff.kind === 'added' || diff.kind === 'removed') &&
    pathStr &&
    diff.value !== null &&
    typeof diff.value === 'object'
  ) {
    const removed = diff.kind === 'removed';
    return (
      <div className='flex items-baseline gap-3 rounded-field border border-field bg-field px-3 py-1 text-xs text-field-foreground shadow-field'>
        <span className='min-w-0 truncate font-mono text-muted'>{pathStr}</span>
        <span className={`ml-auto shrink-0 font-mono ${removed ? 'text-danger' : 'text-success'}`}>
          {removed ? 'removed' : 'added'}
        </span>
      </div>
    );
  }

  if (diff.kind === 'added') {
    return (
      <div className='flex flex-col gap-0.5 rounded-field border border-field bg-field px-3 py-2 text-xs text-field-foreground shadow-field'>
        {pathStr && <span className='font-mono text-muted'>{pathStr} (added)</span>}
        <pre className='overflow-x-auto rounded bg-success-soft px-1 py-0.5 whitespace-pre-wrap text-success'>
          + {formatFieldValue(diff.value)}
        </pre>
      </div>
    );
  }
  if (diff.kind === 'removed') {
    return (
      <div className='flex flex-col gap-0.5 rounded-field border border-field bg-field px-3 py-2 text-xs text-field-foreground shadow-field'>
        {pathStr && <span className='font-mono text-muted'>{pathStr} (removed)</span>}
        <pre className='overflow-x-auto rounded bg-danger-soft px-1 py-0.5 whitespace-pre-wrap text-danger'>
          − {formatFieldValue(diff.value)}
        </pre>
      </div>
    );
  }
  return (
    <div className='flex flex-col gap-0.5 rounded-field border border-field bg-field px-3 py-2 text-xs text-field-foreground shadow-field'>
      {pathStr && <span className='font-mono text-muted'>{pathStr}</span>}
      <pre className='overflow-x-auto rounded bg-danger-soft px-1 py-0.5 whitespace-pre-wrap text-danger'>
        − {formatFieldValue(diff.before)}
      </pre>
      <pre className='overflow-x-auto rounded bg-success-soft px-1 py-0.5 whitespace-pre-wrap text-success'>
        + {formatFieldValue(diff.after)}
      </pre>
    </div>
  );
}

function FieldDiff({ derivedValue, existingValue, field }) {
  const diffs = computeStructuralDiff(existingValue, derivedValue);
  return (
    <DetailSection label={FIELD_LABELS[field] || field}>
      {diffs.length === 0 ? (
        <span className='text-xs text-muted italic'>(no detectable difference)</span>
      ) : (
        <div className='flex flex-col gap-1'>
          {diffs.map((d, idx) => (
            <DiffRow diff={d} key={`${formatPath(d.path)}-${idx}`} />
          ))}
        </div>
      )}
    </DetailSection>
  );
}

function formatFieldValue(value) {
  if (value == null) return <span className='italic'>null</span>;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatPath(segments) {
  if (!segments || segments.length === 0) return '';
  return segments
    .map((s, i) => {
      const str = String(s);
      if (i === 0) return str;
      return /^\d+$/.test(str) ? `[${str}]` : `.${str}`;
    })
    .join('');
}

function isInlineDiffValue(value) {
  if (value == null) return true;
  const type = typeof value;
  if (type === 'boolean' || type === 'number') return true;
  if (type === 'string') return value.length <= 40 && !value.includes('\n');
  return false;
}

function JSDocRewriteList({ rewrites }) {
  return (
    <DetailSection label='JSDoc @param defaults'>
      <div className='flex flex-col gap-2'>
        {rewrites.map((r, idx) => (
          <div className='flex flex-col gap-0.5 rounded bg-surface p-2' key={`${r.paramName}-${idx}`}>
            <span className='font-mono text-[10px] text-muted'>
              line {r.line} · {r.paramName}
            </span>
            <pre className='overflow-x-auto rounded bg-danger-soft px-1 py-0.5 text-[11px] whitespace-pre-wrap text-danger'>
              − {r.oldText}
            </pre>
            <pre className='overflow-x-auto rounded bg-success-soft px-1 py-0.5 text-[11px] whitespace-pre-wrap text-success'>
              + {r.newText}
            </pre>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function ManifestDecisionsSection({ decisions, rewrites }) {
  if (!decisions || decisions.length === 0) return null;
  const rewritesByFunction = new Map();
  for (const r of rewrites || []) {
    const key = r.functionName || '(unknown)';
    if (!rewritesByFunction.has(key)) rewritesByFunction.set(key, []);
    rewritesByFunction.get(key).push(r);
  }
  // Unchanged functions are the bulk of a typical diff and carry nothing to
  // review, so they're rolled into a single collapsed count at the top instead
  // of one row each. Everything else (added, updated, kept) stays as its own row.
  const unchanged = decisions.filter((d) => d.action === 'unchanged');
  const changed = decisions.filter((d) => d.action !== 'unchanged');
  return (
    <DisclosureGroup className='flex w-full flex-col gap-1.5'>
      {unchanged.length > 0 && <UnchangedFunctionsSection functions={unchanged} />}
      {changed.map((d) => (
        <DecisionRow decision={d} key={d.name} rewrites={rewritesByFunction.get(d.name)} />
      ))}
    </DisclosureGroup>
  );
}

function SourcePill({ currentVersionInfo, sourceRead }) {
  if (!sourceRead) return null;
  if (sourceRead.source === 'editor') {
    return (
      <Chip color='success' size='sm' variant='soft'>
        Live editor source
      </Chip>
    );
  }
  const fallbackVersion = sourceRead.version || currentVersionInfo?.version || null;
  return (
    <Tooltip>
      <Chip color='warning' size='sm' variant='soft'>
        Saved version{fallbackVersion ? ` v${fallbackVersion}` : ''}
      </Chip>
      <Tooltip.Content className='text-wrap'>
        Couldn&apos;t reach the IDE editor, using the latest saved version instead.
      </Tooltip.Content>
    </Tooltip>
  );
}

function TargetPill({ target }) {
  if (!target) return null;
  const tip =
    target.mode === 'overwrite'
      ? `v${target.version} is the current draft, saving directly to it (no release).`
      : `No unreleased draft found, creating new v${target.version} (no release).`;
  return (
    <Tooltip>
      <Chip color={target.mode === 'overwrite' ? 'success' : 'accent'} size='sm' variant='soft'>
        {target.mode === 'overwrite' ? `Save to v${target.version}` : `New v${target.version}`}
      </Chip>
      <Tooltip.Content className='text-wrap'>{tip}</Tooltip.Content>
    </Tooltip>
  );
}

function UnchangedFunctionsSection({ functions }) {
  return (
    <Disclosure className='overflow-hidden rounded-3xl bg-surface-secondary' id='__unchanged__'>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
          <span className='flex min-w-0 flex-1 items-center gap-2'>
            <span className='truncate text-sm font-medium'>
              {functions.length} unchanged {functions.length === 1 ? 'function' : 'functions'}
            </span>
          </span>
          <span className='flex shrink-0 items-center gap-1'>
            <Chip className='text-white' color='success' size='sm' variant='primary'>
              <IconCheckCircle size={12} /> Unchanged
            </Chip>
          </span>
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='px-4'>
          <Separator variant='secondary' />
        </div>
        <div className='p-2'>
          <div className='flex flex-col gap-1 rounded bg-surface p-2 font-mono text-xs'>
            {functions.map((f) => (
              <span className='truncate' key={f.name} title={f.name}>
                {f.name}
              </span>
            ))}
          </div>
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function WarningsSection({ warnings }) {
  if (!warnings || warnings.length === 0) {
    return (
      <Alert className='w-full bg-surface-secondary' status='success'>
        <AlertStatusIcon />
        <Alert.Content>
          <Alert.Description>No warnings</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <Disclosure className='w-full overflow-hidden rounded-3xl bg-surface-secondary'>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
          <span className='truncate text-sm font-medium'>Warnings ({warnings.length})</span>
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='px-4'>
          <Separator variant='secondary' />
        </div>
        <div className='flex flex-col gap-2 p-2'>
          {warnings.map((w, idx) => (
            <Alert
              className={w.severity === 'error' ? 'w-full bg-danger-soft' : 'w-full'}
              key={idx}
              status={w.severity === 'error' ? 'danger' : 'warning'}
            >
              <Alert.Content>
                <Alert.Title className='flex items-center gap-1'>
                  <AlertStatusIcon />
                  {w.functionName ? (
                    <span className='font-mono'>{w.functionName}</span>
                  ) : w.severity === 'error' ? (
                    'Error'
                  ) : (
                    'Warning'
                  )}
                </Alert.Title>
                <Alert.Description>{w.message}</Alert.Description>
              </Alert.Content>
            </Alert>
          ))}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}
