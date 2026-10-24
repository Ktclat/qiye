# Widget overview and architecture

Widget documentation is maintained in the independent repository. [qiye-widgets / Widgets-Overview-en](https://github.com/Ktclat/qiye-widgets/blob/main/docs/wiki/Widgets-Overview-en.md)

[Host API and repository boundaries](../PLUGIN-API.md).

## Consistent dialog title bars

2026-10-24: The folder window's 46px single-row title bar now also covers website editing, groups, moving items, local search, widget configuration, backup restore, sync review and confirmations. Descriptions sit below the bar; long titles truncate with a full tooltip while Close remains visible. Settings in both drawer and window mode, and the wallpaper library, show the current category or source beside their title. Repeated navigation headings are removed, with navigation and content scrolling independently.

The user's iTab references and folder screenshot remain the visual baseline, alongside [public iTab help](https://go.itab.link/help). Following the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), settings, galleries and confirmations initially focus their static title, while forms and search focus an input. Tab and Shift+Tab wrap between available host controls; Escape restores the opener. [MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) informs pointer versus keyboard treatment without initially outlining Close. Isolated widget pages retain their own keyboard handling.

Add, bookmark import and widget main windows already use 44–48px bars. Independent widgets 1.0.11 also update nested bookmark editors, hot-list subscription management, countdown forms and the world-clock city picker. Existing installations remain version-pinned and update explicitly through source details. See [QA](../QA.md) for verification.

## Host folder windows

2026-10-24: The user's iTab references and folder screenshot guide a compact website grid. Browsing and editing share a 46px title bar: name and count on the left, edit and close on the right. There is no repeated title description or bottom Done button. Four desktop columns reflow to three or two in narrow windows; large collections scroll inside the content area. Empty folders explain how to add websites. The existing workspace surface prevents desktop icons from distracting through the panel.

Public reference: [iTab help](https://go.itab.link/help), which includes the folder entry. Keyboard behavior follows the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): initial focus on the static title, Tab contained within the window, and Escape returning focus to its opener. [MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) informs pointer versus keyboard focus treatment. Each icon and label share a link and context menu; Shift+F10 opens the same menu. See [QA](../QA.md) for verification scope.
