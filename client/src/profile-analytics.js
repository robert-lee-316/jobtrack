const COLORS = ['#e85d8c', '#f0a04b', '#3dbe8a', '#2aa7c9', '#7c6cf0', '#2d77f4', '#ea6570', '#16a571'];

export function applicationMoment(app) {
  const raw = app?.created_at || app?.applied_at;
  if (!raw) return null;
  const value = String(raw);
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function belongs(app, id) {
  if (id === '__unassigned__') return !app.profile_id;
  return app.profile_id === id;
}

export function profileRoster(profiles = [], apps = [], colorStart = 0) {
  const roster = profiles.map((profile, index) => ({
    id: profile.id,
    name: profile.profile_name || profile.full_name || 'Profile',
    email: profile.email || '',
    color: COLORS[(colorStart + index) % COLORS.length]
  }));
  const known = new Set(roster.map(profile => profile.id));
  if (apps.some(app => !app.profile_id || !known.has(app.profile_id))) {
    roster.push({ id: '__unassigned__', name: 'Unassigned', email: '', color: '#94A3B8' });
  }
  if (!roster.length) roster.push({ id: '__unassigned__', name: 'Unassigned', email: '', color: COLORS[0] });
  return roster;
}

function hourLabel(hour) {
  const hour12 = hour % 12 || 12;
  return `${hour12}${hour < 12 ? 'a' : 'p'}`;
}

function bucketsFor(range, apps, now) {
  const today = startOfDay(now);
  if (range === 'week') {
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 6);
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const start = new Date(windowStart);
      start.setDate(windowStart.getDate() + index);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { label: start.toLocaleDateString('en-US', { weekday: 'short' }), start, end };
    });
    return { windowStart, buckets };
  }
  if (range === 'all') {
    const times = apps.map(applicationMoment).filter(Boolean);
    const first = times.length ? startOfDay(new Date(Math.min(...times.map(time => time.getTime())))) : today;
    const days = Math.max(1, Math.round((today - first) / 86400000) + 1);
    const step = days > 28 ? Math.ceil(days / 28) : 1;
    const buckets = [];
    for (let index = 0; index < days; index += step) {
      const start = new Date(first);
      start.setDate(first.getDate() + index);
      const end = new Date(start);
      end.setDate(start.getDate() + step - 1);
      end.setHours(23, 59, 59, 999);
      if (end > now) end.setTime(now.getTime());
      buckets.push({
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start,
        end
      });
    }
    return { windowStart: first, buckets };
  }
  const lastHour = now.getHours();
  const buckets = Array.from({ length: lastHour + 1 }, (_, hour) => {
    const start = new Date(today);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(today);
    end.setHours(hour, 59, 59, 999);
    return { label: hourLabel(hour), start, end };
  });
  return { windowStart: today, buckets };
}

export function memberGroups({ members, apps = [], profiles = [], resumes = [], userEmail = '', userName = '' } = {}) {
  const fromMembers = Array.isArray(members) && members.length > 0;
  const source = fromMembers
    ? members
    : [{ id: 'self', email: userEmail || '—', full_name: userName, profiles, applications: apps, resumes }];
  let color = 0;
  return source.map(member => {
    const memberApps = fromMembers ? (member.applications || []) : apps;
    const memberProfiles = fromMembers ? (member.profiles || []) : profiles;
    const memberResumes = fromMembers ? (member.resumes || []) : resumes;
    const email = member.email || userEmail || '—';
    const name = String(member.full_name || '').trim() || email;
    const roster = memberProfiles.length || memberApps.length
      ? profileRoster(memberProfiles, memberApps, color).map(profile => ({
        ...profile,
        memberId: member.id,
        user: name,
        series: profile.id
      }))
      : [];
    color += roster.filter(profile => profile.id !== '__unassigned__').length;
    return { id: member.id, email, name, roster, applications: memberApps, resumes: memberResumes };
  });
}

export function buildRunningTotals({ apps = [], profiles = [], members, userEmail = '', userName = '', range = 'day', now = new Date() } = {}) {
  const groups = memberGroups({ members, apps, profiles, userEmail, userName });
  const roster = groups.flatMap(group => group.roster);
  const seriesApps = groups.flatMap(group => group.applications);
  const appsFor = profile => groups.find(group => group.id === profile.memberId)?.applications || [];
  const { windowStart, buckets } = bucketsFor(range, seriesApps, now);
  const rows = buckets.map(bucket => {
    const landed = seriesApps.filter(app => {
      const time = applicationMoment(app);
      return time && time >= bucket.start && time <= bucket.end;
    });
    const latest = landed.sort((a, b) => applicationMoment(b) - applicationMoment(a))[0];
    const row = {
      label: bucket.label,
      note: latest ? `${latest.job_title || 'Application'} — ${latest.company || 'Company'}` : ''
    };
    for (const profile of roster) {
      row[profile.series] = appsFor(profile).filter(app => {
        const time = applicationMoment(app);
        return belongs(app, profile.id) && time && time >= windowStart && time <= bucket.end;
      }).length;
    }
    return row;
  });
  const totals = roster.map(profile => ({
    ...profile,
    count: appsFor(profile).filter(app => {
      const time = applicationMoment(app);
      return belongs(app, profile.id) && time && time >= windowStart && time <= now;
    }).length
  }));
  const counted = new Map(totals.map(profile => [profile.series, profile.count]));
  return {
    groups: groups.map(group => ({
      ...group,
      roster: group.roster.map(profile => ({ ...profile, count: counted.get(profile.series) || 0 }))
    })),
    roster: totals,
    rows,
    totals,
    total: totals.reduce((sum, profile) => sum + profile.count, 0)
  };
}

export function profileAnalysis({ apps = [], profiles = [], resumes = [], userEmail = '', userName = '', members } = {}) {
  return memberGroups({ members, apps, profiles, resumes, userEmail, userName }).flatMap(group => {
    if (!group.roster.length) {
      return [{
        id: `${group.id}:empty`,
        memberId: group.id,
        name: 'No profiles',
        color: '#cbd5e1',
        user: group.name,
        empty: true,
        total: 0,
        saved: 0,
        applied: 0,
        screening: 0,
        interview: 0,
        offer: 0,
        rejected: 0,
        resumes: 0,
        latest: null
      }];
    }
    return group.roster.map(profile => {
      const mine = group.applications.filter(app => belongs(app, profile.id));
      const count = status => mine.filter(app => app.status === status).length;
      const latest = mine.map(applicationMoment).filter(Boolean).sort((a, b) => b - a)[0] || null;
      return {
        ...profile,
        user: group.name,
        total: mine.length,
        saved: count('Saved'),
        applied: count('Applied'),
        screening: count('Screening'),
        interview: count('Interview'),
        offer: count('Offer'),
        rejected: count('Rejected'),
        resumes: group.resumes.filter(resume => resume.profile_id === profile.id).length,
        latest
      };
    });
  });
}
