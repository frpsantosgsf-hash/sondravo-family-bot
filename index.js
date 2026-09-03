const {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle
} = require("discord.js");
const { google } = require("googleapis");

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
try {
  googleCredentials = JSON.parse(CFG.serviceJson);
} catch {
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is geen geldige JSON.");
}

// ===== GOOGLE SHEETS =====
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
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: CFG.spreadsheetId,
    fields: "sheets.properties"
  });

  const existing = new Set((meta.data.sheets || []).map(s => s.properties.title));
  const requests = Object.values(TABS)
    .filter(title => !existing.has(title))
    .map(title => ({ addSheet: { properties: { title } } }));

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CFG.spreadsheetId,
      requestBody: { requests }
    });
  }

  const headers = [
    [TABS.dashboard, "A1:B6", [
      ["Sondravo Family Dashboard", ""],
      ["Laatste update", ""],
      ["Huidig saldo", ""],
      ["Totaal inkomsten", ""],
      ["Totaal uitgaven", ""],
      ["Weekpot tarief", CFG.weeklyAmount]
    ]],
    [TABS.payments, "A1:J1", [[
      "Request ID","Week","Discord ID","Discord naam","Bedrag","Status",
      "Aangevraagd op","Behandeld op","Behandeld door","Opmerking"
    ]]],
    [TABS.expenses, "A1:H1", [[
      "Expense ID","Datum","Bedrag","Categorie","Omschrijving",
      "Toegevoegd door ID","Toegevoegd door","Saldo na uitgave"
    ]]],
    [TABS.transactions, "A1:I1", [[
      "Transaction ID","Datum","Type","Bedrag","Discord ID",
      "Discord naam","Omschrijving","Referentie","Saldo na transactie"
    ]]],
    [TABS.logs, "A1:F1", [[
      "Datum","Actie","Actor ID","Actor naam","Details","Referentie"
    ]]],
    [TABS.settings, "A1:B4", [
      ["Key","Value"],
      ["dashboard_channel_id",""],
      ["dashboard_message_id",""],
      ["approval_channel_id",""]
    ]]
  ];

  for (const [tab, range, values] of headers) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CFG.spreadsheetId,
      range: `${tab}!${range}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values }
    });
  }
}

async function getRows(tab, range="A2:Z") {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CFG.spreadsheetId,
    range: `${tab}!${range}`
  });
  return res.data.values || [];
}

async function append(tab, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: CFG.spreadsheetId,
    range: `${tab}!A:Z`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] }
  });
}

async function setSetting(key, value) {
  const rows = await getRows(TABS.settings, "A2:B");
  const idx = rows.findIndex(r => r[0] === key);

  if (idx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CFG.spreadsheetId,
      range: `${TABS.settings}!B${idx+2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[String(value || "")]] }
    });
  } else {
    await append(TABS.settings, [key, String(value || "")]);
  }
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
    if (["WEEKBETALING","INKOMST","CORRECTIE_PLUS"].includes(type)) income += amount;
    if (["UITGAVE","CORRECTIE_MIN"].includes(type)) expense += amount;
  }
  return { income, expense, balance: income - expense };
}

async function addTransaction({ id, type, amount, userId, userName, description, reference }) {
  const t = await totals();
  const minus = ["UITGAVE","CORRECTIE_MIN"].includes(type);
  const newBalance = t.balance + (minus ? -amount : amount);

  await append(TABS.transactions, [
    id, new Date().toISOString(), type, amount,
    userId || "", userName || "", description || "", reference || "", newBalance
  ]);

  return newBalance;
}

async function addLog(action, actor, details, reference="") {
  await append(TABS.logs, [
    new Date().toISOString(),
    action,
    actor?.id || "",
    actor?.username || "",
    details || "",
    reference
  ]);
}

async function createPaymentRequest({ id, week, user, note }) {
  const rows = await getRows(TABS.payments, "A2:J");
  const duplicate = rows.find(r =>
    r[1] === week &&
    r[2] === user.id &&
    ["PENDING","APPROVED"].includes(String(r[5] || "").toUpperCase())
  );

  if (duplicate) {
    if (String(duplicate[5]).toUpperCase() === "APPROVED") {
      throw new Error("Je betaling voor deze week is al goedgekeurd.");
    }
    throw new Error("Je hebt voor deze week al een betaling in afwachting.");
  }

  await append(TABS.payments, [
    id, week, user.id, user.username, CFG.weeklyAmount,
    "PENDING", new Date().toISOString(), "", "", note || ""
  ]);
}

async function findPayment(id) {
  const rows = await getRows(TABS.payments, "A2:J");
  const i = rows.findIndex(r => r[0] === id);
  return i < 0 ? null : { row: rows[i], rowNumber: i + 2 };
}

async function updatePayment(id, status, founder) {
  const found = await findPayment(id);
  if (!found) throw new Error("Betaalaanvraag niet gevonden.");
  if (String(found.row[5] || "").toUpperCase() !== "PENDING") {
    throw new Error("Deze aanvraag is al behandeld.");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: CFG.spreadsheetId,
    range: `${TABS.payments}!F${found.rowNumber}:I${found.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[status, new Date().toISOString(), founder.username, founder.id]]
    }
  });

  return found.row;
}

async function approvedForWeek(userId, week) {
  const rows = await getRows(TABS.payments, "A2:J");
  return rows.some(r =>
    r[1] === week &&
    r[2] === userId &&
    String(r[5] || "").toUpperCase() === "APPROVED"
  );
}

// ===== HELPERS =====
function money(v) {
  return `${CFG.currency}${Math.round(Number(v || 0)).toLocaleString("nl-NL")}`;
}
function id(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function weekKey(d=new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - start) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function baseEmbed() {
  return new EmbedBuilder()
    .setColor(CFG.embedColor)
    .setFooter({ text: CFG.footer })
    .setTimestamp();
}
function hasRole(i, roleId) {
  return !!i.member?.roles?.cache?.has(roleId);
}
function isFounder(i) {
  return i.guild?.ownerId === i.user.id || hasRole(i, CFG.founderRoleId);
}
function isMpikambana(i) {
  return isFounder(i) || hasRole(i, CFG.mpikambanaRoleId);
}
function isFamily(i) {
  return isFounder(i) || isMpikambana(i) || hasRole(i, CFG.familyRoleId);
}
function requireFounder(i) {
  if (!isFounder(i)) throw new Error("Alleen Founder kan dit doen.");
}
function requireFamily(i) {
  if (!isFamily(i)) throw new Error("Je hebt geen toegang tot Sondravo Management.");
}
function requireMpikambana(i) {
  if (!isMpikambana(i)) throw new Error("Alleen Mpikambana of Founder kan dit gebruiken.");
}

function dashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sf:pot").setLabel("Gangpot").setEmoji("💰").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:week").setLabel("Weekpot").setEmoji("💵").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("sf:expense").setLabel("Uitgave").setEmoji("💸").setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sf:members").setLabel("Leden").setEmoji("👥").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:overview").setLabel("Overzicht").setEmoji("📊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sf:logs").setLabel("Logs").setEmoji("📜").setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function familyMembers(guild) {
  await guild.members.fetch();
  return guild.members.cache.filter(m =>
    !m.user.bot &&
    (
      m.roles.cache.has(CFG.familyRoleId) ||
      m.roles.cache.has(CFG.mpikambanaRoleId) ||
      m.roles.cache.has(CFG.founderRoleId)
    )
  );
}

async function dashboardData(guild) {
  const t = await totals();
  const members = await familyMembers(guild);
  const week = weekKey();
  const rows = await getRows(TABS.payments, "A2:J");
  const paidIds = new Set(
    rows
      .filter(r => r[1] === week && String(r[5] || "").toUpperCase() === "APPROVED")
      .map(r => r[2])
  );
  const paid = [...members.values()].filter(m => paidIds.has(m.id)).length;

  await sheets.spreadsheets.values.update({
    spreadsheetId: CFG.spreadsheetId,
    range: `${TABS.dashboard}!A2:B6`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [
      ["Laatste update", new Date().toISOString()],
      ["Huidig saldo", t.balance],
      ["Totaal inkomsten", t.income],
      ["Totaal uitgaven", t.expense],
      ["Weekpot tarief", CFG.weeklyAmount]
    ]}
  });

  return { ...t, totalMembers: members.size, paid };
}

function dashboardEmbed(data) {
  const open = Math.max(0, data.totalMembers - data.paid);
  return baseEmbed()
    .setTitle(`🩸 ${CFG.gangName.toUpperCase()}`)
    .setDescription("**Management Panel**\nBeheer de family-administratie via de knoppen hieronder.")
    .addFields(
      { name: "💰 Gangpot", value: `**${money(data.balance)}**`, inline: true },
      { name: "💵 Weekpot", value: `${money(CFG.weeklyAmount)} p.p.`, inline: true },
      { name: `📅 ${weekKey()}`, value: `✅ ${data.paid}/${data.totalMembers} betaald\n⏳ ${open} openstaand`, inline: true },
      { name: "📈 Inkomsten", value: money(data.income), inline: true },
      { name: "📉 Uitgaven", value: money(data.expense), inline: true },
      { name: "🔒 Beheer", value: "Founder beheert betalingen en uitgaven.", inline: true }
    );
}

async function refreshDashboard(guild) {
  const channelId = await getSetting("dashboard_channel_id");
  const messageId = await getSetting("dashboard_message_id");
  if (!channelId || !messageId) return;

  try {
    const ch = await guild.channels.fetch(channelId);
    const msg = await ch.messages.fetch(messageId);
    await msg.edit({
      embeds: [dashboardEmbed(await dashboardData(guild))],
      components: dashboardButtons()
    });
  } catch {}
}

// ===== DISCORD COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Plaats het Sondravo management dashboard."),
  new SlashCommandBuilder().setName("approvalkanaal").setDescription("Founder: stel dit kanaal in voor betaalgoedkeuringen."),
  new SlashCommandBuilder().setName("saldo").setDescription("Bekijk de huidige gangpot."),
  new SlashCommandBuilder()
    .setName("correctie")
    .setDescription("Founder: corrigeer de gangpot.")
    .addStringOption(o => o.setName("richting").setDescription("Plus of min").setRequired(true)
      .addChoices({ name: "Plus", value: "plus" }, { name: "Min", value: "min" }))
    .addNumberOption(o => o.setName("bedrag").setDescription("Bedrag").setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName("reden").setDescription("Reden").setRequired(true))
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, async c => {
  console.log(`✅ Online als ${c.user.tag}`);
  await ensureSheets();

  const rest = new REST({ version: "10" }).setToken(CFG.token);
  await rest.put(
    Routes.applicationGuildCommands(CFG.clientId, CFG.guildId),
    { body: commands }
  );

  console.log("✅ Slash commands geregistreerd.");
  const guild = await client.guilds.fetch(CFG.guildId).catch(() => null);
  if (guild) await refreshDashboard(guild);
});

client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isChatInputCommand()) {
      requireFamily(i);

      if (i.commandName === "setup") {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });

        const msg = await i.channel.send({
          embeds: [dashboardEmbed(await dashboardData(i.guild))],
          components: dashboardButtons()
        });

        await setSetting("dashboard_channel_id", i.channel.id);
        await setSetting("dashboard_message_id", msg.id);

        await addLog("SETUP", i.user, `Dashboard geplaatst in #${i.channel.name}`, msg.id);
        await i.editReply("✅ Dashboard geplaatst. Betaalgoedkeuringen blijven in het ingestelde leiding-kanaal.");
        return;
      }

      if (i.commandName === "approvalkanaal") {
        requireFounder(i);
        await setSetting("approval_channel_id", i.channel.id);
        await addLog("APPROVAL_KANAAL", i.user, `Goedkeuringskanaal ingesteld op #${i.channel.name}`, i.channel.id);
        await i.reply({ content: `✅ Betaalgoedkeuringen gaan vanaf nu naar <#${i.channel.id}>.`, ephemeral: true });
        return;
      }

      if (i.commandName === "saldo") {
        const t = await totals();
        await i.reply({
          ephemeral: true,
          embeds: [baseEmbed()
            .setTitle("💰 Sondravo Gangpot")
            .setDescription(`Huidig saldo: **${money(t.balance)}**`)
            .addFields(
              { name: "Inkomsten", value: money(t.income), inline: true },
              { name: "Uitgaven", value: money(t.expense), inline: true }
            )]
        });
        return;
      }

      if (i.commandName === "correctie") {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });

        const richting = i.options.getString("richting");
        const bedrag = i.options.getNumber("bedrag");
        const reden = i.options.getString("reden");
        const txId = id("corr");

        const balance = await addTransaction({
          id: txId,
          type: richting === "plus" ? "CORRECTIE_PLUS" : "CORRECTIE_MIN",
          amount: bedrag,
          userId: i.user.id,
          userName: i.user.username,
          description: reden,
          reference: "manual"
        });

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
        await i.reply({
          ephemeral: true,
          embeds: [baseEmbed()
            .setTitle("💰 Gangpot")
            .setDescription(`Beschikbaar: **${money(t.balance)}**`)
            .addFields(
              { name: "📈 Totaal binnen", value: money(t.income), inline: true },
              { name: "📉 Totaal eruit", value: money(t.expense), inline: true }
            )]
        });
        return;
      }

      if (i.customId === "sf:week") {
        requireMpikambana(i);
        const week = weekKey();
        const approved = await approvedForWeek(i.user.id, week);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sf:week:submit")
            .setLabel(approved ? "Deze week al betaald" : `Betaling ${money(CFG.weeklyAmount)} aanvragen`)
            .setEmoji(approved ? "✅" : "💵")
            .setDisabled(approved)
            .setStyle(approved ? ButtonStyle.Success : ButtonStyle.Primary)
        );

        await i.reply({
          ephemeral: true,
          embeds: [baseEmbed()
            .setTitle("💵 Weekpot")
            .setDescription(
              `Week: **${week}**\nBedrag: **${money(CFG.weeklyAmount)}**\n\n` +
              (approved
                ? "✅ Jouw betaling voor deze week is goedgekeurd."
                : "Druk hieronder nadat je hebt betaald. Founder moet hem daarna goedkeuren.")
            )],
          components: [row]
        });
        return;
      }

      if (i.customId === "sf:week:submit") {
        requireMpikambana(i);

        const modal = new ModalBuilder()
          .setCustomId("sf:modal:week")
          .setTitle("Sondravo Weekbetaling");

        const note = new TextInputBuilder()
          .setCustomId("note")
          .setLabel("Opmerking (optioneel)")
          .setPlaceholder("Bijv. cash / bank / betaald aan Founder")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(300);

        modal.addComponents(new ActionRowBuilder().addComponents(note));
        await i.showModal(modal);
        return;
      }

      if (i.customId === "sf:expense") {
        requireFounder(i);

        const modal = new ModalBuilder()
          .setCustomId("sf:modal:expense")
          .setTitle("Nieuwe Sondravo uitgave");

        const amount = new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Bedrag")
          .setPlaceholder("Bijv. 450000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const category = new TextInputBuilder()
          .setCustomId("category")
          .setLabel("Categorie")
          .setPlaceholder("Auto / Wapen / Event / Overig")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const desc = new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Omschrijving")
          .setPlaceholder("Bijv. Sultan RS voor de family")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amount),
          new ActionRowBuilder().addComponents(category),
          new ActionRowBuilder().addComponents(desc)
        );

        await i.showModal(modal);
        return;
      }

      if (i.customId === "sf:members") {
        const members = await familyMembers(i.guild);
        const week = weekKey();
        const rows = await getRows(TABS.payments, "A2:J");
        const paid = new Set(
          rows.filter(r => r[1] === week && String(r[5] || "").toUpperCase() === "APPROVED").map(r => r[2])
        );

        const lines = [...members.values()]
          .sort((a,b) => a.displayName.localeCompare(b.displayName))
          .slice(0, 40)
          .map(m => `${paid.has(m.id) ? "✅" : "⏳"} <@${m.id}>`);

        await i.reply({
          ephemeral: true,
          embeds: [baseEmbed()
            .setTitle(`👥 Leden • ${week}`)
            .setDescription(lines.join("\n") || "Geen family-leden gevonden.")]
        });
        return;
      }

      if (i.customId === "sf:overview") {
        const rows = (await getRows(TABS.transactions, "A2:I")).slice(-10).reverse();
        const lines = rows.map(r => {
          const minus = ["UITGAVE","CORRECTIE_MIN"].includes(String(r[2] || "").toUpperCase());
          return `${minus ? "🔴" : "🟢"} **${r[2]}** ${minus ? "-" : "+"}${money(r[3])}\n> ${r[6] || "-"} • saldo ${money(r[8] || 0)}`;
        });

        await i.reply({
          ephemeral: true,
          embeds: [baseEmbed()
            .setTitle("📊 Laatste transacties")
            .setDescription(lines.join("\n\n") || "Nog geen transacties.")]
        });
        return;
      }

      if (i.customId === "sf:logs") {
        requireFounder(i);
        const rows = (await getRows(TABS.logs, "A2:F")).slice(-10).reverse();
        const lines = rows.map(r => `**${r[1]}** • ${r[4] || "-"}\n> door ${r[3] || r[2] || "onbekend"}`);

        await i.reply({
          ephemeral: true,
          embeds: [baseEmbed()
            .setTitle("📜 Beheerlogs")
            .setDescription(lines.join("\n\n") || "Nog geen logs.")]
        });
        return;
      }

      if (i.customId.startsWith("sf:approve:")) {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });

        const requestId = i.customId.split(":")[2];
        const row = await updatePayment(requestId, "APPROVED", i.user);
        const [, week, userId, userName, amount] = row;

        const txId = id("tx");
        const balance = await addTransaction({
          id: txId,
          type: "WEEKBETALING",
          amount: Number(amount),
          userId, userName,
          description: `Weekpot ${week}`,
          reference: requestId
        });

        await addLog("BETALING_GOEDGEKEURD", i.user, `${userName} • ${week} • ${money(amount)}`, requestId);

        await i.message.edit({
          embeds: [EmbedBuilder.from(i.message.embeds[0])
            .setColor(0x2E8B57)
            .setTitle("✅ Weekbetaling • Goedgekeurd")],
          components: []
        });

        await refreshDashboard(i.guild);
        await i.editReply(`✅ Goedgekeurd. Nieuw saldo: **${money(balance)}**`);
        return;
      }

      if (i.customId.startsWith("sf:reject:")) {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });

        const requestId = i.customId.split(":")[2];
        const row = await updatePayment(requestId, "REJECTED", i.user);

        await addLog("BETALING_AFGEWEZEN", i.user, `${row[3]} • ${row[1]}`, requestId);

        await i.message.edit({
          embeds: [EmbedBuilder.from(i.message.embeds[0])
            .setColor(0x555555)
            .setTitle("❌ Weekbetaling • Afgewezen")],
          components: []
        });

        await i.editReply("❌ Aanvraag afgewezen.");
        return;
      }
    }

    if (i.isModalSubmit()) {
      requireFamily(i);

      if (i.customId === "sf:modal:week") {
        requireMpikambana(i);
        await i.deferReply({ ephemeral: true });

        const requestId = id("pay");
        const week = weekKey();
        const note = i.fields.getTextInputValue("note") || "";

        await createPaymentRequest({
          id: requestId,
          week,
          user: i.user,
          note
        });

        const channelId = await getSetting("approval_channel_id");
        const ch = channelId
          ? await i.guild.channels.fetch(channelId).catch(() => null)
          : i.channel;

        const embed = baseEmbed()
          .setTitle("💵 Weekbetaling • Goedkeuring")
          .setDescription("Een weekbetaling wacht op goedkeuring.")
          .addFields(
            { name: "👤 Lid", value: `<@${i.user.id}>`, inline: false },
            { name: "📅 Week", value: week, inline: true },
            { name: "💰 Bedrag", value: money(CFG.weeklyAmount), inline: true },
            { name: "📝 Opmerking", value: note || "Geen", inline: false },
            { name: "🆔 Referentie", value: `\`${requestId}\``, inline: false }
          );

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sf:approve:${requestId}`)
            .setLabel("Goedkeuren")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`sf:reject:${requestId}`)
            .setLabel("Afwijzen")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
        );

        await ch.send({
          content: `<@&${CFG.founderRoleId}> nieuwe weekbetaling ter controle.`,
          embeds: [embed],
          components: [buttons],
          allowedMentions: { roles: [CFG.founderRoleId] }
        });

        await addLog("BETALING_AANGEVRAAGD", i.user, `${week} • ${money(CFG.weeklyAmount)}`, requestId);
        await i.editReply("✅ Betaling ingediend. Founder moet hem nog goedkeuren.");
        return;
      }

      if (i.customId === "sf:modal:expense") {
        requireFounder(i);
        await i.deferReply({ ephemeral: true });

        const amount = Number(i.fields.getTextInputValue("amount").replace(/[^\d.]/g, ""));
        const category = i.fields.getTextInputValue("category").trim();
        const description = i.fields.getTextInputValue("description").trim();

        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Vul een geldig bedrag in.");

        const txId = id("exp");
        const balance = await addTransaction({
          id: txId,
          type: "UITGAVE",
          amount,
          userId: i.user.id,
          userName: i.user.username,
          description: `${category} • ${description}`,
          reference: txId
        });

        await append(TABS.expenses, [
          txId, new Date().toISOString(), amount, category, description,
          i.user.id, i.user.username, balance
        ]);

        await addLog("UITGAVE", i.user, `${money(amount)} • ${category} • ${description}`, txId);
        await refreshDashboard(i.guild);

        await i.editReply(`✅ Uitgave opgeslagen. Nieuw saldo: **${money(balance)}**`);
        return;
      }
    }
  } catch (err) {
    console.error(err);
    const msg = `❌ ${err.message || "Er ging iets mis."}`;

    if (i.deferred || i.replied) {
      await i.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await i.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(CFG.token);
