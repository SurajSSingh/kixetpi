# Starlight Starter Kit: Basics

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

Use Deno 2 for dependency management and project commands. Installation and production builds have been verified with Deno 2.9.5.

```sh
deno install
deno task dev
```

Dependencies and scripts are defined in `package.json`; Deno resolves packages from the npm registry and records dependency versions in `deno.lock`. Keep this lockfile rather than generating npm, pnpm, or Yarn lockfiles. No separate `deno.json` is required.

## 🚀 Project Structure

Inside of your Astro + Starlight project, you'll see the following folders and files:

```
.
├── public/
├── src/
│   ├── assets/
│   ├── content/
│   │   └── docs/
│   └── content.config.ts
├── astro.config.mjs
├── deno.lock
├── package.json
└── tsconfig.json
```

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name.

Images can be added to `src/assets/` and embedded in Markdown with a relative link.

Static assets, like favicons, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                          |
| :------------------------ | :---------------------------------------------- |
| `deno install`            | Installs dependencies                           |
| `deno task dev`           | Starts local dev server at `localhost:4321`      |
| `deno task build`         | Build your production site to `./dist/`          |
| `deno task preview`       | Preview your build locally, before deploying    |
| `deno task astro ...`     | Run CLI commands like `astro add`, `astro check` |
| `deno task astro --help`  | Get help using the Astro CLI                    |

To run the dev server in the background, use `deno task dev --background`. Manage it with `deno task astro dev status`, `deno task astro dev logs`, and `deno task astro dev stop`.

## 👀 Want to learn more?

Check out [Starlight’s docs](https://starlight.astro.build/), read [the Astro documentation](https://docs.astro.build), or jump into the [Astro Discord server](https://astro.build/chat).
