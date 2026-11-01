import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[0-9a-f]{40}$/;
const runsURL = 'https://api.github.com/repos/cfal/shoes/actions/workflows/docs.yml/runs?branch=master&event=push&status=success&per_page=1';
const deploymentURL = 'https://shoes-rs.github.io/deployment.json';

export function parseSource(contents) {
  const source = contents.trim();
  if (contents !== `${source}\n` || (!['dev', 'UNSET'].includes(source) && !shaPattern.test(source))) {
    throw new Error('shoes-ref must contain dev, UNSET, or one lowercase 40-character commit SHA, followed by exactly one newline.');
  }
  return source;
}

export async function resolveSource(source, { eventName, publicationRef, token, request = fetch } = {}) {
  if (source === 'UNSET') {
    return { enabled: false, message: 'Documentation publication is disabled: shoes-ref is UNSET.' };
  }

  let ref = source;
  if (source === 'dev') {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await request(runsURL, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Unable to read Shoes documentation CI: HTTP ${response.status}.`);
    const run = (await response.json()).workflow_runs?.[0];
    if (run?.event !== 'push' || run.head_branch !== 'master' || run.status !== 'completed'
        || run.conclusion !== 'success' || run.head_repository?.full_name !== 'cfal/shoes'
        || !shaPattern.test(run.head_sha ?? '')) {
      throw new Error('No valid successful documentation CI run found for cfal/shoes master.');
    }
    ref = run.head_sha;
    const comparison = await request(`https://api.github.com/repos/cfal/shoes/compare/${ref}...master`, {
      headers, signal: AbortSignal.timeout(30_000),
    });
    if (!comparison.ok) throw new Error(`Unable to verify Shoes master ancestry: HTTP ${comparison.status}.`);
    if (!['ahead', 'identical'].includes((await comparison.json()).status)) {
      throw new Error('The successful documentation CI commit is no longer on Shoes master.');
    }
  }
  if (!shaPattern.test(ref)) throw new Error('Resolved Shoes source must be a full lowercase commit SHA.');

  if (eventName === 'schedule') {
    try {
      const response = await request(deploymentURL, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
      const deployed = response.ok ? await response.json() : null;
      if (deployed?.sourceRef === ref && deployed.publicationRef === publicationRef && deployed.channel === 'dev') {
        return { enabled: false, ref, message: `Already published dev documentation from ${ref}; skipping scheduled build.` };
      }
    } catch {
      // Publication can recover even when the previous site or its metadata is unavailable.
    }
  }
  return { enabled: true, ref, message: `Building dev documentation from cfal/shoes commit ${ref}.` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await resolveSource(parseSource(readFileSync('shoes-ref', 'utf8')), {
      eventName: process.env.GITHUB_EVENT_NAME,
      publicationRef: process.env.GITHUB_SHA,
      token: process.env.GH_TOKEN,
    });
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${result.enabled}\nref=${result.ref ?? ''}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.message}\n`);
    console.log(result.message);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
