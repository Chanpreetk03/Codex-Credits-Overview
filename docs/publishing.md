# Packaging and publishing

## Local release validation

Build an installable extension archive without publishing it:

```powershell
npm install
npm test
npm run package
```

This produces a `.vsix` file. Install it locally from VS Code with
**Extensions: Install from VSIX...**, restart VS Code, then verify a local
Codex session, session selection, prompt/activity expansion, and status-bar
updates.

## Marketplace publication

The manifest uses the registered Visual Studio Marketplace publisher ID
`ChanpreetKaur`. The publisher ID is independent of the GitHub account and
cannot be changed after creation.

The Marketplace extension identifier is
`ChanpreetKaur.codex-rollout-usage-monitor`. Its visible display name remains
**Codex Rollout Insights**.

After registering and verifying the publisher, publish with the local `vsce`
tool:

```powershell
npx vsce login <publisher-id>
npx vsce publish
```

Do not put access tokens in repository files. Prefer the current secure
publisher-authentication guidance and use CI secrets if automated publishing is
added later.

See the official [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
for publisher registration and current authentication requirements.
