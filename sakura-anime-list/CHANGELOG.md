# Changelog

## v0.5 — minimal cloud-first version
- Removed avatar editing; the small sidebar character is fixed.
- Profile/account page now only edits the username and password.
- Replaced the optional login modal with a dedicated login/register screen.
- Required Supabase for the personal library; removed demo anime and misleading local-only library saves.
- Removed the Home boxes “Your library” and “Your own little corner”. Home now shows only the summary and recently added titles.
- Simplified Settings to a sakura animation toggle and sign out.
- Simplified Add Anime: select a catalogue result, get cover and category automatically, choose a rating and save.
- Searches Jikan, Kitsu and AniList together, merges matching records, and uses the available genre metadata for category assignment.
- Added a `config.js` for public Supabase configuration, refreshed PWA cache, and updated the SQL schema/README for GitHub Pages deployment.
