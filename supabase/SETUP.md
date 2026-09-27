# ReviewKaro — Setup (10 minute, ek baar)

## Step 0 — Naya Supabase project (2 min)
1. supabase.com → **New project**
2. Name: `reviewkaro`, database password set karo → **Create new project** (~2 min lagega)
3. **Project Settings (gear icon) → API** → **Project URL** aur **anon public key** copy karo
4. `assets/js/config.js` kholo → `SUPABASE_URL` aur `SUPABASE_ANON_KEY` me paste karo → save

## Step 1 — Tables banao (2 min)
1. Supabase dashboard → **SQL Editor** → **New query**
2. `supabase/schema.sql` kholo, poora copy karo, paste karo, **Run**
3. "Success" dikhe toh done

## Step 2 — Demo data (1 min)
1. **SQL Editor** → **New query**
2. `supabase/seed.sql` copy-paste → **Run**

## Step 3 — Apna superadmin login (3 min)
1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Apna email + password dalo, **Auto Confirm User** ON rakho → **Create user**
3. Us user pe click karo → uska **UID** copy karo
4. **SQL Editor** → **New query** → ye chalao (UID paste karke):
```sql
insert into rk_profiles (user_id, role) values ('PASTE-UID-YAHAN', 'superadmin');
```

## Step 3b — Google login ON karo (ek baar, ~10 min, FREE)

Clients "Sign in with Google" se login karenge — password banane/bhejne ka jhanjhat khatam.

**A. Google Cloud Console (console.cloud.google.com)**
1. Naya project banao (naam: `ReviewKaro`)
2. **APIs & Services → OAuth consent screen** → User type: **External** → Create
   - App name: `ReviewKaro`, User support email: apna email → Save
   - Scopes: kuch add mat karo (default openid/email/profile hi chahiye) → Save
   - **Audience/Publish**: **PUBLISH APP** dabao (sirf basic scopes hain, verification nahi chahiye)
3. **APIs & Services → Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**, naam: `ReviewKaro Web`
   - **Authorized redirect URIs** me ye add karo (apna Supabase project ref lagao — Project Settings → General me milega):
     `https://APNA-PROJECT-REF.supabase.co/auth/v1/callback`
   - Create → **Client ID** aur **Client secret** copy karo

**B. Supabase dashboard**
4. **Authentication → Providers → Google** → Enable ON → Client ID + Client secret paste → Save
5. **Authentication → URL Configuration**:
   - Site URL: `http://127.0.0.1:5500` (abhi Live Server testing ke liye; site live hote time asli domain dalna)
   - Redirect URLs me add karo: `http://127.0.0.1:5500/**`

**C. Test**
6. `admin/index.html` kholo → **Sign in with Google** dabao → Google account chuno → wapas admin pe aana chahiye
7. Note: tum (superadmin) apne purane email+password se login karte raho — clients Google se ayenge. Dono saath me chalte hain.

---
## Step 4 — Gemini AI key (2 min, FREE)
1. [Google AI Studio](https://aistudio.google.com/apikey) kholo → **Create API key**
2. Card nahi chahiye, bilkul free → key copy karo
3. `assets/js/config.js` me `GEMINI_KEY` me paste karo → save
4. `KNOWNLABS_UPI` me apni UPI ID likho (jaise `jatinsingh@okhdfc`)
5. Key na bhi dalo toh chalega — ready-made templates backup me hain

## Step 5 — Test (2 min)
1. `admin/index.html` kholo → apne email/password se login
2. Superadmin dashboard dikhega — demo business "Glow & Grace Salon" ke saath
3. **Clients** → demo business ka **QR** kholo → phone se scan karo → poora flow test karo

---

## Naya client onboard karna (2 min per client)
1. ReviewKaro admin → **Clients** → **+ Add client** — client ka **Gmail** + business ka naam → Save (3-day trial auto-start)
2. Client ko WhatsApp karo:
   > *Hi! Your ReviewKaro is ready. Open this link and tap "Sign in with Google" (use ___@gmail.com): <admin link>. On first login, complete your shop details — your 3-day free trial has started.*
3. Client Google se login karke setup wizard complete karta hai (business name, category, city, Google review URL, WhatsApp number) → **My QR** se QR download → print → counter pe lagao
4. Note: client ko **usi Gmail** se sign in karna hoga jo step 1 me dala tha — alag email se "account not linked" dikhega

## Paise aane pe
Client UPI pe pay kare → **Clients** me uske naam pe **"1 mahina"** (₹399) ya **"3 mahine"** (₹999) dabao → validity extend. Trial (3 din) → grace (3 din) → auto-pause system khud handle karta hai.
