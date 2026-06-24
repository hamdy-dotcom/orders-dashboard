# NML & Sllr Performance Dashboard

## Setup

1. Push this repo to GitHub
2. Deploy to Vercel (connect GitHub repo)
3. In Supabase → Authentication → Settings:
   - Enable Email auth
   - Set Site URL to your Vercel URL
4. Invite users in Supabase → Authentication → Users → Invite User

## Supabase RLS

Run this in Supabase SQL Editor to allow authenticated users to read orders:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read orders"
ON orders FOR SELECT
TO authenticated
USING (true);
```

## Local Development

```bash
npm install
npm start
```
