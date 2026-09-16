import { executeInPage } from '@/utils/executeInPage';

/**
 * Get all Domo Everywhere publications owned by a user, from the publisher
 * side. There is no server-side owner filter, so every summary is listed and
 * matched on `userId` (the `packagepub_owner` join) here.
 *
 * `public=false` and `public=true` are separate result sets on this endpoint,
 * so both are queried and merged. Config publications (org templates) are not
 * reachable at all: the listing query is pinned to content publications.
 * @param {number} ownerId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedPublications(ownerId, tabId = null) {
  return executeInPage(
    async (ownerId) => {
      // The endpoint validates limit and offset at 10000 apiece and 400s past
      // either, so page in 2000s and stop before an offset it would reject.
      const limit = 2000;
      const maxOffset = 10000;
      const owned = new Map();

      for (const isPublic of [false, true]) {
        for (let offset = 0; offset <= maxOffset; offset += limit) {
          const response = await fetch(
            `/api/publish/v2/publications/summaries?limit=${limit}&offset=${offset}&sort=NAME_ASC&public=${isPublic}`
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const summaries = await response.json();
          if (!Array.isArray(summaries) || summaries.length === 0) break;

          for (const summary of summaries) {
            if (summary?.id == null) continue;
            if (summary.userId != ownerId) continue;
            owned.set(String(summary.id), {
              id: String(summary.id),
              name: summary.name || String(summary.id)
            });
          }

          if (summaries.length < limit) break;
        }
      }

      return [...owned.values()];
    },
    [ownerId],
    tabId
  );
}

/**
 * Transfer publication ownership to a new user.
 *
 * The only non-admin owner change is a full publication update: anything left
 * out of the body is dropped from the publication, so each one is read first
 * and rebuilt. The read and write shapes differ, which is the trap here:
 *   - the update's `content` array is the read's `children[].content`, NOT its
 *     top-level `content` (that is the publication's own package descriptor)
 *   - the update's `subscriberDomain` is the read's
 *     `subscriptionAuthorizations[].domain`, a field the read never returns
 *     under that name
 * Sending the read's fields through unchanged empties both, so the shape is
 * asserted before anything is written.
 *
 * The update also runs as the new owner, so it fails when they cannot read
 * every object the publication contains, and it returns 202 and republishes
 * asynchronously.
 *
 * The loop is serial on purpose: the update takes a per-publication lock and a
 * ready check, so overlapping calls on one publication conflict.
 * @param {string[]} publicationIds - Array of publication IDs to transfer
 * @param {number} fromOwnerId - The current owner's user ID
 * @param {number} toOwnerId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of the destination
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferPublications(publicationIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  if (ownerType === 'GROUP') {
    return {
      errors: publicationIds.map((id) => ({ error: 'Publications cannot be owned by a group', id })),
      failed: publicationIds.length,
      succeeded: 0
    };
  }

  const result = await executeInPage(
    async (publicationIds, toOwnerId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of publicationIds) {
        try {
          const getResponse = await fetch(`/api/publish/v2/publications/${id}`);
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const publication = await getResponse.json();

          // Refuse to write a body rebuilt from a shape we don't recognize:
          // the update is a full replace, so a missing piece here deletes the
          // publication's content rather than failing.
          if (!publication?.id || !Array.isArray(publication.children)) {
            throw new Error('Unexpected publication response; not transferring');
          }

          const response = await fetch(`/api/publish/v2/publications/${id}`, {
            body: JSON.stringify({
              content: publication.children.map((child) => child.content).filter(Boolean),
              description: publication.description,
              domain: publication.content?.domain,
              id: publication.id,
              isPublic: publication.isPublic,
              name: publication.name,
              public: publication.isPublic,
              subscriberDomain: (publication.subscriptionAuthorizations || []).map((a) => a.domain).filter(Boolean),
              type: publication.type,
              userId: toOwnerId
            }),
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
    [publicationIds, parseInt(toOwnerId)],
    tabId
  );

  return (
    result || {
      errors: publicationIds.map((id) => ({ error: 'Transfer failed', id })),
      failed: publicationIds.length,
      succeeded: 0
    }
  );
}
