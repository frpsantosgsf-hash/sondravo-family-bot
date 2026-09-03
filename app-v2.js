const http=require('http');
const {google}=require('googleapis');
const {
  Client,GatewayIntentBits,Events,REST,Routes,SlashCommandBuilder,EmbedBuilder,
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,
  UserSelectMenuBuilder,StringSelectMenuBuilder
}=require('discord.js');
const {styleDashboard}=require('./sheet-dashboard-v2');

const CFG={
  token:process.env.DISCORD_TOKEN,
  clientId:process.env.DISCORD_CLIENT_ID||'1545007793927495750',
  guildId:process.env.DISCORD_GUILD_ID||'1488178372298408113',
  founderRoleId:process.env.FOUNDER_ROLE_ID||'1488178372721901807',
  managementRoleIds:String(process.env.MANAGEMENT_ROLE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean),
  payingRoleId:process.env.PAYING_ROLE_ID||'1488178372700803233',
  spreadsheetId:process.env.GOOGLE_SPREADSHEET_ID||'1-LrKifCSiMdv4e5cToaC6nsW5F8LI0C7VueRkbhCeQs',
  serviceJson:process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  weeklyAmount:Number(process.env.WEEKLY_AMOUNT||50000),
  color:0x8b0000
};
if(!CFG.token) throw new Error('DISCORD_TOKEN ontbreekt');
if(!CFG.serviceJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ontbreekt');
let credentials; try{credentials=JSON.parse(CFG.serviceJson)}catch{throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is ongeldig')}

const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});
const sheets=google.sheets({version:'v4',auth});
const T={dashboard:'Dashboard',members:'Leden',payments:'Weekbetalingen',expenses:'Uitgaven',transactions:'Transacties',logs:'Logs',settings:'Settings'};

const port=process.env.PORT||10000;
http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('Sondravo Family Bot v2 online')}).listen(port,()=>console.log(`✅ Web server op poort ${port}`));

async function ensureSheets(){
  const meta=await sheets.spreadsheets.get({spreadsheetId:CFG.spreadsheetId,fields:'sheets.properties'});
  const existing=new Set((meta.data.sheets||[]).map(s=>s.properties.title));
  const requests=Object.values(T).filter(x=>!existing.has(x)).map(title=>({addSheet:{properties:{title}}}));
  if(requests.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:CFG.spreadsheetId,requestBody:{requests}});
  const headers={
    [T.members]:['Discord ID','Weergavenaam','Username','Rollen','Weekstatus','Actieve week','Laatste sync'],
    [T.payments]:['Payment ID','Week','Discord ID','Discord naam','Bedrag','Status','Aangemaakt op','Verwerkt op','Aangemaakt door','Opmerking'],
    [T.expenses]:['Expense ID','Datum','Bedrag','Categorie','Omschrijving','Toegevoegd door ID','Toegevoegd door','Saldo na uitgave','Status','Opmerking'],
    [T.transactions]:['Transaction ID','Datum','Type','Bedrag','Discord ID','Discord naam','Omschrijving','Referentie','Saldo na transactie'],
    [T.logs]:['Datum','Actie','Actor ID','Actor naam','Details','Referentie'],
    [T.settings]:['Key','Value']
  };
  for(const [tab,row] of Object.entries(headers)) await sheets.spreadsheets.values.update({spreadsheetId:CFG.spreadsheetId,range:`${tab}!A1:${String.fromCharCode(64+row.length)}1`,valueInputOption:'USER_ENTERED',requestBody:{values:[row]}});
}
async function rows(tab,range='A2:Z'){const r=await sheets.spreadsheets.values.get({spreadsheetId:CFG.spreadsheetId,range:`${tab}!${range}`});return r.data.values||[]}
async function append(tab,row){await sheets.spreadsheets.values.append({spreadsheetId:CFG.spreadsheetId,range:`${tab}!A:Z`,valueInputOption:'USER_ENTERED',insertDataOption:'INSERT_ROWS',requestBody:{values:[row]}})}
async function setting(key){const r=await rows(T.settings,'A2:B');const x=r.find(v=>v[0]===key);return x?.[1]||''}
async function setSetting(key,value){const r=await rows(T.settings,'A2:B');const i=r.findIndex(v=>v[0]===key);if(i>=0) await sheets.spreadsheets.values.update({spreadsheetId:CFG.spreadsheetId,range:`${T.settings}!B${i+2}`,valueInputOption:'USER_ENTERED',requestBody:{values:[[String(value)]]}});else await append(T.settings,[key,String(value)])}
const money=n=>`$${Math.round(Number(n||0)).toLocaleString('nl-NL')}`;
const uid=p=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
function weekKey(d=new Date()){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);const y=x.getUTCFullYear();const start=new Date(Date.UTC(y,0,1));const w=Math.ceil((((x-start)/86400000)+1)/7);return `${y}-W${String(w).padStart(2,'0')}`}
async function activeWeek(){return (await setting('active_week'))||weekKey()}
function nextWeek(w){const m=/^(\d{4})-W(\d{2})$/.exec(w);if(!m)return weekKey();let y=+m[1],n=+m[2]+1;if(n>53){y++;n=1}return `${y}-W${String(n).padStart(2,'0')}`}

function isFounder(i){return i.guild?.ownerId===i.user.id||i.member?.roles?.cache?.has(CFG.founderRoleId)}
function canManage(i){return isFounder(i)||CFG.managementRoleIds.some(r=>i.member?.roles?.cache?.has(r))}
function payingMembers(guild){return guild.members.cache.filter(m=>!m.user.bot&&m.roles.cache.has(CFG.payingRoleId))}
function base(){return new EmbedBuilder().setColor(CFG.color).setFooter({text:'Sondravo Family • Finance & Management'}).setTimestamp()}
async function totals(){let income=0,expense=0;for(const r of await rows(T.transactions,'A2:I')){const type=String(r[2]||'').toUpperCase(),a=Number(r[3]||0);if(['WEEKBETALING','CORRECTIE_PLUS','UITGAVE_TERUG'].includes(type))income+=a;if(['UITGAVE','CORRECTIE_MIN','WEEKBETALING_TERUG'].includes(type))expense+=a}return{income,expense,balance:income-expense}}
async function paidIds(week){const p=await rows(T.payments,'A2:J');return new Set(p.filter(r=>r[1]===week&&String(r[5]).toUpperCase()==='APPROVED').map(r=>r[2]))}
async function addLog(action,actor,details,ref=''){await append(T.logs,[new Date().toISOString(),action,actor.id,actor.username,details,ref])}
async function addTx(type,amount,user,desc,ref){const t=await totals();const minus=['UITGAVE','CORRECTIE_MIN','WEEKBETALING_TERUG'].includes(type);const bal=t.balance+(minus?-amount:amount);await append(T.transactions,[uid('tx'),new Date().toISOString(),type,amount,user?.id||'',user?.username||'',desc,ref||'',bal]);return bal}

async function syncMembers(guild){const week=await activeWeek();const paid=await paidIds(week);const members=[...payingMembers(guild).values()].sort((a,b)=>a.displayName.localeCompare(b.displayName,'nl'));await sheets.spreadsheets.values.clear({spreadsheetId:CFG.spreadsheetId,range:`${T.members}!A2:G`});if(members.length){const now=new Date().toISOString();const data=members.map(m=>[m.id,m.displayName,m.user.username,m.roles.cache.filter(r=>r.id!==m.guild.id&&!r.managed).sort((a,b)=>b.position-a.position).map(r=>r.name).join(' • '),paid.has(m.id)?'BETAALD':'OPENSTAAND',week,now]);await sheets.spreadsheets.values.update({spreadsheetId:CFG.spreadsheetId,range:`${T.members}!A2:G${data.length+1}`,valueInputOption:'USER_ENTERED',requestBody:{values:data}})}return members}

async function writeDashboard(guild){const week=await activeWeek();const members=[...payingMembers(guild).values()];const paid=await paidIds(week);const validPaid=members.filter(m=>paid.has(m.id)).length;const t=await totals();const pct=members.length?Math.round(validPaid/members.length*100):0;const data=[
  ['SONDRAVO FAMILY • FINANCE DASHBOARD'],['Management Control Center'],[`Actieve week ${week} • ${members.length} betalende leden • Laatste update ${new Date().toLocaleString('nl-NL')}`],[],
  ['GANGPOT','','INKOMSTEN','','UITGAVEN','','WEEKPOT P.P.',''],[t.balance,'',t.income,'',t.expense,'',CFG.weeklyAmount,''],[],[],
  [`WEEKSTATUS • ${week}`],['Betaald',validPaid,'Openstaand',Math.max(members.length-validPaid,0),'Voortgang',`${pct}%`],['Doel',members.length*CFG.weeklyAmount,'Ontvangen',validPaid*CFG.weeklyAmount,'Nog nodig',Math.max((members.length-validPaid)*CFG.weeklyAmount,0)],[],[],
  ['SYSTEEMSTATUS'],['Betalende Discord-rol',CFG.payingRoleId,'Totaal leden',members.length,'Weekbedrag',CFG.weeklyAmount],['Synchronisatie','Automatisch bij startup en financiële wijzigingen']
];
  await sheets.spreadsheets.values.clear({spreadsheetId:CFG.spreadsheetId,range:`${T.dashboard}!A1:H30`});
  await sheets.spreadsheets.values.update({spreadsheetId:CFG.spreadsheetId,range:`${T.dashboard}!A1:H${data.length}`,valueInputOption:'USER_ENTERED',requestBody:{values:data}});
}
async function refreshAll(guild){await syncMembers(guild);await writeDashboard(guild)}

function progress(paid,total){const n=12,f=total?Math.round(paid/total*n):0;return `${'█'.repeat(f)}${'░'.repeat(n-f)} ${total?Math.round(paid/total*100):0}%`}
async function dashboardEmbed(guild){const week=await activeWeek();const members=[...payingMembers(guild).values()];const paid=await paidIds(week);const count=members.filter(m=>paid.has(m.id)).length;const t=await totals();return base().setTitle('🩸 SONDRAVO FAMILY • FINANCE').setDescription(`**Management Control Center**\nWeek **${week}** • **${members.length}** betalende leden\n\`${progress(count,members.length)}\``).addFields(
  {name:'💰 Gangpot',value:`**${money(t.balance)}**`,inline:true},{name:'📥 Inkomsten',value:`**${money(t.income)}**`,inline:true},{name:'📤 Uitgaven',value:`**${money(t.expense)}**`,inline:true},
  {name:'💵 Weekpot',value:`**${money(CFG.weeklyAmount)} p.p.**`,inline:true},{name:'✅ Betaald',value:`**${count}/${members.length}**`,inline:true},{name:'⏳ Openstaand',value:`**${Math.max(members.length-count,0)}**`,inline:true})}
function mainButtons(){return[new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('pay').setLabel('Weekbetaling').setEmoji('💵').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('expense').setLabel('Uitgave').setEmoji('💸').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId('members').setLabel('Ledenstatus').setEmoji('👥').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('logs').setLabel('Logs').setEmoji('📜').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('founder').setLabel('Founder').setEmoji('⚙️').setStyle(ButtonStyle.Primary)
)]}
async function refreshDashboardMessage(guild){const ch=await setting('dashboard_channel_id'),mid=await setting('dashboard_message_id');if(!ch||!mid)return;try{const c=await guild.channels.fetch(ch);const m=await c.messages.fetch(mid);await m.edit({embeds:[await dashboardEmbed(guild)],components:mainButtons()})}catch(e){console.warn('⚠️ Dashboard message niet bijgewerkt:',e.message)}}

const commands=[new SlashCommandBuilder().setName('setup').setDescription('Plaats het Sondravo management dashboard'),new SlashCommandBuilder().setName('saldo').setDescription('Toon actuele gangpot'),new SlashCommandBuilder().setName('correctie').setDescription('Founder saldo-correctie').addStringOption(o=>o.setName('type').setDescription('plus of min').setRequired(true).addChoices({name:'Plus',value:'plus'},{name:'Min',value:'min'})).addNumberOption(o=>o.setName('bedrag').setDescription('Bedrag').setRequired(true).setMinValue(1)).addStringOption(o=>o.setName('reden').setDescription('Reden').setRequired(true))].map(c=>c.toJSON());
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});

client.once(Events.ClientReady,async c=>{console.log(`✅ Online als ${c.user.tag}`);try{await ensureSheets();const guild=await c.guilds.fetch(CFG.guildId);await guild.members.fetch();console.log(`✅ ${guild.members.cache.size} Discord-leden ingeladen`);await refreshAll(guild);try{await styleDashboard(sheets,CFG.spreadsheetId,T.dashboard);console.log('✅ Dashboard v2 één keer opgemaakt')}catch(e){console.warn('⚠️ Dashboard styling overgeslagen:',e.message)}const rest=new REST({version:'10'}).setToken(CFG.token);await rest.put(Routes.applicationGuildCommands(CFG.clientId,CFG.guildId),{body:commands});console.log('✅ Slash commands geregistreerd');await refreshDashboardMessage(guild)}catch(e){console.error('❌ Startup fout:',e)}});

client.on(Events.InteractionCreate,async i=>{try{
  if(i.isChatInputCommand()){
    if(i.commandName==='setup'){if(!canManage(i))throw new Error('Alleen leiding kan dit doen.');const msg=await i.channel.send({embeds:[await dashboardEmbed(i.guild)],components:mainButtons()});await setSetting('dashboard_channel_id',i.channelId);await setSetting('dashboard_message_id',msg.id);await i.reply({content:'✅ Dashboard geplaatst.',ephemeral:true})}
    if(i.commandName==='saldo'){const t=await totals();await i.reply({embeds:[base().setTitle('💰 Gangpot').setDescription(`Actueel saldo: **${money(t.balance)}**`)],ephemeral:true})}
    if(i.commandName==='correctie'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const type=i.options.getString('type'),amount=i.options.getNumber('bedrag'),reason=i.options.getString('reden');await addTx(type==='plus'?'CORRECTIE_PLUS':'CORRECTIE_MIN',amount,i.user,reason,'correctie');await addLog('SALDOCORRECTIE',i.user,`${type} ${money(amount)} • ${reason}`);await refreshAll(i.guild);await refreshDashboardMessage(i.guild);await i.reply({content:'✅ Correctie verwerkt.',ephemeral:true})}
    return;
  }
  if(i.isButton()){
    if(['pay','expense','members','logs','founder'].includes(i.customId)&&!canManage(i))throw new Error('Alleen leiding kan dit gebruiken.');
    if(i.customId==='pay'){const menu=new UserSelectMenuBuilder().setCustomId('pay_user').setPlaceholder('Kies het ganglid dat betaald heeft').setMinValues(1).setMaxValues(1);return i.reply({content:`Selecteer een lid met rol <@&${CFG.payingRoleId}>.`,components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true})}
    if(i.customId==='expense'){const modal=new ModalBuilder().setCustomId('expense_modal').setTitle('Uitgave registreren');modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Bedrag').setStyle(TextInputStyle.Short).setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('category').setLabel('Categorie').setStyle(TextInputStyle.Short).setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Omschrijving').setStyle(TextInputStyle.Paragraph).setRequired(true)));return i.showModal(modal)}
    if(i.customId==='members'){const week=await activeWeek();const paid=await paidIds(week);const members=[...payingMembers(i.guild).values()].sort((a,b)=>a.displayName.localeCompare(b.displayName,'nl'));const lines=members.map(m=>`${paid.has(m.id)?'✅':'⏳'} ${m.displayName}`);const chunks=[];for(let n=0;n<lines.length;n+=35)chunks.push(lines.slice(n,n+35).join('\n'));const embeds=chunks.map((x,n)=>base().setTitle(`👥 Ledenstatus • ${week}${chunks.length>1?` (${n+1}/${chunks.length})`:''}`).setDescription(x||'Geen leden gevonden.'));return i.reply({embeds,ephemeral:true})}
    if(i.customId==='logs'){const l=(await rows(T.logs,'A2:F')).slice(-12).reverse();return i.reply({embeds:[base().setTitle('📜 Laatste logs').setDescription(l.map(r=>`**${r[1]}** • ${r[3]}\n${r[4]}`).join('\n\n')||'Nog geen logs.')],ephemeral:true})}
    if(i.customId==='founder'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('new_week').setLabel('Nieuwe week').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('reverse_payment').setLabel('Betaling terug').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('reverse_expense').setLabel('Uitgave terug').setStyle(ButtonStyle.Secondary));return i.reply({content:'Founder beheer',components:[row],ephemeral:true})}
    if(i.customId==='new_week'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const old=await activeWeek(),nw=nextWeek(old);await setSetting('active_week',nw);await addLog('NIEUWE_WEEK',i.user,`${old} → ${nw}`);await refreshAll(i.guild);await refreshDashboardMessage(i.guild);return i.reply({content:`✅ Nieuwe week gestart: **${nw}**`,ephemeral:true})}
    if(i.customId==='reverse_payment'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const r=(await rows(T.payments,'A2:J')).filter(x=>String(x[5]).toUpperCase()==='APPROVED').slice(-25).reverse();if(!r.length)return i.reply({content:'Geen actieve betalingen gevonden.',ephemeral:true});const menu=new StringSelectMenuBuilder().setCustomId('reverse_payment_select').setPlaceholder('Kies betaling').addOptions(r.map(x=>({label:`${x[3]} • ${x[1]}`.slice(0,100),value:x[0],description:money(x[4])})));return i.reply({components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true})}
    if(i.customId==='reverse_expense'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const r=(await rows(T.expenses,'A2:J')).filter(x=>String(x[8]||'ACTIVE').toUpperCase()!=='REVERSED').slice(-25).reverse();if(!r.length)return i.reply({content:'Geen actieve uitgaven gevonden.',ephemeral:true});const menu=new StringSelectMenuBuilder().setCustomId('reverse_expense_select').setPlaceholder('Kies uitgave').addOptions(r.map(x=>({label:`${x[3]} • ${money(x[2])}`.slice(0,100),value:x[0],description:String(x[4]||'').slice(0,100)})));return i.reply({components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true})}
  }
  if(i.isUserSelectMenu()&&i.customId==='pay_user'){if(!canManage(i))throw new Error('Alleen leiding kan dit doen.');const member=await i.guild.members.fetch(i.values[0]);if(!member.roles.cache.has(CFG.payingRoleId))throw new Error(`Deze persoon heeft niet de betalende gangrol <@&${CFG.payingRoleId}>.`);const week=await activeWeek();const existing=(await rows(T.payments,'A2:J')).some(r=>r[1]===week&&r[2]===member.id&&String(r[5]).toUpperCase()==='APPROVED');if(existing)throw new Error('Deze persoon staat deze week al op betaald.');const id=uid('pay'),now=new Date().toISOString();await append(T.payments,[id,week,member.id,member.displayName,CFG.weeklyAmount,'APPROVED',now,now,i.user.username,'Door leiding geregistreerd']);await addTx('WEEKBETALING',CFG.weeklyAmount,member.user,`Weekpot ${week}`,id);await addLog('WEEKBETALING',i.user,`${member.displayName} • ${week} • ${money(CFG.weeklyAmount)}`,id);await refreshAll(i.guild);await refreshDashboardMessage(i.guild);return i.update({content:`✅ **${member.displayName}** staat betaald voor **${week}** (${money(CFG.weeklyAmount)}).`,components:[]})}
  if(i.isStringSelectMenu()&&i.customId==='reverse_payment_select'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const id=i.values[0],r=await rows(T.payments,'A2:J'),idx=r.findIndex(x=>x[0]===id);if(idx<0)throw new Error('Betaling niet gevonden.');const x=r[idx];if(String(x[5]).toUpperCase()!=='APPROVED')throw new Error('Betaling is al teruggedraaid.');await sheets.spreadsheets.values.update({spreadsheetId:CFG.spreadsheetId,range:`${T.payments}!F${idx+2}:J${idx+2}`,valueInputOption:'USER_ENTERED',requestBody:{values:[['REVERSED',x[6]||'',new Date().toISOString(),i.user.username,'Teruggedraaid door Founder']]}});await addTx('WEEKBETALING_TERUG',Number(x[4]||CFG.weeklyAmount),{id:x[2],username:x[3]},`Terugdraaiing ${x[1]}`,id);await addLog('WEEKBETALING_TERUG',i.user,`${x[3]} • ${x[1]}`,id);await refreshAll(i.guild);await refreshDashboardMessage(i.guild);return i.update({content:'✅ Betaling teruggedraaid.',components:[]})}
  if(i.isStringSelectMenu()&&i.customId==='reverse_expense_select'){if(!isFounder(i))throw new Error('Alleen Founder kan dit doen.');const id=i.values[0],r=await rows(T.expenses,'A2:J'),idx=r.findIndex(x=>x[0]===id);if(idx<0)throw new Error('Uitgave niet gevonden.');const x=r[idx];await sheets.spreadsheets.values.update({spreadsheetId:CFG.spreadsheetId,range:`${T.expenses}!I${idx+2}:J${idx+2}`,valueInputOption:'USER_ENTERED',requestBody:{values:[['REVERSED',`Teruggedraaid door ${i.user.username}`]]}});await addTx('UITGAVE_TERUG',Number(x[2]),i.user,`Terugdraaiing: ${x[3]} • ${x[4]}`,id);await addLog('UITGAVE_TERUG',i.user,`${money(x[2])} • ${x[3]}`,id);await refreshAll(i.guild);await refreshDashboardMessage(i.guild);return i.update({content:'✅ Uitgave teruggedraaid.',components:[]})}
  if(i.isModalSubmit()&&i.customId==='expense_modal'){if(!canManage(i))throw new Error('Alleen leiding kan dit doen.');const amount=Number(i.fields.getTextInputValue('amount').replace(',','.'));if(!Number.isFinite(amount)||amount<=0)throw new Error('Ongeldig bedrag.');const cat=i.fields.getTextInputValue('category'),desc=i.fields.getTextInputValue('description'),id=uid('exp');const bal=await addTx('UITGAVE',amount,i.user,`${cat} • ${desc}`,id);await append(T.expenses,[id,new Date().toISOString(),amount,cat,desc,i.user.id,i.user.username,bal,'ACTIVE','']);await addLog('UITGAVE',i.user,`${money(amount)} • ${cat} • ${desc}`,id);await refreshAll(i.guild);await refreshDashboardMessage(i.guild);return i.reply({content:`✅ Uitgave van **${money(amount)}** geregistreerd.`,ephemeral:true})}
}catch(e){console.error('Interaction error:',e);const msg={content:`❌ ${e.message||'Er ging iets mis.'}`,ephemeral:true};if(i.replied||i.deferred)await i.followUp(msg).catch(()=>{});else await i.reply(msg).catch(()=>{})}});

client.login(CFG.token);
