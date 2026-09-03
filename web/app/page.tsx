import { SONDRAVO } from '@/lib/config';

const members = [
  { name: 'Santos', status: 'BETAALD' },
  { name: 'Romano', status: 'BETAALD' },
  { name: 'Alejandro', status: 'OPENSTAAND' },
  { name: 'Lorenzo', status: 'OPENSTAAND' }
];

export default function HomePage() {
  const paid = members.filter((member) => member.status === 'BETAALD').length;
  const progress = Math.round((paid / members.length) * 100);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brandMark">S</div>
        <div>
          <div className="brand">SONDRAVO</div>
          <div className="brandSub">FAMILY CONTROL</div>
        </div>
        <nav>
          {['Dashboard', 'Weekbetalingen', 'Leden', 'Uitgaven', 'Transacties', 'Logs', 'Founder'].map((item, index) => (
            <button className={index === 0 ? 'navItem active' : 'navItem'} key={item}>{item}</button>
          ))}
        </nav>
        <div className="sidebarBottom">
          <span className="onlineDot" /> System online
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">MANAGEMENT CONTROL CENTER</p>
            <h1>{SONDRAVO.name}</h1>
          </div>
          <div className="profile">
            <div><strong>Founder</strong><span>Discord beveiligd</span></div>
            <div className="avatar">SF</div>
          </div>
        </header>

        <section className="hero">
          <div>
            <p className="eyebrow">ACTIEVE WEEK</p>
            <h2>Week 36</h2>
            <p className="muted">Alleen leden met Discord-rol {SONDRAVO.payingRoleId} tellen mee.</p>
          </div>
          <button className="primaryButton">+ Nieuwe betaling</button>
        </section>

        <section className="stats">
          <article className="card accent"><span>Gangpot</span><strong>$1.250.000</strong><small>Live saldo</small></article>
          <article className="card"><span>Week ontvangen</span><strong>${(paid * SONDRAVO.weeklyAmount).toLocaleString('nl-NL')}</strong><small>{paid} betalingen</small></article>
          <article className="card"><span>Openstaand</span><strong>{members.length - paid}</strong><small>${((members.length - paid) * SONDRAVO.weeklyAmount).toLocaleString('nl-NL')} resterend</small></article>
          <article className="card"><span>Weekbedrag</span><strong>${SONDRAVO.weeklyAmount.toLocaleString('nl-NL')}</strong><small>Per betalend lid</small></article>
        </section>

        <section className="grid">
          <article className="panel weekPanel">
            <div className="panelHeader"><div><p className="eyebrow">WEEKSTATUS</p><h3>Betalingsvoortgang</h3></div><strong>{progress}%</strong></div>
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="progressMeta"><span>{paid} betaald</span><span>{members.length - paid} openstaand</span></div>

            <div className="memberList">
              {members.map((member) => (
                <div className="memberRow" key={member.name}>
                  <div className="memberAvatar">{member.name.slice(0, 2).toUpperCase()}</div>
                  <div className="memberName"><strong>{member.name}</strong><span>$50.000 • Week 36</span></div>
                  <span className={member.status === 'BETAALD' ? 'badge paid' : 'badge open'}>{member.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel activityPanel">
            <div className="panelHeader"><div><p className="eyebrow">AUDIT</p><h3>Laatste activiteit</h3></div></div>
            <div className="timeline">
              <div><i /> <p><strong>Weekbetaling</strong><span>Romano • $50.000</span></p><time>2 min</time></div>
              <div><i /> <p><strong>Uitgave</strong><span>Voertuigen • $125.000</span></p><time>24 min</time></div>
              <div><i /> <p><strong>Weekbetaling</strong><span>Santos • $50.000</span></p><time>1 uur</time></div>
              <div><i /> <p><strong>Sync voltooid</strong><span>Discord leden bijgewerkt</span></p><time>1 uur</time></div>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
