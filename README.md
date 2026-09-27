# ReviewKaro — AI-Generated Reviews in Seconds
### by KnownLabs

Customer QR scan kare → AI uske liye review likhe → woh Google pe post kare. 30 second me, bina kuch likhe.

## Product flow
1. **Client** dashboard se QR download karke print lagata hai
2. **Customer** scan karta hai → *"Aapka experience kaisa raha?"* → text buttons (Badhiya tha / Theek nahi tha)
3. **Badhiya** → Gemini AI review likhta hai (English/Hinglish, regenerate) → Copy → Google review page → paste & post
4. **Theek nahi** → private feedback → sirf client ke dashboard inbox me (Google pe kuch nahi)

## Paise
- ₹399/month · ₹999/3 months · manual UPI
- 3-day free trial → 3-day grace (reminders) → QR auto-pause
- Superadmin (KnownLabs) 1 click me plan extend/expire karta hai

## Files
| File | Kya hai |
|---|---|
| `index.html` | Product website (flow, pricing, FAQ) |
| `r.html` + `assets/js/r.js` | Customer page (QR se khulti hai) |
| `admin/index.html` + `assets/js/admin.js` | Login + Superadmin + Client dashboards |
| `assets/js/config.js` | Keys + pricing + UPI (yeh bharna hai) |
| `supabase/schema.sql` | Tables + RLS + guards |
| `supabase/seed.sql` | Demo data |
| `supabase/SETUP.md` | 10-min setup guide |

## Setup
`supabase/SETUP.md` dekho — naya Supabase project → schema → seed → superadmin user → keys → Gemini key (free).

## Costs (monthly, approx)
Hosting ₹0 · Supabase ₹0 · UPI ₹0 · Gemini AI free tier (bina key ke templates backup). Domain optional ~₹900/saal.
