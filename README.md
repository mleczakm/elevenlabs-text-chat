# `@mleczakm/elevenlabs-text-chat`

[![CI](https://github.com/mleczakm/elevenlabs-text-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/mleczakm/elevenlabs-text-chat/actions/workflows/ci.yml)

A lightweight, browser-only text transport for ElevenLabs Conversational AI. It has no speech module, UI, framework, or runtime dependencies.

The host application owns its session endpoint, consent and authentication rules, identity/context prompt, transcript persistence, and rendering.

## Session-backed usage

```js
import { ElevenLabsTextChatClient } from '@mleczakm/elevenlabs-text-chat';

const client = new ElevenLabsTextChatClient({
  sessionProvider: async () => {
    const response = await fetch('/api/chat/signed-url', { method: 'POST' });
    if (!response.ok) throw new Error(`Session request failed (${response.status})`);
    return response.json(); // signed_url and optional dynamic_variables
  },
  onEvent(event) {
    // response_start, response_delta, response_complete, response,
    // agent_error, or transport_error
  },
  onStatusChange(status) {
    // connecting, connected, disconnected, or error
  },
});

await client.send('Hi', { context: 'App-specific identity and prior history.' });
```

The provider can return `null` when the app needs to pause for consent or login. `send` then returns `false` without opening a socket.

## Public agent usage

For an agent intentionally configured for direct browser access, pass its public agent ID instead of a session provider:

```js
const client = new ElevenLabsTextChatClient({ agentId: 'agent_…' });
await client.send('Hi');
```

Do not put an ElevenLabs API key in browser code. Use a backend-issued signed URL when the agent requires authenticated access or app-specific dynamic variables.

## Development

The package has no runtime dependencies. Its Node development tools are used only for linting and tests:

```sh
npm ci
npm run lint
npm test
npm pack --dry-run
```

The build copies the browser module from `src/` to `dist/`. CI runs linting and tests, then builds and packs the npm artifact.

## Release

The package source and release workflow live in this repository. To release, update `version` in `package.json`, commit and push, create a matching Git tag such as `v0.1.2`, then publish a GitHub release for that tag. The `Publish to npm` workflow reruns lint and tests, checks that the tag matches the package version, and publishes the built package with provenance using npm trusted publishing.

Configure this repository as the package's trusted publisher in npm package settings (`mleczakm` / `elevenlabs-text-chat` / `.github/workflows/publish.yml`) before the first automated release. No long-lived npm publish token is needed.
