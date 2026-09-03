const COLORS = {
  red: { red: 0.72, green: 0.04, blue: 0.08 },
  redDark: { red: 0.20, green: 0.015, blue: 0.025 },
  black: { red: 0.035, green: 0.04, blue: 0.05 },
  charcoal: { red: 0.075, green: 0.08, blue: 0.10 },
  panel: { red: 0.105, green: 0.11, blue: 0.135 },
  white: { red: 0.97, green: 0.97, blue: 0.985 },
  muted: { red: 0.67, green: 0.68, blue: 0.73 },
  green: { red: 0.08, green: 0.55, blue: 0.30 },
  blue: { red: 0.12, green: 0.48, blue: 0.90 },
  purple: { red: 0.53, green: 0.20, blue: 0.93 }
};

const rgb = c => ({ rgbColor: c });
const grid = (sheetId, r1, r2, c1, c2) => ({ sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 });
const width = (sheetId, col, px) => ({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
const height = (sheetId, row, px) => ({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: row, endIndex: row + 1 }, properties: { pixelSize: px }, fields: "pixelSize" } });

async function formatSpreadsheet(sheets, spreadsheetId, TABS) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" });
  const dashboard = (meta.data.sheets || []).find(s => s.properties.title === TABS.dashboard);
  if (!dashboard) return;

  const sid = dashboard.properties.sheetId;
  const requests = [
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { hideGridlines: true, frozenRowCount: 2 }, tabColorStyle: rgb(COLORS.red) }, fields: "gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle" } },
    { unmergeCells: { range: grid(sid, 0, 20, 0, 8) } },
    { repeatCell: { range: grid(sid, 0, 20, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.black), textFormat: { foregroundColorStyle: rgb(COLORS.white), fontSize: 10 }, verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat" } },

    { mergeCells: { range: grid(sid, 0, 2, 0, 8), mergeType: "MERGE_ALL" } },
    { repeatCell: { range: grid(sid, 0, 2, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.redDark), textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 20 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", borders: { bottom: { style: "SOLID_THICK", colorStyle: rgb(COLORS.red) } } } }, fields: "userEnteredFormat" } },

    { mergeCells: { range: grid(sid, 2, 3, 0, 8), mergeType: "MERGE_ALL" } },
    { repeatCell: { range: grid(sid, 2, 3, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.charcoal), textFormat: { foregroundColorStyle: rgb(COLORS.muted), italic: true, fontSize: 10 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat" } },

    { mergeCells: { range: grid(sid, 4, 5, 0, 2), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 5, 7, 0, 2), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 4, 5, 2, 4), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 5, 7, 2, 4), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 4, 5, 4, 6), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 5, 7, 4, 6), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 4, 5, 6, 8), mergeType: "MERGE_ALL" } },
    { mergeCells: { range: grid(sid, 5, 7, 6, 8), mergeType: "MERGE_ALL" } },

    { repeatCell: { range: grid(sid, 4, 7, 0, 2), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.panel), horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", borders: { top: { style: "SOLID_THICK", colorStyle: rgb(COLORS.purple) } } } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: grid(sid, 4, 7, 2, 4), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.panel), horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", borders: { top: { style: "SOLID_THICK", colorStyle: rgb(COLORS.green) } } } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: grid(sid, 4, 7, 4, 6), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.panel), horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", borders: { top: { style: "SOLID_THICK", colorStyle: rgb(COLORS.red) } } } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: grid(sid, 4, 7, 6, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.panel), horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", borders: { top: { style: "SOLID_THICK", colorStyle: rgb(COLORS.blue) } } } }, fields: "userEnteredFormat" } },

    { repeatCell: { range: grid(sid, 4, 5, 0, 8), cell: { userEnteredFormat: { textFormat: { foregroundColorStyle: rgb(COLORS.muted), bold: true, fontSize: 10 } } }, fields: "userEnteredFormat.textFormat" } },
    { repeatCell: { range: grid(sid, 5, 7, 0, 8), cell: { userEnteredFormat: { textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 18 } } }, fields: "userEnteredFormat.textFormat" } },

    { mergeCells: { range: grid(sid, 9, 10, 0, 8), mergeType: "MERGE_ALL" } },
    { repeatCell: { range: grid(sid, 9, 10, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.redDark), textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 12 }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat" } },
    { repeatCell: { range: grid(sid, 10, 13, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.charcoal), textFormat: { foregroundColorStyle: rgb(COLORS.white), fontSize: 11 }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP", borders: { bottom: { style: "SOLID", colorStyle: rgb(COLORS.panel) } } } }, fields: "userEnteredFormat" } },

    height(sid, 0, 34), height(sid, 1, 34), height(sid, 2, 28), height(sid, 4, 28), height(sid, 5, 34), height(sid, 6, 34), height(sid, 9, 30),
    width(sid, 0, 145), width(sid, 1, 145), width(sid, 2, 145), width(sid, 3, 145), width(sid, 4, 145), width(sid, 5, 145), width(sid, 6, 145), width(sid, 7, 145)
  ];

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  console.log("✅ Dashboard v2 opgemaakt. Andere tabs zijn bewust nog niet aangepast.");
}

module.exports = { formatSpreadsheet };
