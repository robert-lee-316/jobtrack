import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunningTotals, profileAnalysis } from './profile-analytics.js';

const now = new Date(2026, 10, 6, 14, 30, 0);
const profiles = [
  { id: 'p1', profile_name: 'Sara', email: 'sara@example.com' },
  { id: 'p2', profile_name: 'Omar', email: 'omar@example.com' }
];
const apps = [
  { id: 'a1', profile_id: 'p1', status: 'Applied', company: 'Northstar', job_title: 'Backend Engineer', created_at: '2026-11-06T09:15:00' },
  { id: 'a2', profile_id: 'p1', status: 'Saved', company: 'Acme', job_title: 'Frontend Engineer', created_at: '2026-11-06T13:05:00' },
  { id: 'a3', profile_id: 'p2', status: 'Interview', company: 'Lumen', job_title: 'Platform Engineer', created_at: '2026-11-05T11:00:00' },
  { id: 'a4', profile_id: 'p2', status: 'Offer', company: 'Harbor', job_title: 'Staff Engineer', created_at: '2026-11-06T14:10:00' }
];

test('day chart is a running total for every profile', () => {
  const chart = buildRunningTotals({ apps, profiles, range: 'day', now });
  assert.equal(chart.rows[0].label, '12a');
  assert.equal(chart.rows[9].p1, 1);
  assert.equal(chart.rows[13].p1, 2);
  assert.equal(chart.rows[9].p2, 0);
  assert.equal(chart.rows.at(-1).p2, 1);
  assert.equal(chart.rows[9].note, 'Backend Engineer — Northstar');
  assert.equal(chart.total, 3);
  assert.deepEqual(chart.totals.map(profile => profile.count), [2, 1]);
});

test('week chart keeps earlier days in the running total', () => {
  const chart = buildRunningTotals({ apps, profiles, range: 'week', now });
  assert.equal(chart.rows.length, 7);
  assert.equal(chart.rows.at(-2).p2, 1);
  assert.equal(chart.rows.at(-1).p2, 2);
  assert.equal(chart.total, 4);
});

test('analysis lists each profile under the signed-in user', () => {
  const rows = profileAnalysis({
    apps,
    profiles,
    resumes: [{ profile_id: 'p1' }, { profile_id: 'p1' }, { profile_id: 'p2' }],
    userEmail: 'sara@example.com'
  });
  assert.equal(rows[0].user, 'sara@example.com');
  assert.equal(rows[0].total, 2);
  assert.equal(rows[0].applied, 1);
  assert.equal(rows[0].resumes, 2);
  assert.equal(rows[1].interview, 1);
  assert.equal(rows[1].offer, 1);
  assert.equal(rows[1].resumes, 1);
});

test('a manager chart lists every member and keeps their profiles apart', () => {
  const members = [
    { id: 'u1', email: 'omar@example.com', profiles: [{ id: 'p1', profile_name: 'Omar' }], applications: [apps[0], apps[1]], resumes: [{ profile_id: 'p1' }] },
    { id: 'u2', email: 'diego@example.com', profiles: [{ id: 'p2', profile_name: 'Diego' }], applications: [apps[2], apps[3]], resumes: [] },
    { id: 'u3', email: 'empty@example.com', profiles: [], applications: [], resumes: [] }
  ];
  const chart = buildRunningTotals({ members, range: 'week', now });
  assert.deepEqual(chart.groups.map(group => group.email), ['omar@example.com', 'diego@example.com', 'empty@example.com']);
  assert.equal(chart.groups[0].roster[0].user, 'omar@example.com');
  assert.equal(chart.groups[1].roster[0].user, 'diego@example.com');
  assert.equal(chart.groups[2].roster.length, 0);
  assert.notEqual(chart.groups[0].roster[0].color, chart.groups[1].roster[0].color);
  assert.equal(chart.total, 4);
  const rows = profileAnalysis({ members });
  assert.deepEqual(rows.map(row => row.user), ['omar@example.com', 'diego@example.com', 'empty@example.com']);
  assert.equal(rows[2].empty, true);
  assert.equal(rows[0].resumes, 1);
});

test('member labels use the account full name', () => {
  const rows = profileAnalysis({
    members: [
      { id: 'u1', email: 'omar@example.com', full_name: 'Omar Hassan', profiles: [{ id: 'p1', profile_name: 'Omar' }], applications: [], resumes: [] }
    ]
  });
  assert.equal(rows[0].user, 'Omar Hassan');
});
