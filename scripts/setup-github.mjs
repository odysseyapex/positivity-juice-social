import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import sodium from 'libsodium-wrappers';
import { loadLocalEnv } from './buffer.mjs';
import { githubRequest } from './github.mjs';

loadLocalEnv();
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const repo = config.repository;
const [owner, name] = repo.split('/');
const command = process.argv[2];
try {
  const user = await githubRequest('/user');
  if (user.login !== owner) throw new Error(`Expected GitHub account ${owner}.`);
  if (command === 'pin-actions') {
    const path = new URL('../.github/workflows/daily-pour.yml', import.meta.url);
    let workflow = readFileSync(path, 'utf8');
    for (const action of ['checkout', 'setup-node', 'upload-artifact']) {
      const ref = await githubRequest(`/repos/actions/${action}/git/ref/tags/v4`);
      let object = ref.object;
      while (object.type === 'tag') object = (await githubRequest(`/repos/actions/${action}/git/tags/${object.sha}`)).object;
      if (object.type !== 'commit' || !/^[a-f0-9]{40}$/.test(object.sha)) throw new Error('Unexpected action reference.');
      workflow = workflow.replace(`actions/${action}@v4`, `actions/${action}@${object.sha} # v4`);
      console.log(`Pinned actions/${action} to ${object.sha.slice(0, 12)}.`);
    }
    writeFileSync(path, workflow);
  } else if (command === 'create-public' || command === 'create-private') {
    let existing;
    try { existing = await githubRequest(`/repos/${repo}`); }
    catch (error) { if (!error.message.includes('HTTP 404:')) throw error; }
    if (existing) throw new Error('The target repository already exists. Inspect it before continuing.');
    const created = await githubRequest('/user/repos', 'POST', { name, private: command === 'create-private', description: "Positivity Juice daily card artwork and publishing workflow", auto_init: false, has_issues: false, has_projects: false, has_wiki: false });
    console.log(`Created ${created.html_url}.`);
    await githubRequest(`/repos/${repo}/actions/variables`, 'POST', { name: 'PUBLISH_ENABLED', value: 'false' });
    console.log('Automatic posting is off until account validation is complete.');
  } else if (command === 'save-secret') {
    if (!process.env.BUFFER_API_KEY) throw new Error('Buffer key is missing.');
    await sodium.ready;
    const key = await githubRequest(`/repos/${repo}/actions/secrets/public-key`);
    const encrypted = sodium.crypto_box_seal(sodium.from_string(process.env.BUFFER_API_KEY), sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL));
    await githubRequest(`/repos/${repo}/actions/secrets/BUFFER_API_KEY`, 'PUT', { encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL), key_id: key.key_id });
    console.log('Saved the encrypted Buffer secret.');
  } else if (['preview', 'publish', 'verify'].includes(command)) {
    await githubRequest(`/repos/${repo}/actions/workflows/daily-pour.yml/dispatches`, 'POST', { ref: 'main', inputs: { mode: command } });
    console.log(`Started ${command}.`);
  } else if (command === 'status') {
    const runs = await githubRequest(`/repos/${repo}/actions/runs?per_page=5`);
    console.log(JSON.stringify(runs.workflow_runs.map(run => ({ id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url, event: run.event, createdAt: run.created_at })), null, 2));
  } else if (command === 'enable' || command === 'disable') {
    if (command === 'enable') {
      const verified = spawnSync(process.execPath, ['scripts/verify-posts.mjs'], { encoding: 'utf8', windowsHide: true });
      if (verified.status !== 0) throw new Error('Both platforms must have a verified sent post before activation.');
    }
    await githubRequest(`/repos/${repo}/actions/variables/PUBLISH_ENABLED`, 'PATCH', { name: 'PUBLISH_ENABLED', value: command === 'enable' ? 'true' : 'false' });
    console.log(command === 'enable' ? 'Daily publishing enabled.' : 'Daily publishing disabled.');
  } else throw new Error('Choose pin-actions, create-private, create-public, save-secret, preview, publish, verify, status, enable, or disable.');
} catch (error) {
  console.error(String(error.message).replaceAll(process.env.BUFFER_API_KEY || '\u0000', '[redacted]'));
  process.exitCode = 1;
}
