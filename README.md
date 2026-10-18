# KixetPi

A research-stage Astro Starlight documentation site for a leaner, hardened Raspberry Pi OS Lite installation. The guide adapts selected DietPi and Kicksecure practices without converting distributions. Nix and Home Manager are optional and manage user packages, not the operating system.

The combined setup has not been tested on Raspberry Pi hardware. Commands in the published guides are instructions for a separate test Pi, not setup commands for this website or its development machine.

## Develop the site

Use Deno 2 for dependency management and project commands. Installation and production builds have been verified with Deno 2.9.5.

```sh
deno install
deno task dev
```

Dependencies and scripts are defined in `package.json`; Deno resolves packages from the npm registry and records dependency versions in `deno.lock`. Keep this lockfile rather than generating npm, pnpm, or Yarn lockfiles. No separate `deno.json` is required.

## Content

The site has an overview, four main guides, and a separate agent assistance companion:

| File in `src/content/docs/` | Purpose |
| --- | --- |
| `index.md` | Scope, package ownership, safety, and walkthrough record. |
| `guides/raspberry-pi-os.md` | Image selection, first boot, updates, baseline, and recovery. |
| `guides/dietpi.md` | Selective service and package reduction with resource tradeoffs. |
| `guides/kicksecure.md` | SSH, firewall, update checks, and confinement limits. |
| `guides/nix.md` | Optional declarative user packages and rollback. |
| [`reference/agent-assistance.md`](src/content/docs/reference/agent-assistance.md) | Agent reading path, command semantics, decision gates, and resumable handoff. |

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name.

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                          |
| :------------------------ | :---------------------------------------------- |
| `deno install`            | Installs dependencies                           |
| `deno task dev`           | Starts local dev server at `localhost:4321/kixetpi/` |
| `deno task build`         | Build your production site to `./dist/`          |
| `deno task preview`       | Preview your build locally, before deploying    |
| `deno task astro ...`     | Run CLI commands like `astro add`, `astro check` |
| `deno task astro --help`  | Get help using the Astro CLI                    |

To run the dev server in the background, use `deno task dev --background`. Manage it with `deno task astro dev status`, `deno task astro dev logs`, and `deno task astro dev stop`.

## Validate changes

Run `deno task build` to validate content and generate the static site and search index. With dependencies already installed, `deno task --node-modules-dir=manual --frozen build` uses the existing dependency directory and refuses lockfile changes. A website build does not test any Raspberry Pi instructions.

Keep source links next to the relevant guidance, distinguish upstream facts from project choices, and record hardware test results before claiming support. Do not add distribution conversion scripts or run the guide's system commands on the documentation host.

## GitHub Pages

The site is configured for <https://surajssingh.github.io/kixetpi/>. In the repository's **Settings > Pages > Build and deployment**, select **GitHub Actions** as the source (a one-time setup).

The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`, and can also be run manually from the Actions tab. It uses Astro's official Pages action with Deno 2.9.5, the existing `deno.lock`, and `deno task build`, then deploys the generated artifact with GitHub's official Pages action. No deployment branch or personal access token is needed.

Astro's `site` and `base` are set in `astro.config.mjs`. Internal Markdown links include the `/kixetpi` prefix; update these along with the config if the hosting path changes. Local development and preview use this same prefix.

Site tooling references are the [Starlight documentation](https://starlight.astro.build/) and [Astro documentation](https://docs.astro.build/).
