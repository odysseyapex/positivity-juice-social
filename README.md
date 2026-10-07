# Positivity Juice daily social publishing

Publishes one Today's Pour card at 9 AM Eastern and one B roll Reel at 7 PM Eastern to @positivity_juice on both Instagram and TikTok each day. The card comes from the live public website's exact Save image PNG at 1080 × 1350. The Reel combines moving footage, one website message, the official logo, and licensed music at 1080 × 1920.

Captions add a short, relatable human observation. They do not repeat the card or include a website link. The original caption library covers the website's 60 existing themes, with a specific caption for the October 7 gratitude card. New website themes stop for an editorial update. Caption selection is stable across retries and does not require another API key or model subscription.

The workflow starts before 9 AM and checks again later in the morning. GitHub can delay scheduled runs. If the first run is delayed, the post is scheduled for the next available moment that morning. Eastern time and daylight saving changes are handled automatically. The computer does not need to stay on.

## Activation

Public image hosting was approved on October 7, 2026. This repository is public so Buffer can retrieve each card image. The Buffer API key is stored separately as an encrypted GitHub Actions secret.

Connect both brand accounts in Buffer with automatic publishing available. Save the Buffer API key in the GitHub Actions secret named `BUFFER_API_KEY`. Run the workflow manually in preview mode, then publish mode. Verify both posts before setting the repository Actions variable `PUBLISH_ENABLED` to `true`.

After a successful Reel preview and verified first queue entries, set `PUBLISH_REELS_ENABLED` to `true` to enable daily Reels. Both variables must be true for the Reel schedule to publish.

To pause all automatic posting, set `PUBLISH_ENABLED` to `false`. Set only `PUBLISH_REELS_ENABLED` to `false` to pause Reels. Posts already queued in Buffer must be removed there separately. Manual publish mode remains available while the automatic schedule is off.

## Daily behavior

The workflow checks today's Eastern date and confirms the public card permalink has matching text. A browser loads the website fonts, opens Save image on the matching card, and saves the exact PNG offered by Download. No canvas redraw, added heading, extra logo, date label, crop, or recoloring is applied.

Before publishing, the workflow checks the recorded Buffer post ID, the saved caption, and the legacy date marker for existing posts. Each submission is recorded before the Buffer request. An uncertain request stops for review instead of attempting another post. Existing drafts, errors, or requests for approval also stop for review. Changing the artwork or caption does not cause a second post for the same day.

Card images are stored under `cards/`. Submission records under `state/` contain the date, card key, and Buffer post ID. The workflow code, approved brand assets, card artwork, and submission records are public. The API key is never committed. Only the publishing step receives the secret.

Posts replaced directly on a platform have a manual record with the replacement URL and observed status. A manual record also reserves a post awaiting its music step. Both prevent automatic duplicates for that specific date. Verification reports the saved observation time for native posts. Deleted originals may still appear as sent in Buffer, so they are retained only as replacement history.

If a run fails, open GitHub Actions and read the saved report. Review the corresponding Buffer post before retrying. Never remove a pending submission record until Buffer confirms that no post was created. Keep GitHub workflow failure notifications enabled in your account settings.

## Daily Reels

The six day rotation starts October 7, 2026: Energy, Calm, Confidence, Gratitude, Kindness, Laughter. Each category returns with a different message from the public website library. All 600 messages are visited before the rotation repeats. The live source permalink must still match before any Reel is published.

Each 16 second Reel keeps one message and the supplied official carton logo visible throughout. Use clean text with no category badge, separate action screen, masthead, decorative rule, or footer. The first footage library includes sunrise, waves, a park walk, coffee, flowers, and a dog. Footage repeats by category while the message changes. Captions add human commentary without copying the card or adding a card link.

Source and license records are in `content/reel-media.json`. Mixkit footage and music have been selected under their Free Licenses for commercial social use. Music is embedded in the video and appears as original audio. Selecting a platform library song or location tag remains a native app step. Google Fonts files include their OFL licenses.

Raw stock assets stay in the ignored local cache. Finished branded video edits are hosted in monthly public GitHub Releases so Buffer can download them. Their bytes are verified before scheduling. Reel submission records use `reel-instagram.json` and `reel-tiktok.json` under each date, independently of the card records. Duplicate and uncertain submission checks run before every mutation.

An evening verification workflow checks that both cards and both Reels were sent. Reports are retained for 14 days, and a failure marks the GitHub run failed for review. Stories remain Adam's own posts. No premium newsletter content is read or published.

## Local use

Requires Node.js 22 or newer. Copy `.env.example` to `.env`, paste the key privately, install dependencies with `npm ci`, and install the export browser with `npx playwright install chromium`.

```text
npm test
npm run check:account
npm run preview
node scripts/daily-pour.mjs --publish
node scripts/verify-posts.mjs
npm run preview:reel
node scripts/daily-reel.mjs --publish
node scripts/verify-reels.mjs --queued
node scripts/verify-reels.mjs
```

Local previews appear in `output/`. GitHub runs retain previews and reports for 14 days. The `.env`, `.private`, `output`, and `node_modules` folders are ignored by Git.

Reel rendering also requires Python 3, Pillow 11.3.0, and ffmpeg. Set `PYTHON_BINARY` and `FFMPEG_PATH` if they are not on PATH. GitHub installs these automatically. Finished previews are in `output/reels/YYYY-MM-DD/`.

## Website artwork

The public website is the source of truth for the card artwork, typography, category color, wave, two action sections, and footer. Brand assets and card writing belong to their respective owners. No general license for reuse is granted by this repository.
