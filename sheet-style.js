const COLORS = {
  red: { red: 0.72, green: 0.04, blue: 0.08 },
  redDark: { red: 0.20, green: 0.015, blue: 0.025 },
  black: { red: 0.035, green: 0.04, blue: 0.05 },
  charcoal: { red: 0.075, green: 0.08, blue: 0.10 },
  panel: { red: 0.105, green: 0.11, blue: 0.135 },
  gray: { red: 0.28, green: 0.29, blue: 0.33 },
  muted: { red: 0.67, green: 0.68, blue: 0.73 },
  white: { red: 0.97, green: 0.97, blue: 0.985 },
  green: { red: 0.08, green: 0.55, blue: 0.30 },
  greenDark: { red: 0.035, green: 0.22, blue: 0.12 },
  amber: { red: 0.96, green: 0.62, blue: 0.10 },
  amberDark: { red: 0.30, green: 0.18, blue: 0.03 },
  blue: { red: 0.12, green: 0.48, blue: 0.90 },
  purple: { red: 0.53, green: 0.20, blue: 0.93 }
};

const rgb = c => ({ rgbColor: c });
const gridRange = (sheetId, r1, r2, c1, c2) => ({
  sheetId,
  startRowIndex: r1,
  endRowIndex: r2,
  startColumnIndex: c1,
  endColumnIndex: c2
});

function width(sheetId, col, pixels) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 },
      properties: { pixelSize: pixels },
      fields: "pixelSize"
    }
  };
}

function rowHeight(sheetId, row, pixels) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "ROWS", startIndex: row, endIndex: row + 1 },
      properties: { pixelSize: pixels },
      fields: "pixelSize"
    }
  };
}

function body(sheetId, cols) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: {
        userEnteredFormat: {
          backgroundColorStyle: rgb(COLORS.black),
          textFormat: { foregroundColorStyle: rgb(COLORS.white), fontSize: 10 },
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          borders: { bottom: { style: "SOLID", colorStyle: rgb(COLORS.charcoal) } }
        }
      },
      fields: "userEnteredFormat"
    }
  };
}

function header(sheetId, cols) {
  return {
    repeatCell: {
      range: gridRange(sheetId, 0, 1, 0, cols),
      cell: {
        userEnteredFormat: {
          backgroundColorStyle: rgb(COLORS.redDark),
          textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 11 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          borders: { bottom: { style: "SOLID_THICK", colorStyle: rgb(COLORS.red) } }
        }
      },
      fields: "userEnteredFormat"
    }
  };
}

function currency(sheetId, c1, c2) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: c1, endColumnIndex: c2 },
      cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0;-$#,##0" } } },
      fields: "userEnteredFormat.numberFormat"
    }
  };
}

function datetime(sheetId, c1, c2) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: c1, endColumnIndex: c2 },
      cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd-mm-yyyy HH:mm" } } },
      fields: "userEnteredFormat.numberFormat"
    }
  };
}

function conditionalText(sheetId, col, text, bg, fg = COLORS.white) {
  return {
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 }],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: text }] },
          format: {
            backgroundColorStyle: rgb(bg),
            textFormat: { foregroundColorStyle: rgb(fg), bold: true },
            horizontalAlignment: "CENTER"
          }
        }
      }
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
    [TABS.payments]: { cols: 10, widths: [135, 100, 170, 170, 110, 120, 165, 165, 165, 250] },
    [TABS.expenses]: { cols: 10, widths: [135, 165, 110, 145, 280, 170, 165, 130, 120, 240] },
    [TABS.transactions]: { cols: 9, widths: [145, 165, 175, 115, 170, 175, 300, 155, 135] },
    [TABS.logs]: { cols: 6, widths: [170, 210, 175, 175, 390, 170] },
    [TABS.members]: { cols: 7, widths: [185, 210, 165, 250, 120, 135, 180] },
    [TABS.settings]: { cols: 2, widths: [250, 420] }
  };

  for (const [title, cfg] of Object.entries(schemas)) {
    const p = byTitle.get(title);
    if (!p) continue;
    requests.push(
      {
        updateSheetProperties: {
          properties: {
            sheetId: p.sheetId,
            gridProperties: { frozenRowCount: 1, hideGridlines: true },
            tabColorStyle: rgb(title === TABS.settings ? COLORS.gray : title === TABS.members ? COLORS.purple : COLORS.red)
          },
          fields: "gridProperties.frozenRowCount,gridProperties.hideGridlines,tabColorStyle"
        }
      },
      header(p.sheetId, cfg.cols),
      body(p.sheetId, cfg.cols),
      rowHeight(p.sheetId, 0, 38)
    );
    cfg.widths.forEach((w, i) => requests.push(width(p.sheetId, i, w)));
  }

  const payments = byTitle.get(TABS.payments);
  if (payments) requests.push(
    currency(payments.sheetId, 4, 5),
    datetime(payments.sheetId, 6, 8),
    conditionalText(payments.sheetId, 5, "APPROVED", COLORS.greenDark, COLORS.green),
    conditionalText(payments.sheetId, 5, "REVERSED", COLORS.redDark, { red: 1, green: 0.35, blue: 0.35 })
  );

  const expenses = byTitle.get(TABS.expenses);
  if (expenses) requests.push(
    currency(expenses.sheetId, 2, 3),
    currency(expenses.sheetId, 7, 8),
    datetime(expenses.sheetId, 1, 2),
    conditionalText(expenses.sheetId, 8, "ACTIVE", COLORS.greenDark, COLORS.green),
    conditionalText(expenses.sheetId, 8, "REVERSED", COLORS.redDark, { red: 1, green: 0.35, blue: 0.35 })
  );

  const transactions = byTitle.get(TABS.transactions);
  if (transactions) requests.push(
    currency(transactions.sheetId, 3, 4),
    currency(transactions.sheetId, 8, 9),
    datetime(transactions.sheetId, 1, 2)
  );

  const logs = byTitle.get(TABS.logs);
  if (logs) requests.push(datetime(logs.sheetId, 0, 1));

  const members = byTitle.get(TABS.members);
  if (members) requests.push(
    conditionalText(members.sheetId, 4, "BETAALD", COLORS.greenDark, COLORS.green),
    conditionalText(members.sheetId, 4, "OPENSTAAND", COLORS.amberDark, COLORS.amber)
  );

  const dashboard = byTitle.get(TABS.dashboard);
  if (dashboard) {
    const sid = dashboard.sheetId;
    requests.push(
      {
        updateSheetProperties: {
          properties: {
            sheetId: sid,
            gridProperties: { hideGridlines: true, frozenRowCount: 2 },
            tabColorStyle: rgb(COLORS.red)
          },
          fields: "gridProperties.hideGridlines,gridProperties.frozenRowCount,tabColorStyle"
        }
      },
      { repeatCell: { range: { sheetId: sid }, cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.black), textFormat: { foregroundColorStyle: rgb(COLORS.white) } } }, fields: "userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat" } },
      { unmergeCells: { range: gridRange(sid, 0, 14, 0, 8) } },
      { mergeCells: { range: gridRange(sid, 0, 2, 0, 8), mergeType: "MERGE_ALL" } },
      { repeatCell: { range: gridRange(sid, 0, 2, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.redDark), textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 20 }, verticalAlignment: "MIDDLE", horizontalAlignment: "LEFT" } }, fields: "userEnteredFormat" } },
      { mergeCells: { range: gridRange(sid, 2, 3, 0, 8), mergeType: "MERGE_ALL" } },
      { repeatCell: { range: gridRange(sid, 2, 3, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.charcoal), textFormat: { foregroundColorStyle: rgb(COLORS.muted), italic: true, fontSize: 10 } } }, fields: "userEnteredFormat" } },
      { mergeCells: { range: gridRange(sid, 9, 10, 0, 8), mergeType: "MERGE_ALL" } },
      { repeatCell: { range: gridRange(sid, 9, 10, 0, 8), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.redDark), textFormat: { foregroundColorStyle: rgb(COLORS.white), bold: true, fontSize: 12 } } }, fields: "userEnteredFormat" } },
      rowHeight(sid, 0, 34), rowHeight(sid, 1, 34), rowHeight(sid, 2, 28), rowHeight(sid, 9, 32)
    );

    const cards = [[0,2,COLORS.purple],[2,4,COLORS.green],[4,6,COLORS.red],[6,8,COLORS.blue]];
    for (const [c1,c2,accent] of cards) {
      requests.push(
        { mergeCells: { range: gridRange(sid, 4, 5, c1, c2), mergeType: "MERGE_ALL" } },
        { mergeCells: { range: gridRange(sid, 5, 7, c1, c2), mergeType: "MERGE_ALL" } },
        { repeatCell: { range: gridRange(sid, 4, 5, c1, c2), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.panel), textFormat: { foregroundColorStyle: rgb(COLORS.muted), bold: true, fontSize: 10 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", borders: { top: { style: "SOLID_THICK", colorStyle: rgb(accent) } } } }, fields: "userEnteredFormat" } },
        { repeatCell: { range: gridRange(sid, 5, 7, c1, c2), cell: { userEnteredFormat: { backgroundColorStyle: rgb(COLORS.panel), textFormat: { foregroundColorStyle: rgb(accent), bold: true, fontSize: 18 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat" } }
      );
    }

    [155,155,155,155,155,155,155,155].forEach((w,i) => requests.push(width(sid,i,w)));
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
}

module.exports = { formatSpreadsheet };
