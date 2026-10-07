import { githubRequest } from './github.mjs';
try {
  const user = await githubRequest('/user');
  console.log(JSON.stringify({ login: user.login }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
