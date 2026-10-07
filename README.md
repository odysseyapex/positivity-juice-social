# Positivity Juice daily social publishing

Reads the live public Today's Pour card from positivityjuice.com each morning. Creates branded artwork at 1080 × 1350 and sends the exact message and action to @positivity_juice on Instagram and TikTok through Buffer. Target posting time is 9 AM Eastern.

The workflow starts before 9 AM and checks again later in the morning. GitHub can delay scheduled runs. If the first run is delayed, the post is scheduled for the next available moment that morning. Eastern time and daylight saving changes are handled automatically. The computer does not need to stay on.

## Activation

Public image hosting was approved on October 7, 2026. This repository is public so Buffer can retrieve each card image. The Buffer API key is stored separately as an encrypted GitHub Actions secret.

Connect both brand accounts in Buffer with automatic publishing available. Save the Buffer API key in the GitHub Actions secret named `BUFFER_API_KEY`. Run the workflow manually in preview mode, then publish mode. Verify both posts before setting the repository Actions variable `PUBLISH_ENABLED` to `true`.

To pause automatic posting, set `PUBLISH_ENABLED` to `false`. Posts already queued in Buffer must be removed there separately. Manual publish mode remains available while the automatic schedule is off.

## Daily behavior

The workflow checks today's Eastern date, confirms the public card permalink has matching text, renders the image, and looks for an existing post on each platform. Each submission is recorded before the Buffer request. An uncertain request stops for review instead of attempting another post. Existing drafts, errors, or requests for approval also stop for review.

Card images are stored under `cards/`. Submission records under `state/` contain the date, card key, and Buffer post ID. The workflow code, approved brand assets, card artwork, and submission records are public. The API key is never committed. Only the publishing step receives the secret.

If a run fails, open GitHub Actions and read the saved report. Review the corresponding Buffer post before retrying. Never remove a pending submission record until Buffer confirms that no post was created. Keep GitHub workflow failure notifications enabled in your account settings.

This workflow handles one daily card on each platform. Reels, stories, other daily posts, and music remain separate. No premium newsletter content is read or published.

## Local use

Requires Node.js 22 or newer. Copy `.env.example` to `.env`, paste the key privately, and install dependencies with `npm ci`.

```text
npm test
npm run check:account
npm run preview
node scripts/daily-pour.mjs --publish
node scripts/verify-posts.mjs
```

Local previews appear in `output/`. GitHub runs retain previews and reports for 14 days. The `.env`, `.private`, `output`, and `node_modules` folders are ignored by Git.

## Brand assets

The original Positivity Juice carton is used without redrawing it. Fredoka and DM Sans font licenses are included with their font files. Brand assets and card writing belong to their respective owners. No general license for reuse is granted by this repository.
