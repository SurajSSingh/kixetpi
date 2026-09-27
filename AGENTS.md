## Development

Use Deno 2 for dependency management and project commands, not npm, npx, pnpm, Yarn, or Bun. Installation and production builds have been verified with Deno 2.9.5.

- Install dependencies with `deno install`.
- Run the existing `package.json` scripts with `deno task <script>`; a separate `deno.json` is not required.
- Build with `deno task build` and preview the build with `deno task preview`.
- Run Astro CLI commands with `deno task astro <command>` instead of `npx astro <command>`.
- Keep dependencies in `package.json` and retain `deno.lock` as the dependency lockfile. Do not create lockfiles for other package managers.
- Packages still come from the npm registry through Deno's npm compatibility; do not replace Astro or Starlight imports with URL imports.

When starting the dev server, use background mode:

```sh
deno task dev --background
```

Manage the background server with `deno task astro dev stop`, `deno task astro dev status`, and `deno task astro dev logs`.

When the agent environment requires a managed background-process tool, use that tool to run `deno task dev` without `--background`, and manage the process through the tool instead.

`CLAUDE.md` is a symlink to this file; edit `AGENTS.md` to update both sets of instructions.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
