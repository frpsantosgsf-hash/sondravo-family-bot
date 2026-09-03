const { google } = require("googleapis");
const { formatSpreadsheet } = require("./sheet-style");

const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1-LrKifCSiMdv4e5cToaC6nsW5F8LI0C7VueRkbhCeQs";
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const TABS = {
  dashboard: "Dashboard",
  payments: "Weekbetalingen",
  expenses: "Uitgaven",
  transactions: "Transacties",
  logs: "Logs",
  settings: "Settings"
};

async function run() {
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON ontbreekt.");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  await formatSpreadsheet(sheets, spreadsheetId, TABS);
  console.log("✅ Sondravo Google Sheet professioneel opgemaakt.");
}

run().catch(err => {
  console.error("❌ Sheet formatting mislukt:", err.message);
  process.exitCode = 1;
});
