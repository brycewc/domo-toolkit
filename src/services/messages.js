import { executeInPage } from '@/utils';

/**
 * Send an email via Domo's social messaging endpoint, optionally with data-file
 * attachments. The HTML body is wrapped in the same Helvetica flex-column
 * styling used by the Code Engine `sendEmail` helper so extension-sent and
 * Code-Engine-sent emails render identically.
 *
 * Endpoint: POST /api/social/v3/messages/domoWrapperNew:plainText/send
 *   ?route=recipients&method=EMAIL&recipients={emails}
 *
 * @param {Object} params
 * @param {string|string[]} [params.recipientEmails] - Comma-joinable list of emails
 * @param {string} params.subject - Email subject
 * @param {string} params.bodyHtml - Inner HTML body (will be wrapped in styling)
 * @param {number[]} [params.recipientsUserIds] - Domo user IDs
 * @param {number[]} [params.recipientsGroupIds] - Domo group IDs
 * @param {number[]} [params.dataFileAttachments] - Data-file IDs from uploadDataFile
 * @param {boolean} [params.includeReplyAll] - Populate reply-to with recipients
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<void>}
 */
export async function sendEmail(
  {
    bodyHtml,
    dataFileAttachments = [],
    includeReplyAll = false,
    recipientEmails,
    recipientsGroupIds = [],
    recipientsUserIds = [],
    subject
  },
  tabId = null
) {
  if (!recipientEmails && recipientsUserIds.length === 0 && recipientsGroupIds.length === 0) {
    throw new Error(
      'sendEmail requires at least one of recipientEmails, recipientsUserIds, or recipientsGroupIds'
    );
  }

  const emailsParam = Array.isArray(recipientEmails)
    ? recipientEmails.join(',')
    : recipientEmails || '';

  return executeInPage(
    async (payload, emailsParam) => {
      const url = `/api/social/v3/messages/domoWrapperNew:plainText/send?route=recipients&method=EMAIL&recipients=${encodeURIComponent(emailsParam)}`;
      const response = await fetch(url, {
        body: JSON.stringify({ parameters: payload }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Send email failed: HTTP ${response.status}`);
      }
    },
    [
      {
        dataFileAttachments,
        populateReplyToHeaderWithRecipients: !!includeReplyAll,
        recipientsGroupIds,
        recipientsUserIds,
        subject,
        text: `<div style="display: flex; flex-direction: column; font-family: Helvetica; overflow-x: auto; flex-wrap: wrap; width: 100%; text-align: center;"><div style="display: flex; flex-direction: column; justify-content: center; width: 100%">${bodyHtml || ''}</div></div>`
      },
      emailsParam
    ],
    tabId
  );
}
