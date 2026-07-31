---
name: Electron clipboard shortcuts need a menu
description: Why Ctrl+C/V broke in the desktop app and the rule for hiding menus
---
Rule: never call `Menu.setApplicationMenu(null)` in the Electron desktop app — it kills Ctrl+C/V/X accelerators on Windows. Instead keep a menu with edit roles and hide the bar via `setMenuBarVisibility(false)`; add a `context-menu` handler for right-click cut/copy/paste.

**Why:** users could not paste into any field after the production menu was removed.

**How to apply:** see `artifacts/desktop/main.js` createWindow; keep both the roles menu and the Arabic context menu when touching window setup.
