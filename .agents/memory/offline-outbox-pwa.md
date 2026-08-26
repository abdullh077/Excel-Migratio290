---
name: Visa manager offline mode history (reversed twice — check current state before assuming either way)
description: Offline support was removed, then reinstated with a full architecture. Read offline-sync-architecture.md for the current design; this file is only the timeline.
---
- Offline capability for this app has been flipped once already (removed, then reinstated with full read/write support for the daily-work pages while a few admin-only pages stayed online-required). Don't assume either state — check the current code.
- See [offline-sync-architecture.md](offline-sync-architecture.md) for the design that replaced the old app-wide online-only gate.
