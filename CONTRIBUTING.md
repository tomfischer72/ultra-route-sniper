# Contributing

Thanks for helping improve Ultra Route Sniper.

## Workflow

1. Create a feature/fix branch from the current stable branch.
2. Keep changes small and focused.
3. Test manually on mobile and desktop.
4. Open a pull request with:
   - clear summary
   - test steps
   - screenshots for UI changes

## Development Notes

- This app is static (`HTML/CSS/JS`) and PWA-first.
- Keep interactions simple and high-contrast for exhausted riders.
- Prefer low-data and offline-friendly behavior.
- Do not add heavy frameworks.

## Internationalization

- UI languages: `DE`, `EN`, `FR`, `IT`
- Documentation languages: `DE`, `EN`
- New user-facing strings must be added to the i18n dictionary in `app.js`.

## Commit Messages

Use concise, intent-first messages, e.g.:

- `Add live scan mode defaults for route-relative search.`
- `Fix map bounds handling for layer groups.`
