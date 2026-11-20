# DeskTea — Snap Your Desk, Overhear Their Secret Group Chat

Upload, paste, or point a live camera at your desk. Multimodal Gemini identifies items via spatial `box_2d` coordinates, crops every object into a cast avatar, and leaks their secret group chat roasting you behind your back.

## Key Features

- **Zero-Friction Hosted Experience (OpenRouter + Gemini Flash Lite)**: Visitors on desktop or mobile can immediately upload any desk photo and start chatting with zero API key setup required.
- **Autonomous Object-to-Object Chatter (`Auto-Chat`)**: Toggle `Auto-Chat` in the chat header to let desk objects spontaneously gossip and bicker behind your back—plus hit **Step Away** after speaking so they think the coast is clear.
- **Organic Multi-Party Reply Choreography**: Objects decide dynamically whether one item snaps back, pings `@AnotherItem` for a side-whisper, or sparks an internal argument.
- **Real Spatial Cast & Floating Bubbles**: Hover or tap glowing anchors on your desk photo (or cast avatars) to highlight items and watch live speech bubbles pop above whoever is speaking.
- **Direct `@Mention` Routing & Box Item**: Type `@` to call out specific items, or drag a box over any overlooked item in your photo to pull it straight into the group chat.
- **Before / After Sequel & Live Cam Watch**: Compare cleanup photos with a split curtain slider or stream your webcam with motion-gated periodic check-ins.
- **Mobile-Harmonized Layout (`390×844` Ready)**: Single-row swipeable controls, sticky `16px` composer preventing iOS Safari zoom, responsive 16:9 / Portrait Share Cards, and `/opengraph-image` `summary_large_image` social preview.

---

## Local Development

1. Copy `.env.example` to `.env.local` and fill in `OPENROUTER_API_KEY` (or leave empty to use local Antigravity CLI `agy`):

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_VISION_MODEL=google/gemini-3.1-flash-lite
OPENROUTER_CHAT_MODEL=google/gemini-3.1-flash-lite
DESKTEA_VISION_LIMIT_PER_HOUR=12
DESKTEA_CHAT_LIMIT_PER_HOUR=40
```

2. Install and run:

```bash
npm install
npm run dev -- -p 3456
```

Open `http://localhost:3456`. DeskTea automatically detects local Windows proxy settings (`HTTP_PROXY`/`HTTPS_PROXY` or WinINET) when connecting to OpenRouter in local development.

---

## Public X Launch via GitHub + Vercel (24/7 Hosted)

To publish DeskTea live on X without keeping your local machine running:

1. **Create an empty GitHub repository** (e.g. `desktea`) and push this repo (`.env.local` is strictly gitignored and never pushed).
2. **Import the repo in [Vercel](https://vercel.com/new)** (Framework Preset: `Next.js`).
3. **Add Environment Variables in Vercel → Settings → Environment Variables**:
   - `OPENROUTER_API_KEY` = your OpenRouter API key (`sk-or-v1-...`)
   - `OPENROUTER_VISION_MODEL` = `google/gemini-3.1-flash-lite`
   - `OPENROUTER_CHAT_MODEL` = `google/gemini-3.1-flash-lite`
   - `DESKTEA_VISION_LIMIT_PER_HOUR` = `12`
   - `DESKTEA_CHAT_LIMIT_PER_HOUR` = `40`
   - `NEXT_PUBLIC_SITE_URL` = your production URL (e.g. `https://your-project.vercel.app`)
4. **Click Deploy**.

### Pre-Tweet X Launch Checklist

- Confirm `GET /api/health` returns `"mode": "hosted-openrouter"` and `"openrouterConfigured": true`.
- Verify `https://your-domain/opengraph-image` returns `200 OK` (`1200×630` PNG) and paste your link into an X post draft to preview the `summary_large_image` card.
- Open the site on your phone (`390×844` Safari/Chrome) and confirm instant photo upload, chat reply, and Share Card preview work without asking for an API key.
