/**
 * The `/admin/certifiedcontent/{segment}/edit-form/{id}` URL segment for a
 * certification process, derived from its template type. Composite types are
 * built as `CC:` + the certify type name, optionally suffixed (`CC:DSET:DOMO`),
 * so each check is a prefix match.
 *
 * `CC:PAGE` and `CC:DATAFLOW` exist only in Domo's backend, never on the
 * frontend, so they fall through to the dataset segment with everything else.
 *
 * @param {string} templateType - Template `type` (e.g. 'CC:DSET', 'CC:CARD:DOMO')
 * @returns {string|null} The URL segment, or null when the type is unknown
 */
export function certifiedContentUrlSegment(templateType) {
  if (typeof templateType !== 'string') return null;
  if (templateType.startsWith('CC:CARD')) return 'certified-cards';
  if (templateType.startsWith('CC:BSTM')) return 'certified-beastmodes';
  return 'certified-datasets';
}
