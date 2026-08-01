---
name: Dashboard Defensive Array Guards
description: Always guard API array responses with Array.isArray() on the dashboard
---

## The Rule
The Replit deployment can lag behind code changes — old dist serving for hours. If the dashboard assumes `monthly`, `outstanding`, `agentStats` are always arrays, it throws during partial deploys or when the production api-server has different routes.

```tsx
// Bad
const chartData = monthly?.map(m => ...);  // throws if monthly is an object

// Good
const data = Array.isArray(monthly) ? monthly.map(m => ...) : [];
```

**Why:** After rebuilding the api-server routes, the old production process still serves the old routes. React Query may have stale cached data (object shapes from old routes). Optional chaining only guards against null/undefined, not unexpected objects.

**How to apply:** Any time a hook returns data that should be an array (list queries), wrap with `Array.isArray()` before calling `.map()` or `.length`.
