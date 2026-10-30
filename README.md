# portal-backend

## Environment Variables

Set these values in Vercel Project Settings -> Environment Variables:

- `MONGO_URL` (or `MONGODB_URI`)
- `JWT_KEY`
- `FBR_API_BASE_URL` (optional; defaults to `https://gw.fbr.gov.pk/di_data/v1/di`)

Important:

- In Vercel environment variables, do not add quotes around values.
- Do not end values with semicolons.
- If your local `.env` `JWT_KEY` contains `#`, wrap only that value in quotes (without a semicolon).
- For MongoDB Atlas, allow Vercel access from Atlas Network Access (`0.0.0.0/0`) or your required IP range.

Example:

```env
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_KEY=replace_with_a_long_random_secret
```


## Secure token deployment and migration

Deploy the backend and frontend together. The frontend no longer receives FBR tokens;
reference lookups are authenticated backend calls scoped to the assigned seller.
Administrators select the seller explicitly. Token fields in the seller editor are
replacement-only: leaving them blank preserves the existing token.

1. Back up MongoDB using a restricted, encrypted backup and use a maintenance window.
2. Generate a 32-byte key in a trusted terminal:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
3. Store it as backend-only `TOKEN_ENCRYPTION_KEY` in your hosting secret settings
   and secure key backup. Never commit it, put it in MongoDB, share it, or use a
   `VITE_` prefix. Losing or changing it makes existing tokens unreadable. Do not
   regenerate it on each deploy. Use the same key for the migration and server.
4. Set backend `CORS_ORIGINS` to your exact frontend origins, comma-separated
   (for example `https://your-portal.example,http://localhost:5173`). CORS is a
   browser restriction; authentication and seller checks enforce access.
5. With the new backend source and the same MongoDB/key environment, run
   `npm run migrate:tokens`. This encrypts production and sandbox tokens using
   AES-256-GCM, authenticates the seller/model/field identity, and updates the
   configured flag. The command is idempotent and fails on a wrong key. It does
   not print tokens. Resolve failures before enabling traffic. Legacy plaintext
   credentials are deliberately not accepted by the running application.
6. Set frontend `VITE_API_URL` to this backend's HTTPS origin and build/deploy
   both apps. Reference forms, login, editing and publishing use that one origin;
   requests no longer fall back to localhost or other environments.
7. Replace previously browser-exposed FBR tokens through the seller editor after
   issuing replacements through FBR. The database migration encrypts existing
   values; it does not revoke or rotate credentials at FBR. Do the same for
   sandbox tokens if needed.
8. Run `npm test` in the backend and `npm run build` in the frontend. Verify a
   seller's login, reference lookups, buyer/item edits, and controlled FBR
   validation before resuming normal submission.

New and replacement tokens are encrypted on document save; ordinary queries omit
credentials and JSON/object serialization strips them even after explicit selection.
Use document `save()` for credential changes; do not bypass hooks with raw updates.
Token creation/replacement and FBR acceptance create identifier-only records in
`auditevents`. Restrict database write access so application users cannot alter
these records. This is an operational audit trail, not tamper-proof storage.
Do not log request bodies, Authorization headers, or database URLs in hosting/APM.
Existing plaintext backups still need restricted access and a retention policy.

Keep database accounts scoped to the application's database, require MFA for
hosting/database administrators, and restrict database network access to approved
application egress/private networking where supported. Infrastructure settings,
backups, FBR token rotation and production migration are operator actions; changing
source does not apply these settings to a live deployment.
