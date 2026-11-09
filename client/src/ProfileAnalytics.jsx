import { Fragment, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildRunningTotals, profileAnalysis } from './profile-analytics.js';

const RANGES = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['all', 'All']
];

function formatWhen(date) {
  if (!date) return '—';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}, ${hh}:${min}`;
}

function rangeCaption(range, now) {
  const stamp = now.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  if (range === 'week') return `${stamp} · running total per profile · last 7 days`;
  if (range === 'all') return `${stamp} · running total per profile · all time`;
  return `${stamp} · running total per profile · today`;
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const note = payload[0]?.payload?.note;
  return (
    <div className="profile-tip">
      <b>{label}</b>
      {payload.map(item => (
        <div key={item.dataKey}>
          <i style={{ background: item.color }} />
          <span>{item.name}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
      {note && <p>{note}</p>}
    </div>
  );
}

export function ProfileSelect({ profiles = [], groups, value, onChange }) {
  const team = Array.isArray(groups) && groups.length > 1;
  return (
    <label className="profile-select">
      <span>Profile</span>
      <select aria-label="Profile" value={value} onChange={event => onChange(event.target.value)}>
        <option value="all">All profiles</option>
        {value === '__unassigned__' && <option value="__unassigned__">Unassigned</option>}
        {team ? groups.map(group => (
          <optgroup key={group.id} label={group.name || group.email}>
            {group.roster.filter(profile => profile.id !== '__unassigned__').map(profile => (
              <option key={profile.series || profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </optgroup>
        )) : profiles.map(profile => (
          <option key={profile.id} value={profile.id}>{profile.profile_name || profile.full_name || 'Profile'}</option>
        ))}
      </select>
    </label>
  );
}

export function ProfileAnalytics({ apps, profiles, resumes, userEmail, userName = '', members, selectedId = 'all', onProfileChange, dashboard = false }) {
  const team = Array.isArray(members) && members.length > 1;
  const [range, setRange] = useState(dashboard ? 'day' : 'week');
  const [chartProfile, setChartProfile] = useState(selectedId || 'all');
  const chosen = dashboard ? selectedId : chartProfile || 'all';
  const now = useMemo(() => new Date(), [apps, profiles, members, range]);
  const chart = useMemo(
    () => buildRunningTotals({ apps, profiles, members, userEmail, userName, range, now }),
    [apps, profiles, members, userEmail, userName, range, now]
  );
  const rows = useMemo(
    () => dashboard ? [] : profileAnalysis({ apps, profiles, resumes, userEmail, userName, members }),
    [apps, profiles, resumes, userEmail, userName, members, dashboard]
  );
  const visible = chart.roster.filter(profile => chosen === 'all' || profile.id === chosen);
  const picked = chart.totals.find(profile => profile.id === chosen);
  const shownTotal = chosen === 'all' || !picked ? chart.total : picked.count;
  const totalLabel = chosen === 'all' || !picked ? 'All profiles' : picked.name;
  const peak = Math.max(1, ...chart.rows.flatMap(row => visible.map(profile => row[profile.series || profile.id] || 0)));
  const choose = dashboard ? onProfileChange : setChartProfile;

  return (
    <section className="profile-analytics">
      <div className="panel profile-chart-panel">
        <div className="panel-header profile-chart-head">
          <div>
            <h3>Applications by profile</h3>
            <p className="muted tiny">{rangeCaption(range, now)}</p>
          </div>
          <div className="chart-controls">
            {!dashboard && <ProfileSelect profiles={profiles} groups={team ? chart.groups : undefined} value={chosen} onChange={choose} />}
            <div className="range-switch" role="tablist" aria-label="Chart range">
              {RANGES.map(([id, label]) => (
                <button key={id} type="button" className={range === id ? 'active' : ''} onClick={() => setRange(id)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="profile-chart">
          <div className="chart-space profile-chart-space">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.rows} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#2a3546" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#93a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} domain={[0, peak]} tick={{ fontSize: 11, fill: '#93a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                {visible.map(profile => (
                  <Line key={profile.series || profile.id} type="monotone" dataKey={profile.series || profile.id} name={profile.name} stroke={profile.color} strokeWidth={dashboard ? 2 : 2.5} dot={dashboard ? false : { r: 3, fill: profile.color }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <aside className="profile-rail">
            <div>
              <span className="muted tiny">{totalLabel}</span>
              <strong className="profile-total">{shownTotal}</strong>
            </div>
            {chart.groups.map(group => (
              <div key={group.id} className={team ? 'member-block' : 'member-profiles'}>
                {team && <div className="member-label" title={group.name || group.email}>{group.name || group.email}</div>}
                {group.roster.map(profile => (
                  <button key={profile.series || profile.id} type="button" className={'profile-line' + (chosen === profile.id ? ' chosen' : '')} onClick={() => choose(chosen === profile.id ? 'all' : profile.id)}>
                    <i style={{ background: profile.color }} />
                    <span>{profile.name}</span>
                    <b>{profile.count}</b>
                  </button>
                ))}
                {team && !group.roster.length && <span className="muted tiny">No profiles</span>}
              </div>
            ))}
          </aside>
        </div>
      </div>
      {!dashboard && <div className="panel application-panel">
        <div className="panel-header" style={{ padding: '20px 20px 0' }}>
          <div>
            <h3>Analysis by user and profile</h3>
            <p className="muted tiny">{team ? `${chart.groups.length} members` : `${userName || userEmail || 'Signed-in account'} · ${rows.length} profile${rows.length === 1 ? '' : 's'}`}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>USER</th>
                <th>PROFILE</th>
                <th>APPLICATIONS</th>
                <th>SAVED</th>
                <th>APPLIED</th>
                <th>SCREENING</th>
                <th>INTERVIEW</th>
                <th>OFFER</th>
                <th>REJECTED</th>
                <th>RESUMES</th>
                <th>LAST ACTIVITY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <Fragment key={row.id}>
                {team && (index === 0 || rows[index - 1].memberId !== row.memberId) && <tr className="member-divider-row"><td colSpan={11}>{row.user}</td></tr>}
                <tr className={!row.empty && chosen === row.id ? 'analysis-chosen' : undefined}>
                  <td>{row.user}</td>
                  <td><span className="profile-name-cell">{!row.empty && <i style={{ background: row.color }} />}{row.name}</span></td>
                  <td><b>{row.total}</b></td>
                  <td>{row.saved}</td>
                  <td>{row.applied}</td>
                  <td>{row.screening}</td>
                  <td>{row.interview}</td>
                  <td>{row.offer}</td>
                  <td>{row.rejected}</td>
                  <td>{row.resumes}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatWhen(row.latest)}</td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </section>
  );
}
