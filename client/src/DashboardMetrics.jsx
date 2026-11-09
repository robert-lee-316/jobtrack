import React, { useMemo } from 'react';
import { applicationMoment } from './profile-analytics.js';

const days = 7;

// Each series shows records created on each local date, grouped by current status.
function weekSeries(apps, today) {
  const totals = Array(days).fill(0);
  const byStatus = Object.fromEntries(['Applied', 'Interview', 'Offer'].map(status => [status, Array(days).fill(0)]));
  const dates = new Map();
  for (let i = 0; i < days; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() - days + 1 + i);
    dates.set(day.toDateString(), i);
  }
  for (const app of apps) {
    const moment = applicationMoment(app);
    const index = moment && dates.get(moment.toDateString());
    if (index == null) continue;
    totals[index]++;
    if (byStatus[app.status]) byStatus[app.status][index]++;
  }
  return { total: totals, ...byStatus };
}

function Sparkline({ values, label }) {
  const peak = Math.max(1, ...values);
  const points = values.map((n, i) => [2 + i * 32, 31 - n / peak * 26]);
  return (
    <svg className="metric-trend" viewBox="0 0 196 34" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label} · {values.join(', ')}</title>
      <polygon points={'2,33 ' + points.join(' ') + ' 194,33'} fill="currentColor" opacity=".09" />
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
      <circle cx="194" cy={points[days - 1][1]} r="2" fill="currentColor" />
    </svg>
  );
}

export function DashboardMetrics({ stats, apps }) {
  const today = new Date().toDateString();
  const series = useMemo(() => weekSeries(apps, today), [apps, today]);
  return (
    <section className="stat-grid" aria-label="Application overview">
      {stats.map(({name, value, sub, icon: Icon, seriesKey}) => (
        <article className="stat-card" key={name}>
          <div className="stat-top"><span className="stat-icon"><Icon size={16}/></span>{name}</div>
          <strong>{value}</strong>
          <div className="stat-sub">{sub}</div>
          <Sparkline values={series[seriesKey]} label={name + ' added in the past seven days'} />
          <div className="metric-axis"><span>Last 7 days</span><span>Today</span></div>
        </article>
      ))}
    </section>
  );
}
