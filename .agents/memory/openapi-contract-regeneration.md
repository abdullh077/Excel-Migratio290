---
name: OpenAPI contract regeneration
description: Keeping API specs and generated validators aligned with live Visa Manager request and response shapes.
---

Treat `lib/api-spec/openapi.yaml` as the contract source before regenerating API clients and Zod validators. If the generated definitions contain live fields that the source spec omits, update the source spec first; do not accept their disappearance as harmless regeneration noise.

**Why:** Zod strips unknown object keys by default. A stale request schema can therefore turn a routine codegen run into silent loss of valid fields supplied by the UI.

**How to apply:** When changing or regenerating the contract, compare generated request schemas with the inputs consumed by routes, preserve genuinely supported optional fields in the OpenAPI source, run codegen, then run the complete workspace typecheck.