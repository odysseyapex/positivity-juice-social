# Positivity Juice daily social publishing

Reads the live public Today's Pour card from positivityjuice.com each morning. Downloads the website's exact Save image PNG at 1080 × 1350 and posts it to @positivity_juice on Instagram and TikTok through Buffer. Target posting time is 9 AM Eastern.

Captions add a short, relatable human observation. They do not repeat the card or include a website link. The original caption library covers the website's 60 existing themes, with a specific caption for the October 7 gratitude card. New website themes stop for an editorial update. Caption selection is stable across retries and does not require another API key or model subscription.

The workflow starts before 9 AM and checks again later in the morning. GitHub can delay scheduled runs. If the first run is delayed, the post is scheduled for the next available moment that morning. Eastern time and daylight saving changes are handled automatically. The computer does not need to stay on.

## Activation

Public image hosting was approved on October 7, 2026. This repository is public so Buffer can retrieve each card image. The Buffer API key is stored separately as an encrypted GitHub Actions secret.

Connect both brand accounts in Buffer with automatic publishing available. Save the Buffer API key in the GitHub Actions secret named `BUFFER_API_KEY`. Run the workflow manually in preview mode, then publish mode. Verify both posts before setting the repository Actions variable `PUBLISH_ENABLED` to `true`.

To pause automatic posting, set `PUBLISH_ENABLED` to `false`. Posts already queued in Buffer must be removed there separately. Manual publish mode remains available while the automatic schedule is off.

## Daily behavior

The workflow checks today's Eastern date and confirms the public card permalink has matching text. A browser loads the website fonts, opens Save image on the matching card, and saves the exact PNG offered by Download. No canvas redraw, added heading, extra logo, date label, crop, or recoloring is applied.

Before publishing, the workflow checks the recorded Buffer post ID, the saved caption, and the legacy date marker for existing posts. Each submission is recorded before the Buffer request. An uncertain request stops for review instead of attempting another post. Existing drafts, errors, or requests for approval also stop for review. Changing the artwork or caption does not cause a second post for the same day.

Card images are stored under `cards/`. Submission records under `state/` contain the date, card key, and Buffer post ID. The workflow code, approved brand assets, card artwork, and submission records are public. The API key is never committed. Only the publishing step receives the secret.

Posts replaced directly on a platform have a manual record with the replacement URL and observed status. A manual record also reserves a post awaiting its music step. Both prevent automatic duplicates for that specific date. Verification reports the saved observation time for native posts. Deleted originals may still appear as sent in Buffer, so they are retained only as replacement history.

If a run fails, open GitHub Actions and read the saved report. Review the corresponding Buffer post before retrying. Never remove a pending submission record until Buffer confirms that no post was created. Keep GitHub workflow failure notifications enabled in your account settings.

This workflow handles one daily card on each platform. Reels, stories, other daily posts, and music remain separate. No premium newsletter content is read or published.

## Local use

Requires Node.js 22 or newer. Copy `.env.example` to `.env`, paste the key privately, install dependencies with `npm ci`, and install the export browser with `npx playwright install chromium`.

```text
npm test
npm run check:account
npm run preview
node scripts/daily-pour.mjs --publish
node scripts/verify-posts.mjs
```

Local previews appear in `output/`. GitHub runs retain previews and reports for 14 days. The `.env`, `.private`, `output`, and `node_modules` folders are ignored by Git.

## Website artwork

The public website is the source of truth for the card artwork, typography, category color, wave, two action sections, and footer. Brand assets and card writing belong to their respective owners. No general license for reuse is granted by this repository.
