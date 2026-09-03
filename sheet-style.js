const COLORS = {
  red: { red: 0.55, green: 0.0, blue: 0.0 },
  redDark: { red: 0.22, green: 0.0, blue: 0.0 },
  black: { red: 0.06, green: 0.06, blue: 0.07 },
  charcoal: { red: 0.12, green: 0.12, blue: 0.14 },
  gray: { red: 0.22, green: 0.22, blue: 0.25 },
  light: { red: 0.94, green: 0.92, blue: 0.84 },
  white: { red: 1, green: 1, blue: 1 },
  green: { red: 0.08, green: 0.48, blue: 0.22 },
  amber: { red: 0.85, green: 0.55, blue: 0.08 }
};

function rgb(c) { return { rgbColor: c }; }
function range(sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex) {
  return { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex };
}

function headerRequest(sheetId, columns) {
  return {
    repeatCell: {
      range: range(sheetId, 0, 1, 0, columns),
      cell: {
        userEnteredFormat: {
          backgroundColorStyle: rgb(COLORS.redDark),
          textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 11 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          borders: {
            bottom: { style: "SOLID_THICK", colorStyle: rgb(COLORS.red) }
          }
        }
      },
      fields: "userEnteredFormat"
    }
  };
}

function bodyRequest(sheetId, columns) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: columns },
      cell: {
        userEnteredFormat: {
          backgroundColorStyle: rgb(COLORS.black),
          textFormat: { foregroundColorStyle: rgb(COLORS.light), fontSize: 10 },
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP"
        }
      },
      fields: "userEnteredFormat(backgroundColorStyle,textFormat,verticalAlignment,wrapStrategy)"
    }
  };
}

function widthRequest(sheetId, start, end, pixels) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: start, endIndex: end },
      properties: { pixelSize: pixels },
      fields: "pixelSize"
    }
  };
}

function numberFormatRequest(sheetId, startColumnIndex, endColumnIndex, pattern = "$#,##0") {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex, endColumnIndex },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern } } },
      fields: "userEnteredFormat.numberFormat"
    }
  };
}

function dateFormatRequest(sheetId, startColumnIndex, endColumnIndex) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex, endColumnIndex },
      cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd-mm-yyyy HH:mm" } } },
      fields: "userEnteredFormat.numberFormat"
    }
  };
}

async function formatSpreadsheet(sheets, spreadsheetId, TABS) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties)"
  });
  const byTitle = new Map((meta.data.sheets || []).map(s => [s.properties.title, s.properties]));
  const requests = [];

  const schemas = {
    [TABS.payments]: { cols: 10, widths: [130, 95, 155, 170, 105, 110, 150, 150, 150, 220] },
    [TABS.expenses]: { cols: 10, widths: [130, 145, 105, 140, 260, 155, 150, 120, 105, 220] },
    [TABS.transactions]: { cols: 9, widths: [135, 145, 150, 105, 155, 165, 280, 140, 120] },
    [TABS.logs]: { cols: 6, widths: [150, 190, 155, 160, 360, 150] },
    [TABS.settings]: { cols: 2, widths: [220, 320] }
  };

  for (const [title, cfg] of Object.entries(schemas)) {
    const p = byTitle.get(title);
    if (!p) continue;
    requests.push(
      { updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { frozenRowCount: 1, hideGridlines: true }, tabColorStyle: rgb(title === TABS.settings ? COLORS.gray : COLORS.red) }, fields: "gridProperties.frozenRowCount,gridProperties.hideGridlines,tabColorStyle" } },
      headerRequest(p.sheetId, cfg.cols),
      bodyRequest(p.sheetId, cfg.cols),
      { updateDimensionProperties: { range: { sheetId: p.sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: "pixelSize" } }
    );
    cfg.widths.forEach((w, i) => requests.push(widthRequest(p.sheetId, i, i + 1, w)));
  }

  const payments = byTitle.get(TABS.payments);
  if (payments) {
    requests.push(numberFormatRequest(payments.sheetId, 4, 5), dateFormatRequest(payments.sheetId, 6, 8));
  }
  const expenses = byTitle.get(TABS.expenses);
  if (expenses) {
    requests.push(numberFormatRequest(expenses.sheetId, 2, 3), numberFormatRequest(expenses.sheetId, 7, 8), dateFormatRequest(expenses.sheetId, 1, 2));
  }
  const transactions = byTitle.get(TABS.transactions);
  if (transactions) {
    requests.push(numberFormatRequest(transactions.sheetId, 3, 4), numberFormatRequest(transactions.sheetId, 8, 9), dateFormatRequest(transactions.sheetId, 1, 2));
  }
  const logs = byTitle.get(TABS.logs);
  if (logs) requests.push(dateFormatRequest(logs.sheetId, 0, 1));

  const dashboard = byTitle.get(TABS.dashboard);
  if (dashboard) {
    const sid = dashboard.sheetId;
    requests.push(
      { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { hideGridlines: true, frozenRowCount: 1 }, tabColorStyle: rgb(COLORS.red) }, fields: "gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle" } },
      { unmergeCells: { range: range(sid, 0, 1, 0, 2) } },
      { mergeCells: { range: range(sid, 0, 1, 0, 2), mergeType: "MERGE_ALL" } },
      {
        repeatCell: {
          range: range(sid, 0, 1, 0, 2),
          cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.redDark), textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 16 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
          fields: "userEnteredFormat"
        }
      },
      {
        repeatCell: {
          range: range(sid, 1, 6, 0, 1),
          cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.charcoal), textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true }, verticalAlignment: "MIDDLE" } },
          fields: "userEnteredFormat"
        }
      },
      {
        repeatCell: {
          range: range(sid, 1, 6, 1, 2),
          cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.black), textFormat: { foregroundColorStyle: rgb(COLORS.light), bold: true }, horizontalAlignment: "RIGHT", verticalAlignment: "MIDDLE" } },
          fields: "userEnteredFormat"
        }
      },
      numberFormatRequest(sid, 1, 2),
      widthRequest(sid, 0, 1, 230),
      widthRequest(sid, 1, 2, 190),
      { updateDimensionProperties: { range: { sheetId: sid, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: "pixelSize" } },
      { updateDimensionProperties: { range: { sheetId: sid, dimension: "ROWS", startIndex: 1, endIndex: 6 }, properties: { pixelSize: 30 }, fields: "pixelSize" } }
    );
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
}

module.exports = { formatSpreadsheet };
