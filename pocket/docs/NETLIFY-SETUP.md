# Pocket — deploy to Netlify

The complete package includes the responsive app, light/dark themes, 16 expanded harmony lessons, cloud-only player accounts, and a developer dashboard. It does not create local accounts. Unsigned guest practice is temporary.

## First deployment

1. Unzip **Pocket-Netlify.zip**. It contains one `pocket` folder, with `index.html` directly inside it. Put the contents of `pocket` in the root of a GitHub, GitLab, or Bitbucket repository you control. If you commit the entire `pocket` folder instead, set Netlify's base directory to `pocket`.
2. In Netlify, choose **Add new project → Import an existing project** and select that repository.
3. The included `netlify.toml` supplies these settings:
   - Build command: `npm run build`
   - Publish directory: `.netlify/site`
   - Functions directory: `netlify/functions`
   - Node.js: 22
4. In the Netlify project's environment variables, add **POCKET_ADMIN_KEY**. Use a randomly generated secret of at least 32 characters and save it in your password manager. Include Functions scope if your plan offers scope selection; otherwise the default all-scopes setting works. Never put this secret in browser code, `netlify.toml`, or Git.
5. Deploy. If you added the environment variable after the first deployment, redeploy to apply it.
6. Open the Netlify URL and choose **My account → Developer dashboard**. Sign in with your developer key from step 4.
7. Enter a player's name and choose **Create account**. Copy their newly generated access key and give it privately to them. They use **My account** to sign in on any device.

Netlify automatically provides the Blobs storage used by the backend. No separate database account or database token is required. Usage is subject to your Netlify plan's hosting, functions, and storage limits.

## Where index.html belongs

The editable entry point is exactly `pocket/index.html`. It is no longer inside `dist`. Supporting browser files are organized in `pocket/assets/js` and `pocket/assets/css`; deployment tools, server code, tests, and documentation have their own folders.

For a full deployment, run the configured build. It copies only `index.html` and `assets` into the generated `.netlify/site` publish directory. This keeps backend code and project files out of the public website. Do not upload the entire source folder through Netlify Drop.

**For drag-and-drop preview:** unzip **Pocket-Static-Preview.zip**, then drag its **pocket** folder into Netlify Drop. That folder contains only `index.html` and `assets`. Cloud accounts require the full repository/CLI deployment; Drop does not build this package's backend.

## Developer dashboard

- Create named cloud accounts and issue a random access key for each person.
- View each player's completed lessons, accuracy, and practice minutes.
- Rename accounts without changing their key or progress.
- Replace lost keys while keeping the same account and progress.
- Revoke access. Old keys and sessions are rejected at the next server request, while progress is preserved.
- Refresh the account list to see recent progress.

Keys are shown once when generated. Anyone holding a player's key can access that player's progress, so share each key privately. There is no email/password recovery flow; the developer replaces lost keys.

## Progress and migration

Player accounts and progress live in the server's Netlify Blobs store and survive redeployments. A player uses the same key on another device to load the same record. The browser stores the theme choice and unsent cloud-save operations so a interrupted connection can be retried; it is not the account database.

Guest practice has no persistent account and resets when the page reloads. Sign in to save progress. Use **Refresh progress** to pull changes from another device into an already-open session.

To migrate from the original app, open it in the browser where you practiced, choose **My account → Export original-version progress**, then sign into the new cloud account on Netlify and import that file. Browser data cannot automatically cross from the ChatGPT Site URL to your new Netlify URL.

Backups merge completed lessons and keep the higher totals. They do not add unrelated practice histories together. The old library data is left in legacy browser storage but is no longer shown or used.

## CLI deployment instead of repository import

Install Node.js 22 or newer. From the extracted project folder:

```sh
npm install
npm run build
npm test
npx netlify-cli login
npx netlify-cli link
npx netlify-cli deploy --build --prod
```

For a new project, use `npx netlify-cli init` instead of `link`. Configure the developer secret in the Netlify dashboard before the production deploy. Do not put it in shell history.

## Local development

`npm run preview` serves the static guest preview at `http://127.0.0.1:4173`. To run Netlify Functions with your linked project and environment variables, use `npx netlify-cli dev` and open `http://localhost:8888`.

`npm test` checks authentication, cookie signatures and expiry, account isolation, concurrent saves, duplicate retries, developer privileges, key replacement/revocation, guest behavior, music data, and the installed Netlify Blobs adapter using its local storage emulator. Tests do not use live account data.

After deploying, create two test accounts, save a lesson in the first, confirm the second starts separately, and sign into the first on your phone to confirm cross-device persistence. Live Netlify deployment must still be checked after account setup; the package has not been deployed to your Netlify account by this chat.

## Security and deployment notes

- Player keys contain 256 bits of randomness. Only key hashes are stored in lookup records.
- Session cookies are signed, HttpOnly, SameSite=Strict, and Secure over HTTPS. Player sessions last seven days; developer sessions last one hour.
- Changing `POCKET_ADMIN_KEY` and redeploying expires signed sessions. Player keys still work for signing in again.
- Lessons and practice tools are publicly readable on Netlify. Keys protect personal progress and developer operations, not the static curriculum.
- The existing ChatGPT Site preview uses its current sharing settings. Its static preview does not run Netlify Functions.
- Server code is outside the generated `.netlify/site` directory, so it is not published as downloadable website assets.

References checked: [publish-directory/index.html requirements](https://docs.netlify.com/resources/troubleshooting/page-not-found-error-guide/), [function configuration](https://docs.netlify.com/build/functions/configuration/), [function environment variables](https://docs.netlify.com/build/functions/environment-variables/), [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), and [CLI deployment](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).
