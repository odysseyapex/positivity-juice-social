import { spawnSync } from 'node:child_process';

let cached;
function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (cached) return cached;
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('GitHub sign in is required for deployment.');
  cached = result.stdout.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!cached) throw new Error('No GitHub credential was available.');
  return cached;
}

export async function githubRequest(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method, headers: { Authorization: `Bearer ${githubToken()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GitHub ${method} ${path.split('?')[0]} returned HTTP ${response.status}: ${result.message || 'Request failed'}`);
  return result;
}

export async function readRepoFile(repo, path) {
  try {
    const result = await githubRequest(`/repos/${repo}/contents/${path}?ref=main`);
    return { sha: result.sha, bytes: Buffer.from(result.content.replace(/\s/g, ''), 'base64') };
  } catch (error) { if (error.message.includes('HTTP 404:')) return null; throw error; }
}

export async function writeRepoFile(repo, path, bytes, message) {
  const previous = await readRepoFile(repo, path);
  if (previous && previous.bytes.equals(bytes)) return;
  await githubRequest(`/repos/${repo}/contents/${path}`, 'PUT', { message, content: bytes.toString('base64'), branch: 'main', ...(previous ? { sha: previous.sha } : {}) });
}
