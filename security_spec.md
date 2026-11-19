# Earn Easy Security Specification (Phase 0: Payload-First TDD)

## 1. Core Data Invariants
1. **Owner & Verified Email Gate**: All mutations require `request.auth != null && request.auth.token.email_verified == true`.
2. **No Self-Privilege or Free Money**: Users cannot directly edit `brlBalanceCents` to arbitrary amounts on `/users/{userId}` without a matching atomic conversion or withdrawal write (`getAfter()`), and cannot set `status: 'suspended'` or modify `totalWithdrawnCents` directly.
3. **Once-Per-Day Conversion Lock**: A `PointConversion` document requires `pointsConverted >= 1000`, `pointsConverted % 1000 == 0`, `brlCentsCredited == pointsConverted / 100`, `captchaVerified == true`, and atomically updates `/users/{userId}` where `existing.lastConversionDate != conversionDate`.
4. **Minimum R$ 5,00 Pix Withdrawal**: A `PixWithdrawal` document requires `amountCents >= 500`, `status == 'pending'`, and atomically deducts `amountCents` from `/users/{userId}.brlBalanceCents` in the same batch/transaction.
5. **Terminal & Tiered Withdrawal States**: Users can never approve or mark their own `PixWithdrawal` as `'paid'` or `'approved'`. Only admins (`isAdmin()`) can transition withdrawal `status`.
6. **PII Isolation**: User email, Pix key, and device fingerprint live in `/users/{userId}/private/info` and are readable only by `isOwner(userId)` or `isAdmin()`.
7. **Admin Bootstrapping & Protection**: Only verified bootstrapped admin (`anthonysamuel61500@gmail.com` with `email_verified == true`) or existing `/admins/{uid}` documents hold admin rights. Users cannot write to `/admins` or `/integrations`.
8. **Score Cap Anti-Fraud**: A single `GameSession` cannot award more than 500 points (`scoreEarned >= 0 && scoreEarned <= 500`) and must have `durationMs >= 3000`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unverified Email Spoof**: Attacker signs in with `email_verified: false` claiming admin email and tries to read `/withdrawals`.
2. **Self-Admin Escalation**: Regular user writes `/admins/{uid}` trying to grant themselves admin role.
3. **Direct Money Minting**: User updates `/users/{uid}` directly setting `brlBalanceCents: 999999` without an atomic conversion or withdrawal.
4. **Below-Minimum Pix Withdrawal**: User creates `/withdrawals/{id}` with `amountCents: 499` (R$ 4,99 < R$ 5,00).
5. **Self-Paid Withdrawal**: User updates `/withdrawals/{id}` changing `status` from `'pending'` to `'paid'`.
6. **Double Daily Conversion**: User creates a second `/conversions/{id}` on the same `conversionDate` as `user.lastConversionDate`.
7. **Invalid Conversion Math**: User creates `/conversions/{id}` with `pointsConverted: 1000` and `brlCentsCredited: 5000`.
8. **Score Cap Overflow**: User creates `/gameSessions/{id}` with `scoreEarned: 50000` or `durationMs: 100`.
9. **Shadow Field Injection**: User creates `/users/{uid}` with extra ghost field `isAdmin: true`.
10. **Cross-User PII Read**: Authenticated User A tries to `get` `/users/userB/private/info`.
11. **Blanket List Scraping**: Non-admin user tries to `list` `/gameSessions` or `/withdrawals` without `userId == request.auth.uid`.
12. **ID Poisoning / Payload Exhaustion**: User creates document with 1,500-character ID or 10KB `displayName`.
