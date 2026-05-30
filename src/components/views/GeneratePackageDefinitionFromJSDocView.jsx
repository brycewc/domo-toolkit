import { Button, Card, Chip, Disclosure, DisclosureGroup, ScrollShadow, Separator, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DomoContext } from '@/models/DomoContext';
import {
  getCodeEngineEditorSource,
  getCodeEnginePackageVersion,
  getCodeEnginePackageVersions,
  postCodeEnginePackageVersion,
  setCodeEngineEditorSource
} from '@/services/codeEngine';
import {
  computeStructuralDiff,
  findCurrentVersionInfo,
  findVersionForBaseline,
  preparePackagePayload,
  resolveTargetVersion
} from '@/utils/jsdocToPackage/mergeManifest';
import { appendModuleExports } from '@/utils/jsdocToPackage/moduleExports';
import { parseSourceToManifest } from '@/utils/jsdocToPackage/parseSourceToManifest';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheckCircle from '@icons/check-circle.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconCircle from '@icons/circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconPlusCircle from '@icons/plus-circle.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

export function GeneratePackageDefinitionFromJSDocView({ onBackToDefault = null, onStatusUpdate = null }) {
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
      const data = await getSidepanelData();
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
          isRefreshing={isRefreshing}
          subtitle={null}
          title='Generate Definition from JSDoc'
          onBackToDefault={onBackToDefault}
          onRefresh={handleRefresh}
        />
        <Separator />
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <IconExclamationTriangle className='text-danger' />
          <p className='text-sm text-danger'>{error}</p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        isRefreshing={isRefreshing}
        subtitle={packageDef?.name ? `Package: ${packageDef.name}` : null}
        title='Generate Definition from JSDoc'
        onBackToDefault={onBackToDefault}
        onRefresh={handleRefresh}
      />
      <Separator />
      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
        <Card.Content className='flex flex-col gap-2 py-2'>
          <div className='flex flex-wrap items-center gap-1'>
            <SourcePill currentVersionInfo={currentVersionInfo} sourceRead={sourceRead} />
            <TargetPill target={target} />
          </div>

          {editorDataUnavailable && (
            <div className='flex items-center gap-2 rounded-md bg-danger-soft p-2 text-sm text-danger'>
              <IconExclamationTriangle />
              <span>
                Could not read the function list from the live editor. Open the Code Engine editor for this package and try
                again. Syncing without it would omit the module.exports block and break Workflow runs.
              </span>
            </div>
          )}

          {parsed?.error && (
            <div className='flex items-center gap-2 rounded-md bg-danger-soft p-2 text-sm text-danger'>
              <IconExclamationTriangle />
              <span>Parser error: {parsed.error}</span>
            </div>
          )}

          {parsed && !parsed.error && (
            <>
              <SummaryRow
                jsdocRewriteCount={parsed.jsdocRewrites.length}
                newFunctionCount={newFunctionCount}
                target={target}
                unchangedFunctionCount={unchangedFunctionCount}
                updatedFunctionCount={updatedFunctionCount}
                warningCount={parsed.warnings.length}
              />

              <JSDocRewritesSection rewrites={parsed.jsdocRewrites} />
              <ManifestDecisionsSection decisions={parsed.decisions} />
              <WarningsSection warnings={parsed.warnings} />
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

function DecisionPill({ action }) {
  if (action === 'added') {
    return (
      <Chip color='success' size='sm' variant='soft'>
        <IconPlusCircle size={12} /> Added
      </Chip>
    );
  }
  if (action === 'updated') {
    return (
      <Chip color='accent' size='sm' variant='soft'>
        <IconSync size={12} /> Updated
      </Chip>
    );
  }
  if (action === 'unchanged') {
    return (
      <Chip size='sm' variant='soft'>
        <IconCheckCircle size={12} /> Unchanged
      </Chip>
    );
  }
  return (
    <Chip size='sm' variant='soft'>
      <IconCircle size={12} /> Kept
    </Chip>
  );
}

function DecisionRow({ decision }) {
  const hasDiff = decision.action === 'updated' && decision.diffFields?.length > 0;
  return (
    <Disclosure className='w-full' id={decision.name} isDisabled={!hasDiff}>
      <Disclosure.Heading>
        <Button fullWidth className='items-center justify-between gap-1 px-1 py-0.5 text-xs' slot='trigger' variant='ghost'>
          <span className='flex min-w-0 items-center gap-1'>
            <Disclosure.Indicator>
              <IconChevronDown size={12} />
            </Disclosure.Indicator>
            <span className='font-mono'>{decision.name}</span>
            {hasDiff && <span className='truncate text-muted'>({decision.diffFields.join(', ')})</span>}
          </span>
          <DecisionPill action={decision.action} />
        </Button>
      </Disclosure.Heading>
      {hasDiff && (
        <Disclosure.Content>
          <div className='flex flex-col gap-1 border-l border-border pt-1 pl-2 text-xs'>
            {decision.diffFields.map((field) => (
              <FieldDiff
                derivedValue={decision.derived?.[field]}
                existingValue={decision.existing?.[field]}
                field={field}
                key={field}
              />
            ))}
          </div>
        </Disclosure.Content>
      )}
    </Disclosure>
  );
}

function DiffRow({ diff }) {
  const pathStr = formatPath(diff.path);
  if (diff.kind === 'added') {
    return (
      <div className='flex flex-col gap-0.5'>
        {pathStr && <span className='font-mono text-[10px] text-muted'>{pathStr} (added)</span>}
        <pre className='overflow-x-auto rounded bg-success-soft px-1 py-0.5 text-[11px] whitespace-pre-wrap text-success'>
          + {formatFieldValue(diff.value)}
        </pre>
      </div>
    );
  }
  if (diff.kind === 'removed') {
    return (
      <div className='flex flex-col gap-0.5'>
        {pathStr && <span className='font-mono text-[10px] text-muted'>{pathStr} (removed)</span>}
        <pre className='overflow-x-auto rounded bg-danger-soft px-1 py-0.5 text-[11px] whitespace-pre-wrap text-danger'>
          − {formatFieldValue(diff.value)}
        </pre>
      </div>
    );
  }
  return (
    <div className='flex flex-col gap-0.5'>
      {pathStr && <span className='font-mono text-[10px] text-muted'>{pathStr}</span>}
      <pre className='overflow-x-auto rounded bg-danger-soft px-1 py-0.5 text-[11px] whitespace-pre-wrap text-danger'>
        − {formatFieldValue(diff.before)}
      </pre>
      <pre className='overflow-x-auto rounded bg-success-soft px-1 py-0.5 text-[11px] whitespace-pre-wrap text-success'>
        + {formatFieldValue(diff.after)}
      </pre>
    </div>
  );
}

function FieldDiff({ derivedValue, existingValue, field }) {
  const diffs = computeStructuralDiff(existingValue, derivedValue);
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-[10px] text-muted'>{field}</span>
      {diffs.length === 0 ? (
        <span className='text-[10px] text-muted italic'>(no detectable difference)</span>
      ) : (
        <div className='flex flex-col gap-2'>
          {diffs.map((d, idx) => (
            <DiffRow diff={d} key={`${formatPath(d.path)}-${idx}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatFieldValue(value) {
  if (value == null) return '(none)';
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

function JSDocRewritesSection({ rewrites }) {
  if (!rewrites || rewrites.length === 0) return null;
  const grouped = new Map();
  for (const r of rewrites) {
    const key = r.functionName || '(unknown)';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  }
  return (
    <Disclosure className='w-full'>
      <Disclosure.Heading>
        <Button fullWidth className='justify-between' size='sm' slot='trigger' variant='ghost'>
          JSDoc updates ({rewrites.length})
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='flex flex-col gap-3 pt-1 pl-1'>
          {Array.from(grouped.entries()).map(([fnName, items]) => (
            <div className='flex flex-col gap-1' key={fnName}>
              <div className='flex items-baseline gap-2 text-xs text-muted'>
                <span className='font-mono font-semibold text-foreground'>{fnName}()</span>
                <span>
                  {items.length} param{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className='flex flex-col gap-2 border-l border-border pl-2 font-mono text-xs'>
                {items.map((r, idx) => (
                  <div className='flex flex-col gap-0.5' key={`${r.paramName}-${idx}`}>
                    <span className='text-[10px] text-muted'>
                      line {r.line} · param {r.paramName}
                    </span>
                    <div className='truncate text-danger'>- {r.oldText}</div>
                    <div className='truncate text-success'>+ {r.newText}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function ManifestDecisionsSection({ decisions }) {
  if (!decisions || decisions.length === 0) return null;
  return (
    <Disclosure defaultExpanded className='w-full'>
      <Disclosure.Heading>
        <Button fullWidth className='justify-between' size='sm' slot='trigger' variant='ghost'>
          Manifest changes ({decisions.length})
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <DisclosureGroup className='flex flex-col gap-1 pt-1 pl-1'>
          {decisions.map((d) => (
            <DecisionRow decision={d} key={d.name} />
          ))}
        </DisclosureGroup>
      </Disclosure.Content>
    </Disclosure>
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
    <Tooltip closeDelay={0} delay={800}>
      <Chip color='warning' size='sm' variant='soft'>
        Saved version{fallbackVersion ? ` v${fallbackVersion}` : ''}
      </Chip>
      <Tooltip.Content className='text-wrap'>
        Couldn&apos;t reach the IDE editor, using the latest saved version instead.
      </Tooltip.Content>
    </Tooltip>
  );
}

function SummaryRow({
  jsdocRewriteCount,
  newFunctionCount,
  target,
  unchangedFunctionCount,
  updatedFunctionCount,
  warningCount
}) {
  return (
    <div className='flex flex-wrap items-center gap-1 text-xs text-muted'>
      <span>
        +{newFunctionCount} added, {updatedFunctionCount} updated, {unchangedFunctionCount} unchanged
      </span>
      {jsdocRewriteCount > 0 && (
        <>
          <span>·</span>
          <span>
            {jsdocRewriteCount} JSDoc edit{jsdocRewriteCount === 1 ? '' : 's'}
          </span>
        </>
      )}
      {warningCount > 0 && (
        <>
          <span>·</span>
          <span className='text-warning'>
            {warningCount} warning{warningCount === 1 ? '' : 's'}
          </span>
        </>
      )}
      <span>·</span>
      <span>
        {target.mode === 'overwrite' ? 'overwriting unreleased ' : 'new '}
        <strong className='text-foreground'>v{target.version}</strong>
      </span>
    </div>
  );
}

function TargetPill({ target }) {
  if (!target) return null;
  const tip =
    target.mode === 'overwrite'
      ? `v${target.version} is the current draft, saving directly to it (no release).`
      : `No unreleased draft found, creating new v${target.version} (no release).`;
  return (
    <Tooltip closeDelay={0} delay={800}>
      <Chip color={target.mode === 'overwrite' ? 'success' : 'accent'} size='sm' variant='soft'>
        {target.mode === 'overwrite' ? `Save to v${target.version}` : `New v${target.version}`}
      </Chip>
      <Tooltip.Content className='text-wrap'>{tip}</Tooltip.Content>
    </Tooltip>
  );
}

function ViewHeader({ isRefreshing, onBackToDefault, onRefresh, subtitle, title }) {
  return (
    <Card.Header className='gap-1'>
      <Card.Title className='line-clamp-2 min-w-0 pr-8'>{title}</Card.Title>
      {onBackToDefault && (
        <Tooltip closeDelay={0} delay={800}>
          <Button
            isIconOnly
            aria-label='Close'
            className='absolute top-1 right-2'
            size='sm'
            variant='ghost'
            onPress={onBackToDefault}
          >
            <IconX />
          </Button>
          <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
            Close
          </Tooltip.Content>
        </Tooltip>
      )}
      {(subtitle || onRefresh) && (
        <div className='flex min-w-0 items-center justify-between gap-2'>
          <div className='min-w-0 flex-1 truncate text-xs text-muted'>{subtitle}</div>
          {onRefresh && (
            <Tooltip closeDelay={0} delay={800}>
              <Button
                isIconOnly
                aria-label='Refresh'
                isDisabled={isRefreshing}
                size='sm'
                variant='ghost'
                onPress={onRefresh}
              >
                <IconSync className={isRefreshing ? 'animate-spin' : ''} />
              </Button>
              <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
                Refresh
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>
      )}
    </Card.Header>
  );
}

function WarningsSection({ warnings }) {
  if (!warnings || warnings.length === 0) {
    return (
      <div className='flex items-center gap-2 text-xs text-muted'>
        <IconCheckCircle size={14} />
        <span>No warnings</span>
      </div>
    );
  }
  return (
    <Disclosure className='w-full'>
      <Disclosure.Heading>
        <Button fullWidth className='justify-between' size='sm' slot='trigger' variant='ghost'>
          Warnings ({warnings.length})
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='flex flex-col gap-1 pt-1 pl-1 text-xs'>
          {warnings.map((w, idx) => (
            <div className={`flex items-start gap-1 ${w.severity === 'error' ? 'text-danger' : 'text-warning'}`} key={idx}>
              <IconExclamationTriangle className='mt-0.5 shrink-0' size={12} />
              <div className='flex flex-col gap-0.5'>
                {w.functionName && <span className='font-mono text-muted'>{w.functionName}</span>}
                <span>{w.message}</span>
              </div>
            </div>
          ))}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}
