# Setup and publishing

These notes are for the person maintaining the game. Playing the published game requires only a desktop browser.

## Run a local copy

Install Node.js 24 (the project is verified with 24.19.0) and pnpm 11.25.0. Node.js runs the development tools; pnpm installs the project's dependencies.

From the repository folder:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address printed by Vite, including `/c420-sim/`. Stop the local server with Ctrl+C. All game assets are served from the project; no runtime asset service or account is required.

## Check a change

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

- `test` runs the automated physics, race, AI, tutorial, and scoring checks.
- `typecheck` checks that the TypeScript code agrees about the kinds of values being passed around.
- `build` repeats that check and creates the publishable game in `dist/`.
- `preview` serves that publishable version locally. Open its `/c420-sim/` address and test setup, sailing controls, pause, reset, help, settings, all three cameras, free drag/pan/zoom, outlines, island regeneration and daylight, tutorials, race timing, and results.

Browser play tests are still required: passing automated checks does not confirm that the game feels right or that it works on every laptop.

## Publish through GitHub Pages

1. In the GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Review the game's pull request and its checks. Merge it into `main` when approved.
4. Open the repository's **Actions** tab and wait for **Deploy GitHub Pages** to succeed.
5. Open [the game](https://jimthewang.github.io/c420-sim/).

The pull-request workflow runs physics checks, TypeScript checks, and a production build. The deployment workflow runs only on a push to `main`, checks the game again, then publishes `dist/` using GitHub's official `configure-pages`, `upload-pages-artifact`, and `deploy-pages` actions. Preparing the workflow does not prove that the public site has deployed.

Vite's `base` setting must remain `/c420-sim/` while this repository keeps its current name. It tells the browser where the game's files live beneath the GitHub Pages address.

## Reproducible dependencies

Direct dependencies are pinned exactly in `package.json`, including the pnpm version. Commit `pnpm-lock.yaml` whenever an intentional dependency update changes it. `pnpm-workspace.yaml` permits the build step required by esbuild, Vite's TypeScript transformation tool.

The automated workflows use Node.js 24.19.0 and pnpm 11.25.0. For dependency updates, use stable releases and run all checks plus the browser play test before proposing the change.

## Reference documentation

- [GitHub: custom workflows for Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Vite: deploying to GitHub Pages](https://vite.dev/guide/static-deploy#github-pages)
- [pnpm: dependency build settings](https://pnpm.io/settings/build#allowbuilds)
- [Three.js Water](https://threejs.org/docs/#Water) and [Sky](https://threejs.org/docs/#Sky)
