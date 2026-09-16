const SPREADSHEET_FORMULA_PATTERN = /^\s*[=+\-@]/

export function neutralizeSpreadsheetFormula(value) {
  if (typeof value !== 'string') return value
  return SPREADSHEET_FORMULA_PATTERN.test(value) ? `'${value}` : value
}

export function neutralizeExportRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, neutralizeSpreadsheetFormula(value)])
  )
}
