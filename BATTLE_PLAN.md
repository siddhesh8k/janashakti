# JanaShakti — Build Battle Plan
## Complete in 1 Day (Today) — Step by Step

---

## WHAT YOU HAVE (Already Done For You)

I've built the ENTIRE codebase (counts below reflect the current shipped app):

- 12 screens (Home, Report, Map, Profile, IssueDetail, Analytics, Authority, Agents, Onboarding, Leaderboard, Journalist, Notifications)
- 30 components (BottomNav, TopNav, IssueCard, PressureMeter, VoiceAssistant, etc.)
- 7 AI agents (Analyzer, Duplicate Detector, Authority Router, Predictor, Verifier, ESG Scorer, autonomous Coordinator) — Detector & Router run as bounded ReAct loops (shared `reactLoop.js`)
- 9 hooks (useAuth, useIssues, useUser, useLocation, useAgents, useNotifications, usePagination, …)
- 31 utils (gemini, n8n, social, escalation, reactLoop, cityDetect, geo, rti, …)
- Theme system (colors, typography, spacing, components)
- Constants (issueTypes, departments, cities, representatives, mapStyle, voiceLang)
- Firebase config, Firestore rules, PWA manifest
- Sample data seeder (15 realistic issues)

---

## SPRINT 1: Project Setup (30 minutes)

### Step 1: Download the project folder
Download the `janashakti` folder from this chat (all files above).

### Step 2: Open terminal in the project folder
```bash
cd janashakti
```

### Step 3: Install dependencies
```bash
npm install
```

### Step 4: Get your API keys
You need 2 keys (you already have Firebase):

**A) Gemini API Key (MANDATORY — this is your primary AI)**
1. Go to: https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy the key

**B) Google Maps API Key (for map screen)**
1. Go to: https://console.cloud.google.com
2. Enable "Maps JavaScript API" and "Geocoding API"
3. Create API key under Credentials
4. (If you skip this, the map shows a list fallback — still works)

### Step 5: Update your .env file
Open `.env` and fill in:
```
VITE_GEMINI_API_KEY=paste_your_gemini_key_here
VITE_GOOGLE_MAPS_KEY=paste_your_maps_key_here
```
(Firebase keys are already filled in from your config)

### Step 6: Set up Firebase services
Go to https://console.firebase.google.com → your project:

1. **Authentication** → Sign-in method → Enable:
   - Google (add your web client ID)
   - Anonymous
   - Email/Password

2. **Firestore Database** → Create database → Start in test mode

3. **Storage** → NOT required. Photos are compressed and stored inline as base64
   data URLs in Firestore, so the app runs on the free Spark plan. (Cloud Storage
   now needs the Blaze plan; skip it unless you deliberately want to switch back.)

4. **Hosting** → Get started (just click through the wizard)

### Step 7: Install Firebase CLI (if not already)
```bash
npm install -g firebase-tools
firebase login
firebase init
```
Select: Firestore + Hosting
When asked for public directory: `dist`
Configure as single-page app: Yes

### Step 8: Test locally
```bash
npm run dev
```
Open http://localhost:5173 — you should see the auth screen with the logo.

---

## SPRINT 2: First Test Run (15 minutes)

### Step 1: Sign in
- Click "Continue with Google" or "Continue as Guest"
- You should land on the Home screen

### Step 2: Onboarding (already wired)
- First-time signed-in users (`onboardingComplete` falsy) are auto-redirected to
  `/onboarding` from HomeScreen. Complete or Skip sets the flag so it won't loop.

### Step 3: Seed sample data
A **"Dev: Seed sample data"** button is already built into the Home feed (visible only
in `npm run dev`, auto-excluded from production builds). Tap it after signing in — it
seeds 15 issues scattered ~1 km around your current location and toasts the count.

(Console alternative still works: `import('/src/seedData.js').then(m => m.seedSampleData())`.)

### Step 4: Verify the feed
After seeding, you should see 15 issues on the home screen with:
- Severity badges (colored pills)
- Pressure meters (progress bars)
- Status left borders (colored)
- Stats row showing counts

---

## SPRINT 3: Test the Core Flow (30 minutes)

### Test 1: Report an issue
1. Tap the green Camera button (bottom nav)
2. Take a photo or pick from gallery
3. Watch the "Gemini AI is analyzing..." screen
4. See the AI results: type, severity, complaint letter, legal right
5. Choose social consent
6. Hit Submit
7. Check that it appears on Home and Map

### Test 2: Map screen
- If Maps API key is set: markers should appear on dark map
- Click a marker → info window → navigate to detail
- If no Maps key: you'll see a list fallback (still functional)

### Test 3: Issue detail
- Click any issue card
- Verify: photo, status timeline, AI prediction, pressure meter
- Try the Verify button (+5 pts)
- Try Copy Complaint
- Try Generate RTI

### Test 4: Profile
- Check civic score incremented after reporting
- Badges should show (First Step unlocked after 1 report)
- My Reports section shows your issues

---

## SPRINT 4: Fix Any Bugs (1 hour)

Common issues and fixes:

**"Gemini HTTP 429"** → You're rate limited. Wait 1 minute or use a different API key.

**Google Sign-In fails** → Check that your Firebase project has Google auth enabled and your authorized domain includes localhost.

**Firestore permission denied** → Go to Firestore → Rules → paste the rules from `firestore.rules` file.

**Map doesn't load** → Either Maps API key is wrong, or the API isn't enabled. The list fallback still works for demo.

**Photos don't show** → Photos are stored inline as base64 in Firestore (no Cloud Storage).
If a photo is missing, the source image was likely too large after compression (>900KB) and
was skipped — that's by design to stay under Firestore's 1MB doc limit.

---

## SPRINT 5: Polish for Demo (1 hour)

### Step 1: PWA icons — DONE ✅
`public/icon-192.png` and `public/icon-512.png` are already generated (fist cropped
from `logo.png`, no text). To regenerate after a logo change, run the sharp-based
crop+resize script (center-crop the top ~60% square → resize to 192/512).

### Step 2: Verify all screens on mobile
Open Chrome DevTools → Toggle device toolbar → iPhone SE / Pixel 5
Check each screen:
- [ ] Home (auth + feed)
- [ ] Report (camera + results)
- [ ] Map (markers or fallback)
- [ ] Profile (score + badges)
- [ ] Issue Detail (full view)
- [ ] Analytics (charts)
- [ ] Authority Dashboard
- [ ] Agents Showcase
- [ ] Onboarding

### Step 3: n8n setup (optional but impressive)
1. Go to app.n8n.cloud → Sign up (free 14-day trial)
2. Create workflow "JanaShakti Social"
3. Add Webhook trigger → Copy URL
4. Paste into .env as VITE_N8N_SOCIAL_WEBHOOK
5. Add a Code node that builds a tweet
6. Add HTTP Request node to post to X (if you have @JanaShaktiApp account)

---

## SPRINT 6: Deploy (30 minutes)

### Step 1: Build
```bash
npm run build
```

### Step 2: Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

### Step 3: Verify live URL
Open the URL Firebase gives you (something like `gen-lang-client-0508398762.web.app`)

### Step 4: Deploy Firestore rules
```bash
firebase deploy --only firestore:rules
```

### Step 5: Test on real phone
- Open the live URL on your phone
- Test the full flow: sign in → report → verify → share
- Check PWA install prompt appears

---

## DEMO SCRIPT (5 minutes)

```
[0:00] "JanaShakti gives citizens POWER."
[0:30] Open app → show Home with live data
       Point to Agent Status row
       "Seven AI agents, all powered by Gemini 2.5."

[0:30-1:30] Tap Report → take photo
       Show AI analyzing overlay
       "Agent 1: classified, severity, complaint letter."
       "Agent 2: no duplicate within 200m."
       "Agent 3: routed to Roads Department."
       "Agent 4: priority 87/100, 8-12 days."

[1:30-2:30] Show Map with pins
       Click a pin
       Show Pressure Meter climbing
       "Wall of Shame: issues ignored 30+ days."

[2:30-3:30] Authority Dashboard
       "Officials update status, upload proof."
       Show Analytics with charts

[3:30-4:30] Profile with score + badges
       Show social post if available

[4:30-5:00] Close
       "JanaShakti — People's Power."
```

---

## QUICK TROUBLESHOOTING

| Problem | Fix |
|---------|-----|
| Blank screen | Check browser console for errors |
| Firebase error | Verify .env keys match your Firebase project |
| Gemini fails | Check API key; app auto-falls-back across the gemini-2.5-flash chain |
| Map blank | Add VITE_GOOGLE_MAPS_KEY to .env |
| Auth fails | Enable Google/Anonymous in Firebase Auth |
| Deploy fails | Run `firebase login` first |
| PWA no install | Must be on HTTPS (deployed URL) |

---

## FILE COUNT SUMMARY

```
Config files:    6  (package.json, vite.config, index.html, .env, .gitignore, firebase.json)
Theme:           4  (colors, typography, spacing, components)
Constants:       6  (issueTypes, departments, cities, representatives, mapStyle, voiceLang)
Hooks:           9  (useAuth, useIssues, useUser, useLocation, useAgents, useNotifications, usePagination, …)
Utils:          31  (gemini, n8n, social, escalation, reactLoop, cityDetect, geo, rti, …)
Agents:          7  (+ orchestrator + reactLoop helper — Detector & Router are ReAct loops)
Components:     30  (BottomNav, TopNav, IssueCard, PressureMeter, VoiceAssistant, etc.)
Screens:        12  (Home, Report, Map, Profile, IssueDetail, Analytics, Authority, Agents, Onboarding, Leaderboard, Journalist, Notifications)
Other:               App.jsx, main.jsx, index.css, firebase.js, firestore.rules, manifest.json
TOTAL:         ~130+ source files
```

---

Good luck! You've got this. 🚀
