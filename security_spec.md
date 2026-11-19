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
9. **Leaderboard Integrity (`getAfter`)**: `/leaderboard/{userId}` contains zero PII and requires `getAfter()` atomic balance parity with `/users/{userId}` so players cannot forge higher balances on the global ranking.
10. **Daily Check-in Lock, Streak Reset & 30-Day R$ 10,00 Bonus**: Users may claim at most one `/dailyCheckins/chk_{uid}_{yyyy_mm_dd}` per server UTC date (`!exists` + `existsAfter` + `getAfter` points and BRL bonus parity on `/users/{uid}`), bounded strictly to `120 <= pointsAwarded <= 200` (1,000–1,200 pts/week). `streakDay` advances only when yesterday's check-in (`chk_{uid}_{yesterday_utc}`) exists, otherwise resetting to `1`; only `streakDay == 30` may credit `brlBonusCents == 1000` (R$ 10,00).
11. **Immediate Anti-Profanity Suspension**: Users may only transition their own account to `status: 'suspended'` with `riskScore: 100` (never from `'suspended'` back to `'active'`), locking out all rewards and payouts while preserving admin reactivation control.
12. **Admin-Only Ban Reason & Explanation**: Only `isAdmin()` may set or clear `banReason`, `banExplanation`, and `bannedBy` on `/users/{userId}` and emit `'admin_ban'` audit entries in `/fraudLogs`. Regular users cannot include or mutate ban metadata.
13. **Verified Level-Up Reward Claims**: Users may claim a one-time `/levelRewards/lvl_{uid}_{level}` bonus (`200/400/800/1500/3000` pts for levels `2..6`) only when `(existing.lifetimePoints + existing.gamesPlayed * 25) >= tierMinXp` and only via atomic `!exists` + `existsAfter` parity with `/users/{uid}.pointsBalance`.
14. **Referral Signup (+500 pts) & 12% Ongoing Commission**: A newly created `/referrals/{invitedUid}` atomically credits exactly `500` points to `referrerUid` once per invited user (`!exists` + `existsAfter`). Subsequent gameplay/check-in point gains by `invitedUid` atomically credit `Math.floor(earned * 0.12)` points to `referrerUid` verified via pure integer bounds against `users/{invitedUid}` and `referrals/{invitedUid}`.
15. **Admin-Only Promo Code Events & One-Time Redemptions**: Only `isAdmin()` may create or modify `/promoCodes/{code}` events. Private codes cannot be listed by non-admins; public events require `active == true && publicEvent == true`. Each user may redeem a code at most once via `/promoRedemptions/prm_{uid}_{code}` with exact `pointsValue` parity.

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
