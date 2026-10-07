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

export async function publishReelAsset(repo, filename, bytes, digest) {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z]+-\d+-[a-f0-9]{12}\.mp4$/.test(filename)) throw new Error('Unexpected Reel filename.');
  const tag = `social-reels-${filename.slice(0, 7)}`;
  let release;
  try { release = await githubRequest(`/repos/${repo}/releases/tags/${tag}`); }
  catch (error) {
    if (!error.message.includes('HTTP 404:')) throw error;
    try {
      release = await githubRequest(`/repos/${repo}/releases`, 'POST', { tag_name: tag, target_commitish: 'main', name: `Positivity Juice Reels ${filename.slice(0, 7)}`, body: 'Finished Positivity Juice social videos. Licensed footage and music are incorporated into original branded edits. Raw stock assets are not distributed.', draft: false, prerelease: false, make_latest: 'false' });
    } catch (createError) {
      // Reconcile uncertain release creation before attempting any upload.
      release = await githubRequest(`/repos/${repo}/releases/tags/${tag}`).catch(() => { throw createError; });
    }
  }
  const assets = [];
  for (let page = 1; page <= 5; page++) {
    const rows = await githubRequest(`/repos/${repo}/releases/${release.id}/assets?per_page=100&page=${page}`);
    assets.push(...rows);
    if (rows.length < 100) break;
    if (page === 5) throw new Error('Release asset inventory is incomplete.');
  }
  let asset = assets.find(a => a.name === filename);
  if (!asset) {
    const upload = new URL(release.upload_url.replace(/\{.*$/, ''));
    if (upload.protocol !== 'https:' || upload.hostname !== 'uploads.github.com') throw new Error('Unexpected GitHub upload destination.');
    upload.searchParams.set('name', filename);
    const response = await fetch(upload, { method: 'POST', headers: { Authorization: `Bearer ${githubToken()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'video/mp4' }, body: bytes, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Reel upload returned HTTP ${response.status}. Inspect the release before retrying.`);
    asset = await response.json();
  }
  if (asset.size !== bytes.length || (asset.digest && asset.digest !== `sha256:${digest}`)) throw new Error('Hosted Reel does not match the rendered file.');
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes)) throw new Error('The public Reel is not ready for Buffer.');
  return asset.browser_download_url;
}
