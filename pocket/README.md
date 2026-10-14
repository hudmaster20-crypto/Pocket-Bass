# Pocket — Bass Lab

A responsive bass learning app with a home page, light/dark themes, interactive fretboard, number-system practice, 16 harmony lessons, recall drills, a practice timer, metronome, and separate cloud accounts managed through a developer dashboard.

Start with [NETLIFY-SETUP.md](docs/NETLIFY-SETUP.md) to deploy and enable personal access keys with cloud progress.

The entry point is `pocket/index.html` (this folder). Scripts are in `assets/js/` and styles in `assets/css/`. `npm run build` validates the app and copies only public files into `.netlify/site/` for deployment, `npm test` checks the theory and access/progress logic, and `npm run preview` serves the local version.
