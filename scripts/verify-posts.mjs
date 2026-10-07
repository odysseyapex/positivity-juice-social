import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { loadLocalEnv, getAccounts, bufferQuery } from './buffer.mjs';
import { dayKey, selectChannels, manualPostState } from './card.mjs';
import { readRepoFile } from './github.mjs';

loadLocalEnv();
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const repo = process.env.GITHUB_REPOSITORY || config.repository;
const day = dayKey();
const result = { day, posts: [] };
try {
  for (const channel of selectChannels(await getAccounts(), config.expectedHandles)) {
    const record = await readRepoFile(repo, `state/${day}/${channel.service}.json`);
    const state = record && JSON.parse(record.bytes.toString('utf8'));
    const manual = manualPostState(state, { day, key: state?.card }, channel.service);
    if (manual) {
      result.posts.push(manual);
      console.log(`${channel.service}: saved manual status ${manual.status}${manual.url ? ` ${manual.url}` : ''}${manual.verifiedAt ? ` (observed ${manual.verifiedAt})` : ''}`);
      if (manual.status !== 'sent') throw new Error(`${channel.service} still requires the manual publishing step.`);
      continue;
    }
    if (!state?.postId) throw new Error(`${channel.service} has no confirmed post for today.`);
    const { post } = await bufferQuery('query($input: PostInput!) { post(input: $input) { id channelId status dueAt externalLink schedulingType } }', { input: { id: state.postId } });
    if (post.channelId !== channel.id || post.schedulingType !== 'automatic') throw new Error('Buffer returned a different account or publishing method.');
    result.posts.push({ service: channel.service, ...post });
    console.log(`${channel.service}: ${post.status}${post.externalLink ? ` ${post.externalLink}` : ''}`);
    if (post.status !== 'sent') throw new Error(`${channel.service} has not been confirmed sent by Buffer.`);
  }
} catch (error) {
  result.error = String(error.message).replaceAll(process.env.BUFFER_API_KEY || '\u0000', '[redacted]');
  console.error(result.error);
  process.exitCode = 1;
} finally {
  mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../output/verification.json', import.meta.url), JSON.stringify(result, null, 2));
}
