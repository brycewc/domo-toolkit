import * as XLSX from 'xlsx';

/**
 * Extract plain text value from a data cell
 * Handles various data types including objects with specific keys
 * @param {any} value - The cell value
 * @param {string} accessorKey - The column accessor key
 * @returns {string} Plain text representation
 */
function extractCellValue(value, accessorKey) {
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
 * Transform table data into exportable format based on visible columns
 * @param {Array} data - Array of row data objects
 * @param {Array} columns - Array of column definitions with accessorKey and header
 * @returns {Array<Object>} Array of objects with header keys and values
 */
function transformDataForExport(data, columns) {
  return data.map((row) => {
    const exportRow = {};
    columns.forEach((col) => {
      const header =
        typeof col.header === 'string' ? col.header : col.accessorKey || col.id;
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
  const headers = columns.map((col) =>
    typeof col.header === 'string' ? col.header : col.accessorKey || col.id
  );

  // Build CSV content
  const csvRows = [];

  // Header row
  csvRows.push(headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','));

  // Data rows
  exportData.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header] ?? '';
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
export function exportToExcel(data, columns, filename = 'export', sheetName = 'Data') {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const exportData = transformDataForExport(data, columns);
  const headers = columns.map((col) =>
    typeof col.header === 'string' ? col.header : col.accessorKey || col.id
  );

  // Create worksheet data with headers
  const wsData = [headers];
  exportData.forEach((row) => {
    const rowValues = headers.map((header) => row[header] ?? '');
    wsData.push(rowValues);
  });

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns based on content
  const colWidths = headers.map((header, i) => {
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

  // Generate and download
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, `${filename}.xlsx`);
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
 * Generate a filename with timestamp
 * @param {string} prefix - Filename prefix
 * @returns {string} Filename with timestamp
 */
export function generateExportFilename(prefix = 'export') {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
  return `${prefix}_${timestamp}`;
}
