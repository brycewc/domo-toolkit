/**
 * Build an Excel (.xlsx) Blob from tabular data. Shared internals for
 * download-mode (exportToExcel) and attachment-mode callers.
 * @param {Array} data - Array of row data objects
 * @param {Array} columns - Array of visible column definitions
 * @param {string} sheetName - Name of the Excel sheet
 * @returns {Promise<Blob>} The workbook as a Blob with the xlsx MIME type
 */
export async function buildExcelBlob(data, columns, sheetName = 'Data') {
  const exportData = transformDataForExport(data || [], columns);
  const headers = columns.map((col) => (typeof col.header === 'string' ? col.header : col.accessorKey || col.id));

  // Create worksheet data with headers
  const wsData = [headers];
  exportData.forEach((row) => {
    const rowValues = headers.map((header) => sanitizeForSpreadsheet(row[header] ?? ''));
    wsData.push(rowValues);
  });

  const XLSX = await import('xlsx');

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns based on content
  const colWidths = headers.map((header) => {
    let maxLen = header.length;
    exportData.forEach((row) => {
      const cellValue = String(row[header] ?? '');
      maxLen = Math.max(maxLen, cellValue.length);
    });
    return { wch: Math.min(maxLen + 2, 50) }; // Cap at 50 characters
  });
  ws['!cols'] = colWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/**
 * Export data to CSV format and trigger download
 * @param {Array} data - Array of row data objects
 * @param {Array} columns - Array of visible column definitions
 * @param {string} filename - Filename without extension
 */
export function exportToCSV(data, columns, filename = 'export') {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const exportData = transformDataForExport(data, columns);
  const headers = columns.map((col) => (typeof col.header === 'string' ? col.header : col.accessorKey || col.id));

  // Build CSV content
  const csvRows = [];

  // Header row
  csvRows.push(headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','));

  // Data rows
  exportData.forEach((row) => {
    const values = headers.map((header) => {
      const value = sanitizeForSpreadsheet(row[header] ?? '');
      // Escape quotes and wrap in quotes
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });

  const csvContent = csvRows.join('\n');

  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Export data to Excel format and trigger download
 * @param {Array} data - Array of row data objects
 * @param {Array} columns - Array of visible column definitions
 * @param {string} filename - Filename without extension
 * @param {string} sheetName - Name of the Excel sheet
 */
export async function exportToExcel(data, columns, filename = 'export', sheetName = 'Data') {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const blob = await buildExcelBlob(data, columns, sheetName);
  downloadBlob(blob, `${filename}.xlsx`);
}

/**
 * Export data to a JSON file and trigger download
 * @param {any} data - Serializable data (array or object)
 * @param {string} filename - Filename without extension
 */
export function exportToJson(data, filename = 'export') {
  if (data == null) {
    console.warn('No data to export');
    return;
  }

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, `${filename}.json`);
}

/**
 * Generate a filename with timestamp
 * @param {string} prefix - Filename prefix
 * @returns {string} Filename with timestamp
 */
export function generateExportFilename(prefix = 'export') {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
  return `${prefix}_${timestamp}`;
}

/**
 * Helper function to trigger file download
 * @param {Blob} blob - The file blob
 * @param {string} filename - The filename with extension
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Extract plain text value from a data cell
 * Handles various data types including objects with specific keys
 * @param {any} value - The cell value
 * @param {string} accessorKey - The column accessor key
 * @returns {string} Plain text representation
 */
function extractCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle objects - try common patterns
  if (typeof value === 'object') {
    // Check for common name/label/title patterns
    if (value.name) return value.name;
    if (value.label) return value.label;
    if (value.title) return value.title;
    if (value.value) return String(value.value);

    // Try to stringify as last resort
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }

  return String(value);
}

/**
 * Neutralize spreadsheet formula injection. A cell whose text begins with a
 * formula trigger (= + - @) or a leading tab/carriage return can execute when
 * the file is opened in Excel/Sheets, so prefix it with a single quote to
 * force the value to be treated as text. The + and - cases are kept
 * number-aware: a legitimate negative/positive number (e.g. a -4 lineage
 * level) is left untouched so it stays numeric, while a formula-shaped string
 * (+1+2, -cmd) is still quoted. Non-string values pass through.
 * @param {any} value - The cell value
 * @returns {any} The original value, or a quote-prefixed string when risky
 */
function sanitizeForSpreadsheet(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }
  const first = value[0];
  if (first === '=' || first === '@' || first === '\t' || first === '\r') {
    return `'${value}`;
  }
  if ((first === '+' || first === '-') && !Number.isFinite(Number(value))) {
    return `'${value}`;
  }
  return value;
}

/**
 * Transform table data into exportable format based on visible columns
 * @param {Array} data - Array of row data objects
 * @param {Array} columns - Array of column definitions with accessorKey and header
 * @returns {Array<Object>} Array of objects with header keys and values
 */
function transformDataForExport(data, columns) {
  return data.map((row) => {
    const exportRow = {};
    columns.forEach((col) => {
      const header = typeof col.header === 'string' ? col.header : col.accessorKey || col.id;
      const accessorKey = col.accessorKey || col.id;

      // Get value from row using accessor
      let value;
      if (accessorKey && row[accessorKey] !== undefined) {
        value = row[accessorKey];
      } else if (col.accessorFn) {
        value = col.accessorFn(row);
      } else {
        value = '';
      }

      exportRow[header] = extractCellValue(value, accessorKey);
    });
    return exportRow;
  });
}
