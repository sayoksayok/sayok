# Supabase Auth – URL config (Option 1)

Do this in **Supabase Dashboard** → your project.

---

## Step 1: Open URL Configuration

1. Go to **https://supabase.com/dashboard**
2. Open your project (**aorpwukuothnigjfkvqz**)
3. Left sidebar → **Authentication**
4. Click **URL Configuration** (under "Configuration")

---

## Step 2: Paste these values

### Site URL
```
https://sayok.chat
```
(Paste into the **Site URL** field.)

### Redirect URLs
Add these two URLs (one per line, or add each and save):

```
https://sayok.chat/auth/callback
http://localhost:3000/auth/callback
```

- Click **Add URL** for each if your UI has that, or paste one per line in the Redirect URLs box.

---

## Step 3: Save

Click **Save** at the bottom.

---

Done. Option 1 (URL config) is complete. Next: enable Google provider and add Client ID/Secret from Google Cloud Console.
