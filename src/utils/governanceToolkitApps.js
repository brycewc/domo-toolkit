/**
 * Governance Toolkit route table, mirroring Domo's own frontend routing config.
 * Domo publishes no deep link to a job, so the extension builds one from these
 * slugs. An instance holds only a subset of these applications, and the retired
 * `dataset-naming` app (e8c26ad1-6c71-4f8b-9f22-c46ee23dc15c) is absent because
 * it no longer has a route.
 */

export const GOVERNANCE_TOOLKIT_APPLICATION_ID_BY_SLUG = {
  'dataset-backup': 'e37a6942-9c0f-485a-8288-4fe95e10b23d',
  'dataset-watchdog': '33aab8f0-3397-45e1-933c-755abd0f5b3a',
  'enterprise-data-copy': '1d5cb672-e0c5-4ea2-82d7-f9a8aca02bf9',
  'group-management': '2f6573a5-97d8-4e27-b0fd-3c0f2313a3c8',
  'observability-metrics': '50e7230f-d2f2-42e2-a208-d94c8ae9f64c',
  'pdp-automation': '25a97e0c-df6b-11eb-ba80-0242ac130004',
  'schema-management': '4ddbf5d7-6441-4eb3-b5aa-97707cae2d2b',
  'tag-management': 'a99c3fd8-a0f6-4d06-9a1d-74f3d12293d4',
  'triggered-reports': 'bf651f89-2b76-4290-a5d8-d4dbcddc86a3',
  'upsert-rollup-merger': 'dc9d170e-01fc-4c79-9284-c70d04a648c0',
  'user-management': 'b52f3c80-2642-4dcb-b874-b327326021b0',
  'virtual-datasets': '69a16dc5-1d0e-45a6-8e15-459d8c0b1b42'
};

/** Candidate applications for resolving a job whose application is unknown. */
export const GOVERNANCE_TOOLKIT_APPLICATION_IDS = Object.values(GOVERNANCE_TOOLKIT_APPLICATION_ID_BY_SLUG);

export const GOVERNANCE_TOOLKIT_JOB_PARAM = 'domoToolkitGovernanceJobId';

export const GOVERNANCE_TOOLKIT_PATH = '/admin/governance-toolkit/';

export const GOVERNANCE_TOOLKIT_SLUG_BY_APPLICATION_ID = Object.fromEntries(
  Object.entries(GOVERNANCE_TOOLKIT_APPLICATION_ID_BY_SLUG).map(([slug, applicationId]) => [applicationId, slug])
);
