# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.13.0 create --template minimal --types ts --add tailwindcss="plugins:typography,forms" drizzle="database:postgresql+postgresql:postgres.js+docker:no" sveltekit-adapter="adapter:auto" better-auth="demo:password" --install pnpm ./libiamo-fullstack
```

## Developing

Once you've created a project and installed dependencies with `pnpm install`, start a development server:

```sh
pnpm dev
```

## Building

To create a production version of your app:

```sh
pnpm build
```

You can preview the production build with `pnpm preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.


## User Avatars (Cravatar Integration)
Libiamo uses [Cravatar](https://cravatar.cn) (a Gravatar alternative optimized for speed) to manage user avatars. 
- **Zero Local Storage:** Avatars are dynamically generated based on the MD5 hash of the user's registered email address, saving significant server storage and database complexity.
- **Default Fallbacks:** If user's email doesn't have a linked avatar on Cravatar or Gravatar, an automatic `ident-icon` (a visually unique geometric pattern) is presented.
- **Global Sync:** Users can change their avatars globally across multiple platforms by updating it once on Cravatar or Gravatar website.
