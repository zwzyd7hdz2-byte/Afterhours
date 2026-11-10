# AfterHours — launch package

This is the full static website: HTML, CSS, JS, original artwork, cards, board game, and Supabase room integration.

## Before publishing
1. Copy your working `supabase-config.js` from your existing project into this folder. The included file contains placeholders.
2. Use ONLY the Supabase **publishable** key (never a secret/service_role key).
3. Confirm your Supabase SQL functions `ah_create_room`, `ah_join_room`, `ah_get_room`, and `ah_update_room` are installed and their permissions/RLS have been reviewed.
4. Test with two separate browser sessions: room create/join, Truth or Dare shared card, Spice Stories alternating lines, Position Roulette shared result, and local Board Games.
5. Upload the **contents** of the AfterHours folder to a GitHub repository (with `index.html` at the published root).
6. In GitHub: Settings → Pages → Deploy from a branch → main / root → Save.
7. Visit the GitHub Pages URL and test two separate devices. GitHub Pages is public hosting: room codes alone are not strong access control.

## What works
- Same-screen board game, Truth or Dare and Position Roulette.
- Supabase-backed 2-player rooms.
- Online shared Truth or Dare card draws, story lines and roulette results.
- Periodic syncing; not push Realtime.

## Important limits
- This is a release candidate, not verified on two live devices.
- Polling and concurrent actions can still cause delays or overwrite one another. Do not assume turn-level transactional locking.
- Room code is an invitation code, not a secure account login.
- Supabase free tier has limits and may pause inactive projects.
- No SQL changes are included: this package reuses your existing Supabase functions.
- If the project uses adult-only decks, share only with adults.
