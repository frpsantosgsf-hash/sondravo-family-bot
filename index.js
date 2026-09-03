const {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, StringSelectMenuBuilder
} = require("discord.js");
const { google } = require("googleapis");
const http = require("http");

// ===== RENDER HEALTH SERVER =====
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Sondravo Family Bot is online");
}).listen(port, () => console.log(`✅ Web server luistert op poort ${port}`));

// ===== CONFIG =====
const CFG = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID || "1545007793927495750",
  guildId: process.env.DISCORD_GUILD_ID || "1488178372298408113",
  founderRoleId: process.env.FOUNDER_ROLE_ID || "1488178372721901807",
  mpikambanaRoleId: process.env.MPIKAMBANA_ROLE_ID || "1488178372700803238",
  familyRoleId: process.env.FAMILY_ROLE_ID || "1488178372700803233",
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || "1-LrKifCSiMdv4e5cToaC6nsW5F8LI0C7VueRkbhCeQs",
  serviceJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  gangName: process.env.GANG_NAME || "Sondravo Family",
  currency: process.env.CURRENCY || "$",
  weeklyAmount: Number(process.env.WEEKLY_AMOUNT || 50000),
  embedColor: Number.parseInt((process.env.EMBED_COLOR || "#8B0000").replace("#", ""), 16),
  footer: process.env.FOOTER_TEXT || "Sondravo Family • Management System"
};

if (!CFG.token) throw new Error("DISCORD_TOKEN ontbreekt.");
if (!CFG.serviceJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON ontbreekt.");

let googleCredentials;
try { googleCredentials = JSON.parse(CFG.serviceJson); }
catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is geen geldige JSON."); }

const auth = new google.auth.GoogleAuth({
  credentials: googleCredentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });

const TABS = {
  dashboard: "Dashboard",
  payments: "Weekbetalingen",
  expenses: "Uitgaven",
  transactions: "Transacties",
  logs: "Logs",
  settings: "Settings"
};

async function ensureSheets() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: CFG.spreadsheetId, fields: "sheets.properties" });
  const existing = new Set((meta.data.sheets || []).map(s => s.properties.title));
  const requests = Object.values(TABS).filter(title => !existing.has(title)).map(title => ({ addSheet: { properties: { title } } }));
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: CFG.spreadsheetId, requestBody: { requests } });

  const headers = [
    [TABS.dashboard, "A1:B6", [["Sondravo Family Dashboard", ""],["Laatste update", ""],["Huidig saldo", ""],["Totaal inkomsten", ""],["Totaal uitgaven", ""],["Weekpot tarief", CFG.weeklyAmount]]],
    [TABS.payments, "A1:J1", [["Payment ID","Week","Discord ID","Discord naam","Bedrag","Status","Aangemaakt op","Verwerkt op","Aangemaakt door","Opmerking"]]],
    [TABS.expenses, "A1:J1", [["Expense ID","Datum","Bedrag","Categorie","Omschrijving","Toegevoegd door ID","Toegevoegd door","Saldo na uitgave","Status","Opmerking"]]],
    [TABS.transactions, "A1:I1", [["Transaction ID","Datum","Type","Bedrag","Discord ID","Discord naam","Omschrijving","Referentie","Saldo na transactie"]]],
    [TABS.logs, "A1:F1", [["Datum","Actie","Actor ID","Actor naam","Details","Referentie"]]],
    [TABS.settings, "A1:B4", [["Key","Value"],["dashboard_channel_id",""],["dashboard_message_id",""],["active_week",""]]]
  ];

  for (const [tab, range, values] of headers) {
    await sheets.spreadsheets.values.update({ spreadsheetId: CFG.spreadsheetId, range: `${tab}!${range}`, valueInputOption: "USER_ENTERED", requestBody: { values } });
  }
}

async function getRows(tab, range="A2:Z") {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: CFG.spreadsheetId, range: `${tab}!${range}` });
  return res.data.values || [];
}
async function append(tab, values) {
  await sheets.spreadsheets.values.append({ spreadsheetId: CFG.spreadsheetId, range: `${tab}!A:Z`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: [values] } });
}
async function setSetting(key, value) {
  const rows = await getRows(TABS.settings, "A2:B");
  const idx = rows.findIndex(r => r[0] === key);
  if (idx >= 0) await sheets.spreadsheets.values.update({ spreadsheetId: CFG.spreadsheetId, range: `${TABS.settings}!B${idx+2}`, valueInputOption: "USER_ENTERED", requestBody: { values: [[String(value || "")]] } });
  else await append(TABS.settings, [key, String(value || "")]);
}
async function getSetting(key) {
  const rows = await getRows(TABS.settings, "A2:B");
  const row = rows.find(r => r[0] === key);
  return row ? row[1] || "" : "";
}
function num(v) {
  const n = Number(String(v ?? 0).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
async function totals() {
  const rows = await getRows(TABS.transactions, "A2:I");
  let income = 0, expense = 0;
  for (const r of rows) {
    const type = String(r[2] || "").toUpperCase();
    const amount = num(r[3]);
    if (["WEEKBETALING","INKOMST","CORRECTIE_PLUS","UITGAVE_TERUG"].includes(type)) income += amount;
    if (["UITGAVE","CORRECTIE_MIN","WEEKBETALING_TERUG"].includes(type)) expense += amount;
  }
  return { income, expense, balance: income - expense };
}
async function addTransaction({ id, type, amount, userId, userName, description, reference }) {
  const t = await totals();
  const minus = ["UITGAVE","CORRECTIE_MIN","WEEKBETALING_TERUG"].includes(type);
  const newBalance = t.balance + (minus ? -amount : amount);
  await append(TABS.transactions, [id, new Date().toISOString(), type, amount, userId || "", userName || "", description || "", reference || "", newBalance]);
  return newBalance;
}
async function addLog(action, actor, details, reference="") {
  await append(TABS.logs, [new Date().toISOString(), action, actor?.id || "", actor?.username || "", details || "", reference]);
}

function money(v) { return `${CFG.currency}${Math.round(Number(v || 0)).toLocaleString("nl-NL")}`; }
function id(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 10)}`; }
function weekKey(d=new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - start) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function nextWeekKey(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return weekKey();
  let year = Number(m[1]);
  let w = Number(m[2]) + 1;
  if (w > 53) { year += 1; w = 1; }
  return `${year}-W${String(w).padStart(2, "0")}`;
}
async function activeWeek() {
  const saved = await getSetting("active_week");
  return saved || weekKey();
}
function baseEmbed() { return new EmbedBuilder().setColor(CFG.embedColor).setFooter({ text: CFG.footer }).setTimestamp(); }
function hasRole(i, roleId) { return !!i.member?.roles?.cache?.has(roleId); }
function isFounder(i) { return i.guild?.ownerId === i.user.id || hasRole(i, CFG.founderRoleId); }
function isFamily(i) { return isFounder(i) || hasRole(i, CFG.mpikambanaRoleId) || hasRole(i, CFG.familyRoleId); }
function requireFounder(i) { if (!isFounder(i)) throw new Error("Alleen Founder kan dit doen."); }
function requireFamily(i) { if (!isFamily(i)) throw new Error("Je hebt geen toegang tot Sondravo Management."); }

// Geen guild.members.fetch() bij iedere klik: gebruik de lokale Discord cache.
function familyMembers(guild) {
  return guild.members.cache.filter(m => !m.user.bot && (m.roles.cache.has(CFG.familyRoleId) || m.roles.cache.has(CFG.mpikambanaRoleId) || m.roles.cache.has(CFG.founderRoleId)));
}

async function approvedForWeek(userId, week) {
  const rows = await getRows(TABS.payments, "A2:J");
  return rows.some(r => r[1] === week && r[2] === userId && String(r[5] || "").toUpperCase() === "APPROVED");
}
async function registerWeekPayment(member, week, actor) {
  if (await approvedForWeek(member.id, week)) throw new Error("Deze persoon staat deze week al op betaald.");
  const paymentId = id("pay");
  const now = new Date().toISOString();
  await append(TABS.payments, [paymentId, week, member.id, member.user.username, CFG.weeklyAmount, "APPROVED", now, now, actor.username, "Door leiding aangemaakt"]);
  const balance = await addTransaction({ id: id("tx"), type: "WEEKBETALING", amount: CFG.weeklyAmount, userId: member.id, userName: member.user.username, description: `Weekpot ${week}`, reference: paymentId });
  await addLog("WEEKBETALING_AANGEMAAKT", actor, `${member.user.username} • ${week} • ${money(CFG.weeklyAmount)}`, paymentId);
  return { paymentId, balance };
}
async function reversePayment(paymentId, actor) {
  const rows = await getRows(TABS.payments, "A2:J");
  const idx = rows.findIndex(r => r[0] === paymentId);
  if (idx < 0) throw new Error("Betaling niet gevonden.");
  const r = rows[idx];
  if (String(r[5] || "").toUpperCase() !== "APPROVED") throw new Error("Deze betaling is al teruggedraaid.");
  await sheets.spreadsheets.values.update({ spreadsheetId: CFG.spreadsheetId, range: `${TABS.payments}!F${idx+2}:J${idx+2}`, valueInputOption: "USER_ENTERED", requestBody: { values: [["REVERSED", r[6] || "", new Date().toISOString(), actor.username, "TERUGGEDRAAID door Founder"]] } });
  const balance = await addTransaction({ id: id("tx"), type: "WEEKBETALING_TERUG", amount: num(r[4]) || CFG.weeklyAmount, userId: r[2], userName: r[3], description: `Terugdraaiing weekpot ${r[1]}`, reference: paymentId });
  await addLog("WEEKBETALING_TERUGGEDRAAID", actor, `${r[3]} • ${r[1]} • ${money(num(r[4]) || CFG.weeklyAmount)}`, paymentId);
  return balance;
}
async function reverseExpense(expenseId, actor) {
  const rows = await getRows(TABS.expenses, "A2:J");
  const idx = rows.findIndex(r => r[0] === expenseId);
  if (idx < 0) throw new Error("Uitgave niet gevonden.");
  const r = rows[idx];
  if (String(r[8] || "ACTIVE").toUpperCase() === "REVERSED") throw new Error("Deze uitgave is al teruggedraaid.");
  await sheets.spreadsheets.values.update({ spreadsheetId: CFG.spreadsheetId, range: `${TABS.expenses}!I${idx+2}:J${idx+2}`, valueInputOption: "USER_ENTERED", requestBody: { values: [["REVERSED", `TERUGGEDRAAID door ${actor.username} op ${new Date().toISOString()}`]] } });
  const balance = await addTransaction({ id: id("tx"), type: "UITGAVE_TERUG", amount: num(r[2]), userId: actor.id, userName: actor.username, description: `Terugdraaiing uitgave: ${r[3]} • ${r[4]}`, reference: expenseId });
  await addLog("UITGAVE_TERUGGEDRAAID", actor, `${money(num(r[2]))} • ${r[3]} • ${r[4]}`, expenseId);
  return balance;
}

function dashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sf:pot").setLabel("Gangpot").setEmoji("💰").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:week").setLabel("Weekpot beheren").setEmoji("💵").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("sf:expense").setLabel("Uitgave").setEmoji("💸").setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sf:members").setLabel("Leden").setEmoji("👥").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:overview").setLabel("Overzicht").setEmoji("📊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:logs").setLabel("Logs").setEmoji("📜").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:admin").setLabel("Founder beheer").setEmoji("⚙️").setStyle(ButtonStyle.Secondary)
    )
  ];
}
async function dashboardData(guild) {
  const t = await totals();
  const members = familyMembers(guild);
  const week = await activeWeek();
  const rows = await getRows(TABS.payments, "A2:J");
  const paidIds = new Set(rows.filter(r => r[1] === week && String(r[5] || "").toUpperCase() === "APPROVED").map(r => r[2]));
  const paid = [...members.values()].filter(m => paidIds.has(m.id)).length;
  await sheets.spreadsheets.values.update({ spreadsheetId: CFG.spreadsheetId, range: `${TABS.dashboard}!A2:B6`, valueInputOption: "USER_ENTERED", requestBody: { values: [["Laatste update", new Date().toISOString()],["Huidig saldo", t.balance],["Totaal inkomsten", t.income],["Totaal uitgaven", t.expense],["Weekpot tarief", CFG.weeklyAmount]] } });
  return { ...t, totalMembers: members.size, paid, week };
}
function dashboardEmbed(data) {
  const open = Math.max(0, data.totalMembers - data.paid);
  return baseEmbed().setTitle(`🩸 ${CFG.gangName.toUpperCase()}`).setDescription("**Management Panel**\nAlleen de leiding registreert weekbetalingen en uitgaven.").addFields(
    { name: "💰 Gangpot", value: `**${money(data.balance)}**`, inline: true },
    { name: "💵 Weekpot", value: `${money(CFG.weeklyAmount)} p.p.`, inline: true },
    { name: `📅 ${data.week}`, value: `✅ ${data.paid}/${data.totalMembers} betaald\n⏳ ${open} openstaand`, inline: true },
    { name: "📈 Inkomsten", value: money(data.income), inline: true },
    { name: "📉 Uitgaven", value: money(data.expense), inline: true },
    { name: "🔒 Beheer", value: "Founder kan weken en transacties beheren.", inline: true }
  );
}
async function refreshDashboard(guild) {
  const channelId = await getSetting("dashboard_channel_id");
  const messageId = await getSetting("dashboard_message_id");
  if (!channelId || !messageId) return;
  try {
    const ch = await guild.channels.fetch(channelId);
    const msg = await ch.messages.fetch(messageId);
    await msg.edit({ embeds: [dashboardEmbed(await dashboardData(guild))], components: dashboardButtons() });
  } catch {}
}

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Plaats het Sondravo management dashboard."),
  new SlashCommandBuilder().setName("saldo").setDescription("Bekijk de huidige gangpot."),
  new SlashCommandBuilder().setName("correctie").setDescription("Founder: corrigeer de gangpot.")
    .addStringOption(o => o.setName("richting").setDescription("Plus of min").setRequired(true).addChoices({ name: "Plus", value: "plus" }, { name: "Min", value: "min" }))
    .addNumberOption(o => o.setName("bedrag").setDescription("Bedrag").setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName("reden").setDescription("Reden").setRequired(true))
].map(c => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.once(Events.ClientReady, async c => {
  console.log(`✅ Online als ${c.user.tag}`);
  await ensureSheets();
  const guild = c.guilds.cache.get(CFG.guildId);
  if (guild && guild.members.cache.size < 2) {
    try { await guild.members.fetch({ time: 15000 }); }
    catch (e) { console.warn("⚠️ Member preload overgeslagen:", e.message); }
  }
  const rest = new REST({ version: "10" }).setToken(CFG.token);
  await rest.put(Routes.applicationGuildCommands(CFG.clientId, CFG.guildId), { body: commands });
  console.log("✅ Slash commands geregistreerd.");
  if (guild) await refreshDashboard(guild);
});

client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isChatInputCommand()) {
      requireFamily(i);
      if (i.commandName === "setup") {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });
        const msg = await i.channel.send({ embeds: [dashboardEmbed(await dashboardData(i.guild))], components: dashboardButtons() });
        await setSetting("dashboard_channel_id", i.channel.id);
        await setSetting("dashboard_message_id", msg.id);
        await addLog("SETUP", i.user, `Dashboard geplaatst in #${i.channel.name}`, msg.id);
        await i.editReply("✅ Dashboard geplaatst.");
        return;
      }
      if (i.commandName === "saldo") {
        const t = await totals();
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle("💰 Sondravo Gangpot").setDescription(`Huidig saldo: **${money(t.balance)}**`).addFields({ name: "Inkomsten", value: money(t.income), inline: true },{ name: "Uitgaven", value: money(t.expense), inline: true })] });
        return;
      }
      if (i.commandName === "correctie") {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });
        const richting = i.options.getString("richting");
        const bedrag = i.options.getNumber("bedrag");
        const reden = i.options.getString("reden");
        const txId = id("corr");
        const balance = await addTransaction({ id: txId, type: richting === "plus" ? "CORRECTIE_PLUS" : "CORRECTIE_MIN", amount: bedrag, userId: i.user.id, userName: i.user.username, description: reden, reference: "manual" });
        await addLog("CORRECTIE", i.user, `${richting} ${money(bedrag)} • ${reden}`, txId);
        await refreshDashboard(i.guild);
        await i.editReply(`✅ Correctie verwerkt. Nieuw saldo: **${money(balance)}**`);
        return;
      }
    }

    if (i.isButton()) {
      requireFamily(i);

      if (i.customId === "sf:pot") {
        const t = await totals();
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle("💰 Gangpot").setDescription(`Beschikbaar: **${money(t.balance)}**`).addFields({ name: "📈 Totaal binnen", value: money(t.income), inline: true },{ name: "📉 Totaal eruit", value: money(t.expense), inline: true })] });
        return;
      }

      if (i.customId === "sf:week") {
        requireFounder(i);
        const week = await activeWeek();
        const members = familyMembers(i.guild);
        const rows = await getRows(TABS.payments, "A2:J");
        const paidIds = new Set(rows.filter(r => r[1] === week && String(r[5] || "").toUpperCase() === "APPROVED").map(r => r[2]));
        const paid = [...members.values()].filter(m => paidIds.has(m.id)).length;
        const open = Math.max(0, members.size - paid);
        const button = new ButtonBuilder().setCustomId(`sf:week:new:${week}`).setLabel("Nieuwe betaling aanmaken").setEmoji("➕").setStyle(ButtonStyle.Success).setDisabled(open === 0);
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle(`💵 Weekpot beheren • ${week}`).setDescription(`Bedrag per persoon: **${money(CFG.weeklyAmount)}**\n✅ Betaald: **${paid}/${members.size}**\n⏳ Openstaand: **${open}**\n\nKlik op **Nieuwe betaling aanmaken** en kies daarna de persoon die betaald heeft.`)], components: [new ActionRowBuilder().addComponents(button)] });
        return;
      }

      if (i.customId.startsWith("sf:week:new:")) {
        requireFounder(i);
        const week = i.customId.split(":")[3];
        const members = familyMembers(i.guild);
        const rows = await getRows(TABS.payments, "A2:J");
        const paidIds = new Set(rows.filter(r => r[1] === week && String(r[5] || "").toUpperCase() === "APPROVED").map(r => r[2]));
        const unpaid = [...members.values()].filter(m => !paidIds.has(m.id)).sort((a,b) => a.displayName.localeCompare(b.displayName));
        if (!unpaid.length) {
          await i.update({ content: `✅ Iedereen staat voor **${week}** op betaald.`, embeds: [], components: [] });
          return;
        }
        const options = unpaid.slice(0, 25).map(m => ({ label: m.displayName.slice(0, 100), description: `${money(CFG.weeklyAmount)} weekbetaling`, value: m.id }));
        const select = new StringSelectMenuBuilder().setCustomId(`sf:week:pick:${week}`).setPlaceholder("Kies één persoon die heeft betaald...").setMinValues(1).setMaxValues(1).addOptions(options);
        await i.update({ embeds: [baseEmbed().setTitle("➕ Nieuwe weekbetaling").setDescription(`Week: **${week}**\nBedrag: **${money(CFG.weeklyAmount)}**\n\nKies nu de persoon die betaald heeft.`)], components: [new ActionRowBuilder().addComponents(select)] });
        return;
      }

      if (i.customId === "sf:expense") {
        requireFounder(i);
        const modal = new ModalBuilder().setCustomId("sf:modal:expense").setTitle("Nieuwe Sondravo uitgave");
        const amount = new TextInputBuilder().setCustomId("amount").setLabel("Bedrag").setPlaceholder("Bijv. 450000").setStyle(TextInputStyle.Short).setRequired(true);
        const category = new TextInputBuilder().setCustomId("category").setLabel("Categorie").setPlaceholder("Auto / Wapen / Event / Overig").setStyle(TextInputStyle.Short).setRequired(true);
        const desc = new TextInputBuilder().setCustomId("description").setLabel("Omschrijving").setPlaceholder("Bijv. Sultan RS voor de family").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(amount),new ActionRowBuilder().addComponents(category),new ActionRowBuilder().addComponents(desc));
        await i.showModal(modal);
        return;
      }

      if (i.customId === "sf:members") {
        requireFounder(i);
        const members = familyMembers(i.guild);
        const week = await activeWeek();
        const rows = await getRows(TABS.payments, "A2:J");
        const paid = new Set(rows.filter(r => r[1] === week && String(r[5] || "").toUpperCase() === "APPROVED").map(r => r[2]));
        const lines = [...members.values()].sort((a,b) => a.displayName.localeCompare(b.displayName)).slice(0, 40).map(m => `${paid.has(m.id) ? "✅" : "⏳"} <@${m.id}>`);
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle(`👥 Leden • ${week}`).setDescription(lines.join("\n") || "Geen family-leden gevonden.")] });
        return;
      }

      if (i.customId === "sf:overview") {
        requireFounder(i);
        const rows = (await getRows(TABS.transactions, "A2:I")).slice(-10).reverse();
        const lines = rows.map(r => { const minus = ["UITGAVE","CORRECTIE_MIN","WEEKBETALING_TERUG"].includes(String(r[2] || "").toUpperCase()); return `${minus ? "🔴" : "🟢"} **${r[2]}** ${minus ? "-" : "+"}${money(r[3])}\n> ${r[6] || "-"} • saldo ${money(r[8] || 0)}`; });
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle("📊 Laatste transacties").setDescription(lines.join("\n\n") || "Nog geen transacties.")] });
        return;
      }

      if (i.customId === "sf:logs") {
        requireFounder(i);
        const rows = (await getRows(TABS.logs, "A2:F")).slice(-15).reverse();
        const lines = rows.map(r => `**${r[1]}** • ${r[4] || "-"}\n> door ${r[3] || r[2] || "onbekend"}`);
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle("📜 Beheerlogs").setDescription(lines.join("\n\n") || "Nog geen logs.")] });
        return;
      }

      if (i.customId === "sf:admin") {
        requireFounder(i);
        const week = await activeWeek();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("sf:admin:newweek").setLabel("Nieuwe week starten").setEmoji("📅").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("sf:admin:revertpay").setLabel("Betaling terugdraaien").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("sf:admin:revertexp").setLabel("Uitgave terugdraaien").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
        );
        await i.reply({ ephemeral: true, embeds: [baseEmbed().setTitle("⚙️ Founder beheer").setDescription(`Actieve week: **${week}**\n\nAlles wat je terugdraait blijft zichtbaar in Google Sheets en wordt gelogd.`)], components: [row] });
        return;
      }

      if (i.customId === "sf:admin:newweek") {
        requireFounder(i);
        const current = await activeWeek();
        const next = nextWeekKey(current);
        await setSetting("active_week", next);
        await addLog("NIEUWE_WEEK", i.user, `${current} → ${next}`, next);
        await refreshDashboard(i.guild);
        await i.update({ embeds: [baseEmbed().setTitle("📅 Nieuwe week gestart").setDescription(`De actieve week is nu **${next}**.\nIedereen staat voor deze week weer openstaand.`)], components: [] });
        return;
      }

      if (i.customId === "sf:admin:revertpay") {
        requireFounder(i);
        const rows = await getRows(TABS.payments, "A2:J");
        const active = rows.filter(r => String(r[5] || "").toUpperCase() === "APPROVED").slice(-25).reverse();
        if (!active.length) { await i.update({ content: "Er zijn geen actieve betalingen om terug te draaien.", embeds: [], components: [] }); return; }
        const options = active.map(r => ({ label: `${r[3]} • ${r[1]}`.slice(0,100), description: `${money(r[4])} terugdraaien`, value: r[0] }));
        const select = new StringSelectMenuBuilder().setCustomId("sf:admin:revertpay:pick").setPlaceholder("Kies een betaling...").addOptions(options);
        await i.update({ embeds: [baseEmbed().setTitle("↩️ Betaling terugdraaien").setDescription("Kies de betaling die je wilt terugdraaien. Het bedrag gaat van de gangpot af en de persoon staat weer open voor die week.")], components: [new ActionRowBuilder().addComponents(select)] });
        return;
      }

      if (i.customId === "sf:admin:revertexp") {
        requireFounder(i);
        const rows = await getRows(TABS.expenses, "A2:J");
        const active = rows.filter(r => String(r[8] || "ACTIVE").toUpperCase() !== "REVERSED").slice(-25).reverse();
        if (!active.length) { await i.update({ content: "Er zijn geen actieve uitgaven om terug te draaien.", embeds: [], components: [] }); return; }
        const options = active.map(r => ({ label: `${r[3]} • ${money(r[2])}`.slice(0,100), description: String(r[4] || "Uitgave").slice(0,100), value: r[0] }));
        const select = new StringSelectMenuBuilder().setCustomId("sf:admin:revertexp:pick").setPlaceholder("Kies een uitgave...").addOptions(options);
        await i.update({ embeds: [baseEmbed().setTitle("🗑️ Uitgave terugdraaien").setDescription("Kies een uitgave. Het bedrag komt terug in de gangpot en de originele regel wordt in Sheets als REVERSED gemarkeerd.")], components: [new ActionRowBuilder().addComponents(select)] });
        return;
      }
    }

    if (i.isStringSelectMenu()) {
      requireFamily(i);

      if (i.customId.startsWith("sf:week:pick:")) {
        requireFounder(i);
        await i.deferUpdate();
        const week = i.customId.split(":")[3];
        const memberId = i.values[0];
        const member = i.guild.members.cache.get(memberId);
        if (!member) throw new Error("Lid niet gevonden in de cache. Wacht even na een bot-herstart en probeer opnieuw.");
        const result = await registerWeekPayment(member, week, i.user);
        await refreshDashboard(i.guild);
        await i.editReply({ embeds: [baseEmbed().setTitle("✅ Betaling aangemaakt").setDescription(`👤 Persoon: <@${member.id}>\n📅 Week: **${week}**\n💵 Bedrag: **${money(CFG.weeklyAmount)}**\n💰 Nieuwe gangpot: **${money(result.balance)}**\n\nDe betaling staat ook in Google Sheets.`)], components: [] });
        return;
      }

      if (i.customId === "sf:admin:revertpay:pick") {
        requireFounder(i);
        await i.deferUpdate();
        const balance = await reversePayment(i.values[0], i.user);
        await refreshDashboard(i.guild);
        await i.editReply({ embeds: [baseEmbed().setTitle("↩️ Betaling teruggedraaid").setDescription(`De betaling is als **REVERSED** gemarkeerd.\nNieuwe gangpot: **${money(balance)}**`)], components: [] });
        return;
      }

      if (i.customId === "sf:admin:revertexp:pick") {
        requireFounder(i);
        await i.deferUpdate();
        const balance = await reverseExpense(i.values[0], i.user);
        await refreshDashboard(i.guild);
        await i.editReply({ embeds: [baseEmbed().setTitle("🗑️ Uitgave teruggedraaid").setDescription(`De uitgave is als **REVERSED** gemarkeerd en het bedrag is teruggezet.\nNieuwe gangpot: **${money(balance)}**`)], components: [] });
        return;
      }
    }

    if (i.isModalSubmit()) {
      requireFamily(i);
      if (i.customId === "sf:modal:expense") {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });
        const amount = Number(i.fields.getTextInputValue("amount").replace(/[^\d.]/g, ""));
        const category = i.fields.getTextInputValue("category").trim();
        const description = i.fields.getTextInputValue("description").trim();
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Vul een geldig bedrag in.");
        const txId = id("exp");
        const balance = await addTransaction({ id: txId, type: "UITGAVE", amount, userId: i.user.id, userName: i.user.username, description: `${category} • ${description}`, reference: txId });
        await append(TABS.expenses, [txId, new Date().toISOString(), amount, category, description, i.user.id, i.user.username, balance, "ACTIVE", ""]);
        await addLog("UITGAVE", i.user, `${money(amount)} • ${category} • ${description}`, txId);
        await refreshDashboard(i.guild);
        await i.editReply(`✅ Uitgave opgeslagen. Nieuw saldo: **${money(balance)}**`);
        return;
      }
    }
  } catch (err) {
    console.error(err);
    const msg = `❌ ${err.message || "Er ging iets mis."}`;
    if (i.deferred || i.replied) await i.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else await i.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.login(CFG.token);
