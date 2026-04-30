import { executeInPage } from '@/utils';

export async function getCodeEngineCode({ packageId, tabId, version }) {
  return executeInPage(
    async (packageId, version) => {
      try {
        // If no version provided, read from the page's version selector
        // (works on the code engine page itself)
        if (!version) {
          const container = document.querySelector(
            'div[class*="module_packageControls"]'
          );
          const input = container?.querySelector(
            'input[class*="SelectListInputComponent"]'
          );
          if (input) {
            const versionMatch = input.value.match(
              /^Version\s+(\d+\.\d+\.\d+)$/
            );
            if (versionMatch) {
              version = versionMatch[1];
            }
          }
        }

        if (!version) {
          throw new Error('Could not determine package version');
        }

        const response = await fetch(
          `/api/codeengine/v2/packages/${packageId}/versions/${version}?parts=code`
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch package code. HTTP status: ${response.status}`
          );
        }

        const data = await response.json();
        return { code: data.code, version };
      } catch (error) {
        console.error('Error fetching code engine code:', error);
        throw error;
      }
    },
    [packageId, version],
    tabId
  );
}

/**
 * Read the current source from the CodeMirror 6 IDE editor (live, includes unsaved edits).
 * Falls back to fetching the latest saved version's code via API if the editor isn't reachable.
 *
 * The Code Engine IDE uses CodeMirror 6, which exposes its EditorView via a private
 * `cmView.view` property on the `.cm-content` element. We read `state.doc.toString()`
 * to get the full document text.
 *
 * @param {Object} params
 * @param {string} params.packageId - Code Engine package UUID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{ code: string, source: 'editor'|'api', version?: string }>}
 */
export async function getCodeEngineEditorSource({ packageId, tabId }) {
  return executeInPage(
    async (packageId) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const contentEl = document.querySelector('.cm-content');
        const editorView = contentEl?.cmView?.view;
        const code = editorView?.state?.doc?.toString();
        if (typeof code === 'string' && code.length > 0) {
          return { code, source: 'editor' };
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }

      let version = null;
      const container = document.querySelector('div[class*="module_packageControls"]');
      const input = container?.querySelector('input[class*="SelectListInputComponent"]');
      const versionMatch = input?.value?.match(/^Version\s+(\d+\.\d+\.\d+)$/);
      if (versionMatch) version = versionMatch[1];

      if (!version) {
        const infoResp = await fetch(`/api/codeengine/v2/packages/${packageId}?parts=versions`);
        if (!infoResp.ok) throw new Error(`HTTP ${infoResp.status} fetching package info`);
        const info = await infoResp.json();
        const versions = (info.versions || [])
          .map((v) => v.version)
          .filter(Boolean)
          .sort((a, b) => {
            const pa = a.split('.').map(Number);
            const pb = b.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
              if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
            }
            return 0;
          });
        version = versions[0];
      }
      if (!version) throw new Error('Could not determine package version for fallback');

      const codeResp = await fetch(
        `/api/codeengine/v2/packages/${packageId}/versions/${version}?parts=code`
      );
      if (!codeResp.ok) throw new Error(`HTTP ${codeResp.status} fetching saved code`);
      const data = await codeResp.json();
      return { code: data.code || '', source: 'api', version };
    },
    [packageId],
    tabId
  );
}

/**
 * GET /api/codeengine/v2/packages/{packageId} with all parts needed for sync.
 * @param {string} packageId - Code Engine package UUID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Object>} Full package definition (functions, versions, configuration, name, etc.)
 */
export async function getCodeEnginePackageDefinition(packageId, tabId = null) {
  return executeInPage(
    async (packageId) => {
      const response = await fetch(
        `/api/codeengine/v2/packages/${packageId}?parts=functions,versions,configuration`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    [packageId],
    tabId
  );
}

/**
 * Fetch the currently-viewed version's code for a Code Engine package.
 * Reads the version number from the page's version selector input,
 * then calls the Domo API to retrieve the source code.
 *
 * @param {Object} params
 * @param {string} params.packageId - Code Engine package UUID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{ code: string, version: string }>}
 */
export async function getCodeEnginePackageInfo(packageId, tabId = null) {
  return executeInPage(
    async (packageId) => {
      const response = await fetch(
        `/api/codeengine/v2/packages/${packageId}?parts=versions`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    [packageId],
    tabId
  );
}

/**
 * Get all Code Engine packages owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedCodeEnginePackages(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allPackages = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            count,
            entityList: [['package']],
            facetValuesToInclude: [],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                value: `${userId}:USER`
              }
            ],
            hideSearchObjects: true,
            offset,
            query: '**'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const packages = data.searchResultsMap?.package || [];
        if (packages.length > 0) {
          allPackages.push(
            ...packages.map((p) => ({ id: p.uuid, name: p.title || p.uuid }))
          );
          offset += count;
          if (packages.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allPackages;
    },
    [userId],
    tabId
  );
}

/**
 * POST /api/codeengine/v2/packages — creates a new version of an existing package.
 * @param {Object} definition - Package payload with `manifest` envelope
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Object>} Server response with new version info
 */
export async function postCodeEnginePackageVersion(definition, tabId = null) {
  return executeInPage(
    async (definition) => {
      const response = await fetch('/api/codeengine/v2/packages', {
        body: JSON.stringify(definition),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
      }
      return response.json();
    },
    [definition],
    tabId
  );
}

/**
 * POST /api/codeengine/v2/packages/{packageId}/versions/{version}/release
 * Releases a previously-saved version so consumers can use it.
 * @param {string} packageId
 * @param {string} version
 * @param {number|null} tabId
 * @returns {Promise<void>}
 */
export async function releaseCodeEnginePackageVersion(packageId, version, tabId = null) {
  return executeInPage(
    async (packageId, version) => {
      const response = await fetch(
        `/api/codeengine/v2/packages/${packageId}/versions/${version}/release`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
      }
    },
    [packageId, version],
    tabId
  );
}

/**
 * Push a new source string into the CM6 editor via view.dispatch({ changes: ... }).
 * Used to apply JSDoc rewrites to the IDE so the user sees them.
 *
 * @param {Object} params
 * @param {string} params.code - The new source code to set in the editor
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function setCodeEngineEditorSource({ code, tabId }) {
  return executeInPage(
    async (code) => {
      const contentEl = document.querySelector('.cm-content');
      const editorView = contentEl?.cmView?.view;
      if (!editorView?.dispatch || !editorView?.state?.doc) {
        return { ok: false, reason: 'editor not reachable' };
      }
      try {
        editorView.dispatch({
          changes: { from: 0, insert: code, to: editorView.state.doc.length }
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error?.message || 'dispatch failed' };
      }
    },
    [code],
    tabId
  );
}

/**
 * Transfer Code Engine package ownership to a new user.
 * @param {string[]} packageIds - Array of package IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferCodeEnginePackages(
  packageIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (packageIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of packageIds) {
        try {
          const response = await fetch(`/api/codeengine/v2/packages/${id}`, {
            body: JSON.stringify({ owner: parseInt(toUserId) }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [packageIds, fromUserId, toUserId],
    tabId
  );
}
