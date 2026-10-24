# Widget overview and architecture

Widget documentation is maintained in the independent repository. [qiye-widgets / Widgets-Overview-en](https://github.com/Ktclat/qiye-widgets/blob/main/docs/wiki/Widgets-Overview-en.md)

[Host API and repository boundaries](../PLUGIN-API.md).

## Host folder windows

2026-10-24: The user's iTab references and folder screenshot guide a compact website grid. Browsing and editing share a 46px title bar: name and count on the left, edit and close on the right. There is no repeated title description or bottom Done button. Four desktop columns reflow to three or two in narrow windows; large collections scroll inside the content area. Empty folders explain how to add websites. The existing workspace surface prevents desktop icons from distracting through the panel.

Public reference: [iTab help](https://go.itab.link/help), which includes the folder entry. Keyboard behavior follows the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): initial focus on the static title, Tab contained within the window, and Escape returning focus to its opener. [MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) informs pointer versus keyboard focus treatment. Each icon and label share a link and context menu; Shift+F10 opens the same menu. See [QA](../QA.md) for verification scope.
