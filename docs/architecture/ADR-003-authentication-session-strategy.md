# ADR-003: Authentication & Session Management Strategy

## Status
Accepted

## Context
Hospital systems require strict access control, rapid session revocation in the event of compromised credentials, and seamless mobile/web client usability without forcing clinicians to log in repeatedly during clinical shifts.

## Decision
We implemented a **Dual-Token JWT Architecture with Refresh Token Rotation and Granular Device Session Tracking**.

### Architecture:
1. **Access Token**:
   - Lifetime: 15 minutes.
   - Transmission: `Authorization: Bearer <token>` HTTP header.
   - Payload: `{ sub: userId, hospitalId, role, email }`.
   - Signed using HS256/RS256 with 256-bit environment secret.
2. **Refresh Token**:
   - Lifetime: 7 days.
   - Transmission: `HttpOnly`, `SameSite=Strict`, `Secure` cookie to mitigate Cross-Site Scripting (XSS) extraction.
   - Storage: Cryptographically hashed in `RefreshSession` table / Redis cache.
3. **Rotation & Reuse Detection (RFC 6749 Sec 10.4)**:
   - Every time a refresh token is used to obtain a new access token, the presented refresh token is immediately revoked, and a newly generated refresh token is issued.
   - If an already revoked refresh token is presented (indicating token theft or replay attack), the backend revokes the entire session family for that user and emits a security alert.
4. **Device Tracking**:
   - Each session logs `deviceId`, `ipAddress`, and `userAgent`, empowering users and hospital administrators to terminate specific compromised sessions or "Sign out of all devices".

## Consequences
- Highly secure token lifecycle with automatic mitigation against token interception.
- Negligible database load: validation of access tokens is stateless in CPU memory, while refresh occurs only once every 15 minutes.
