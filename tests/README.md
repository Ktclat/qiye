# Host tests

`npm test` covers the desktop, persistence, sync, security boundaries and host protocol. Fixtures represent an existing installed desktop; fresh-install tests explicitly assert that no widgets are shipped.

Active browser checks: `plugin-e2e.py` (also `--preview`), `extension-e2e.py`, `editor-e2e.py`, `search-overlays-e2e.py` (also `--preview`) and `tab-favicon-e2e.py`. The default plugin fixture lives entirely in this repository. Pass `--widgets ../qiye-widgets/dist` to plugin / extension checks for optional cross-repository integration.

`browser-e2e.py`, `interaction-e2e.py` and `presentation-e2e.py` are historical pre-split scenarios. They assume embedded default widgets and are retained for reference, not the current CI entry points. Component-specific browser scenarios and current runtime tests live in qiye-widgets.
