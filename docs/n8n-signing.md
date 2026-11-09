# Request signing (draft for README, Task 14)

Both directions use the same scheme (`convex/lib/hmac.ts`).

- Headers: `X-LendLoop-Timestamp` (unix seconds) and `X-LendLoop-Signature` (lowercase hex HMAC-SHA256).
- Canonical string: `${timestamp}.${METHOD}.${path}.${rawBody}` — METHOD uppercase, path = pathname only, rawBody = exact text sent (`""` for GET).
- Receiver rejects if `|now - timestamp| > 300 s` or the signature does not match (constant-time compare). Response: `401 unauthorized`, no detail.
- Secrets: `LENDLOOP_TO_N8N_SECRET` (Convex signs, n8n verifies), `N8N_TO_LENDLOOP_SECRET` (n8n signs, Convex verifies).

## Fixed test vector

The n8n Code node (`require('crypto')`) must reproduce this value:

| secret | canonical | signature |
|---|---|---|
| `s3cret` | `1700000000.POST./api/x.{}` | `a7a5eb0d86209484fa6b1524199f9fb7ffcfee26aae250c4ca68fe2cb1243582` |

```js
require('crypto').createHmac('sha256', 's3cret').update('1700000000.POST./api/x.{}').digest('hex')
```
