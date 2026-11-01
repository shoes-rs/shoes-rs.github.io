import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSource, resolveSource } from './resolve-source.mjs';

const sourceRef = 'a'.repeat(40);
const publicationRef = 'b'.repeat(40);
const successfulRun = {
  event: 'push', head_branch: 'master', status: 'completed', conclusion: 'success',
  head_repository: { full_name: 'cfal/shoes' }, head_sha: sourceRef,
};
const deployment = { sourceRef, publicationRef, channel: 'dev' };
const jsonResponse = (data) => ({ ok: true, json: async () => data });
const neverRequest = () => { throw new Error('Unexpected network request'); };

test('source mode and pins are byte-exact', () => {
  for (const value of ['dev', 'UNSET', sourceRef]) assert.equal(parseSource(`${value}\n`), value);
  for (const value of ['', 'dev', 'dev\r\n', 'dev\n\n', ' dev\n', 'dev \n', 'UNSET', 'unset\n',
    `${sourceRef}`, `${sourceRef.toUpperCase()}\n`, `${sourceRef.slice(1)}\n`, `${sourceRef}\nextra\n`]) {
    assert.throws(() => parseSource(value));
  }
});

test('UNSET disables all events without accessing the network', async () => {
  for (const eventName of ['schedule', 'push', 'pull_request', 'workflow_dispatch']) {
    assert.equal((await resolveSource('UNSET', { eventName, request: neverRequest })).enabled, false);
  }
});

test('explicit pin bypasses upstream discovery', async () => {
  const result = await resolveSource(sourceRef, { request: neverRequest });
  assert.equal(result.ref, sourceRef);
  assert.equal(result.enabled, true);
  await assert.rejects(resolveSource('master', { request: neverRequest }));
});

test('dev selects the latest successful master push and limits the token to GitHub', async () => {
  const urls = [];
  const result = await resolveSource('dev', {
    eventName: 'schedule', publicationRef, token: 'test-token',
    request: async (url, options) => {
      urls.push(url);
      if (new URL(url).hostname === 'api.github.com') {
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        if (new URL(url).pathname.includes('/compare/')) {
          assert.ok(url.endsWith(`/compare/${sourceRef}...master`));
          return jsonResponse({ status: 'ahead' });
        }
        assert.equal(new URL(url).searchParams.get('event'), 'push');
        assert.equal(new URL(url).searchParams.get('status'), 'success');
        assert.equal(new URL(url).searchParams.get('branch'), 'master');
        return jsonResponse({ workflow_runs: [successfulRun] });
      }
      assert.equal(options.headers?.Authorization, undefined);
      return { ok: false, status: 404 };
    },
  });
  assert.equal(urls.length, 3);
  assert.equal(result.ref, sourceRef);
  assert.equal(result.enabled, true);
});

test('dev requires the successful commit to remain on master', async () => {
  for (const status of ['ahead', 'identical', 'behind', 'diverged', undefined]) {
    const resolve = () => resolveSource('dev', {
      request: async (url) => jsonResponse(url.includes('/compare/') ? { status } : { workflow_runs: [successfulRun] }),
    });
    if (['ahead', 'identical'].includes(status)) assert.equal((await resolve()).enabled, true);
    else await assert.rejects(resolve());
  }
  for (const response of [{ ok: false, status: 403 }, { ok: true, json: async () => { throw new SyntaxError(); } }]) {
    await assert.rejects(resolveSource('dev', {
      request: async (url) => url.includes('/compare/') ? response : jsonResponse({ workflow_runs: [successfulRun] }),
    }));
  }
});

test('empty, failed, PR, fork, wrong-branch and malformed upstream runs fail closed', async () => {
  for (const run of [undefined, { ...successfulRun, conclusion: 'failure' },
    { ...successfulRun, event: 'pull_request' }, { ...successfulRun, status: 'in_progress' },
    { ...successfulRun, head_branch: 'feature' }, { ...successfulRun, head_repository: { full_name: 'fork/shoes' } },
    { ...successfulRun, head_sha: 'invalid\nref=injected' }]) {
    await assert.rejects(resolveSource('dev', {
      request: async (url) => jsonResponse(url.includes('/compare/') ? { status: 'ahead' } : { workflow_runs: run ? [run] : [] }),
    }), /No valid successful documentation CI run/);
  }
  await assert.rejects(resolveSource('dev', { request: async () => ({ ok: false, status: 403 }) }));
  await assert.rejects(resolveSource('dev', { request: async () => { throw new Error('Offline'); } }));
  await assert.rejects(resolveSource('dev', { request: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }));
});

test('scheduled runs skip only the exact deployed source and publishing revision', async () => {
  for (const deployed of [deployment, { ...deployment, sourceRef: 'c'.repeat(40) },
    { ...deployment, publicationRef: 'd'.repeat(40) }, { ...deployment, channel: 'stable' }, null]) {
    const result = await resolveSource(sourceRef, {
      eventName: 'schedule', publicationRef, request: async () => jsonResponse(deployed),
    });
    assert.equal(result.enabled, deployed !== deployment);
  }
});

test('pushes, PRs and manual runs always rebuild', async () => {
  for (const eventName of ['push', 'pull_request', 'workflow_dispatch']) {
    let calls = 0;
    const result = await resolveSource(sourceRef, {
      eventName, publicationRef, request: async () => { calls++; return jsonResponse(deployment); },
    });
    assert.equal(result.enabled, true);
    assert.equal(calls, 0);
  }
});

test('missing, unreachable or malformed published metadata rebuilds', async () => {
  for (const request of [async () => ({ ok: false, status: 404 }),
    async () => { throw new Error('Offline'); },
    async () => ({ ok: true, json: async () => { throw new SyntaxError(); } })]) {
    assert.equal((await resolveSource(sourceRef, { eventName: 'schedule', publicationRef, request })).enabled, true);
  }
});

test('CLI writes validated Actions outputs and fails before writing invalid inputs', () => {
  const script = fileURLToPath(new URL('./resolve-source.mjs', import.meta.url));
  for (const [contents, expected] of [[`${sourceRef}\n`, `enabled=true\nref=${sourceRef}\n`],
    ['UNSET\n', 'enabled=false\nref=\n'], ['dev\r\n', null]]) {
    const cwd = mkdtempSync(path.join(tmpdir(), 'shoes-source-test-'));
    try {
      writeFileSync(path.join(cwd, 'shoes-ref'), contents);
      const output = path.join(cwd, 'output');
      const summary = path.join(cwd, 'summary');
      const result = spawnSync(process.execPath, [script], {
        cwd, encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
      });
      assert.equal(result.status, expected === null ? 1 : 0, result.stderr);
      if (expected === null) {
        assert.equal(existsSync(output), false);
        assert.equal(existsSync(summary), false);
      } else {
        assert.equal(readFileSync(output, 'utf8'), expected);
        assert.equal(readFileSync(summary, 'utf8'), result.stdout);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});
