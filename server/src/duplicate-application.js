export function normalizeIdentity(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeJobUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

// Look only at applications for this profile.
// A matching job URL is a duplicate. When the URL is different, the company name and job title must both match.
export function findProfileDuplicate(applications, { profileId, jobUrl, company, jobTitle, ignoreId } = {}) {
  const rows = (applications || []).filter(row => row.profile_id === profileId && row.id !== ignoreId);
  const url = normalizeJobUrl(jobUrl);
  if (url) {
    const byUrl = rows.find(row => normalizeJobUrl(row.job_url) === url);
    if (byUrl) return { application: byUrl, reason: 'url' };
  }
  const companyKey = normalizeIdentity(company);
  const titleKey = normalizeIdentity(jobTitle);
  if (!companyKey || !titleKey) return null;
  const byCompany = rows.find(row => normalizeIdentity(row.company) === companyKey && normalizeIdentity(row.job_title) === titleKey);
  return byCompany ? { application: byCompany, reason: 'company' } : null;
}

export function duplicateMessage(match) {
  const application = match.application;
  const detail = `${application.company} · ${application.job_title} · ${application.status}`;
  if (match.reason === 'url') return `This job link is already saved for this profile (${detail}).`;
  return `This company and job title are already saved for this profile (${detail}).`;
}
