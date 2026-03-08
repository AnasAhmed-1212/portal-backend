# portal-backend

## Environment Variables

Set these values in Vercel Project Settings -> Environment Variables:

- `MONGO_URL` (or `MONGODB_URI`)
- `JWT_KEY`

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
