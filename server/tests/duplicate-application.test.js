import test from 'node:test';
import assert from 'node:assert/strict';
import { findProfileDuplicate } from '../src/duplicate-application.js';

const rows = [
  { id: 'a1', profile_id: 'p1', company: 'Northstar', job_title: 'Backend Engineer', job_url: 'https://jobs.example.com/1?utm_source=li', status: 'Applied' },
  { id: 'a2', profile_id: 'p1', company: 'Acme', job_title: 'Frontend Engineer', job_url: 'https://jobs.example.com/acme-fe', status: 'Saved' },
  { id: 'a3', profile_id: 'p2', company: 'Northstar', job_title: 'Backend Engineer', job_url: 'https://jobs.example.com/other', status: 'Saved' }
];

test('duplicate check stays inside the selected profile and prefers the job URL', () => {
  const match = findProfileDuplicate(rows, {
    profileId: 'p1',
    jobUrl: 'https://jobs.example.com/1',
    company: 'Different Co',
    jobTitle: 'Different Role'
  });
  assert.equal(match.reason, 'url');
  assert.equal(match.application.id, 'a1');
  assert.equal(findProfileDuplicate(rows, { profileId: 'p2', jobUrl: 'https://jobs.example.com/1', company: 'Northstar', jobTitle: 'Backend Engineer' }).application.id, 'a3');
});

test('a different URL falls through to company name and job title', () => {
  const match = findProfileDuplicate(rows, {
    profileId: 'p1',
    jobUrl: 'https://jobs.example.com/new-link',
    company: 'acme',
    jobTitle: 'Frontend Engineer'
  });
  assert.equal(match.reason, 'company');
  assert.equal(match.application.id, 'a2');
  assert.equal(findProfileDuplicate(rows, {
    profileId: 'p1',
    jobUrl: 'https://jobs.example.com/new-link',
    company: 'Acme',
    jobTitle: 'Staff Engineer'
  }), null);
});
