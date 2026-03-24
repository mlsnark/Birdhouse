# Birdhouse 🐦

**Synchronized audio experience app** — multiple phones, different tracks, one shared moment.

All devices receive a server-side start timestamp and schedule their local audio playback to begin within ~20 ms of each other, regardless of individual network jitter.

---

## How it works

```
Host writes startAt = serverNow + 5000 ms
         │
         ▼
All devices receive startAt via Firebase listener
         │
         ▼
localStart = startAt - serverTimeOffset        (per-device conversion)
         │
         ▼
Two-phase scheduler:
  • delay > 200 ms  →  setTimeout to re-check at -150 ms
  • delay ≤ 200 ms  →  5 ms setInterval polling loop
         │
         ▼
sound.playAsync() fires within ~5 ms of localStart
```

**Clock sync**: Firebase's `/.info/serverTimeOffset` gives each device the difference between its local clock and the Firebase server clock, continuously updated. Accuracy on a local WiFi network is typically < 5 ms.

**Expected total sync error**: < 20 ms on WiFi, < 50 ms on LTE.

---

## Quick start

### 1. Firebase setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project.
2. Enable **Realtime Database** → Start in **test mode** (for development).
3. In **Project Settings → Your apps**, add a Web app and copy the config.
4. Paste into `src/config/firebase.js`:

```js
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
```

5. Deploy the database rules:
```bash
npm install -g firebase-tools
firebase login
firebase init database        # select your project, use database.rules.json
firebase deploy --only database
```

### 2. Install & run

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go on each device (iOS or Android).
All devices must be on the **same WiFi network** for best synchronization.

---

## Session flow

| Step | Host | Participants |
|------|------|-------------|
| 1 | Opens app → **Host a Session** | |
| 2 | Enters their name + optional own track URL | |
| 3 | Session created, **room code** displayed | |
| 4 | | Open app → **Join a Session** → enter code + name |
| 5 | Sees participant list; edits each track URL field | |
| 6 | | Track URL received → loading begins automatically |
| 7 | Sees green dots as each participant goes ready | |
| 8 | Taps **Begin Experience** | |
| 9 | All devices show 5…4…3…2…1 countdown | |
| 10 | All tracks begin simultaneously | |

---

## Audio file requirements

- Format: **MP3, AAC, or WAV** (expo-av compatible)
- Hosting: Any HTTPS URL (CDN, S3, Firebase Storage, Dropbox direct link…)
- Files must be accessible from the devices' network (no auth, no CORS block)
- Pre-loading happens in the lobby — larger files need more lead time before "Begin"

### Example free audio hosts

| Service | Notes |
|---------|-------|
| [Firebase Storage](https://firebase.google.com/products/storage) | Same project, easy CORS |
| AWS S3 public bucket | Set public read + CORS policy |
| Cloudinary free tier | 25 GB bandwidth/month |
| GitHub Releases | Raw file URLs work fine |

---

## Improving sync precision

The default implementation gives < 20 ms on a good WiFi network.
If you need tighter guarantees:

### 1. Measure your playback start latency

Add logging around `playAsync()`:

```js
const before = Date.now();
await sound.playAsync();
const after = Date.now();
console.log('playAsync latency:', after - before, 'ms');
```

Then set `PLAYBACK_LATENCY_COMP_MS` in `src/services/audioPlayer.js` to that value.
This fires `playAsync()` that many ms early so the first sample lands on target.

### 2. Use Audio.Sound with `status` callback

Monitor `status.isPlaying` to confirm actual playback start and measure real-world offsets between devices.

### 3. Platform-specific native modules

For < 5 ms precision consider:
- **iOS**: `AVAudioPlayer.play(atTime:)` with AVAudioSession (requires a native module)
- **Android**: `AudioTrack` with `setPlaybackHeadPosition` or Oboe library

These require ejecting from Expo managed workflow or writing a custom native module.

---

## Project structure

```
App.js                          Navigation root
src/
  config/
    firebase.js                 Firebase initialization (fill in your config)
  services/
    clockSync.js                Server-time offset tracking
    audioPlayer.js              Track loading + precision-scheduled playback
    sessionService.js           Firebase RTDB read/write helpers
  screens/
    HomeScreen.js               Entry: Host or Join
    HostScreen.js               Create session, assign tracks, start
    JoinScreen.js               Enter room code and name
    LobbyScreen.js              Participant waiting room + track pre-load
    PlaybackScreen.js           Countdown + synchronized playback
  utils/
    deviceId.js                 Persistent device identifier
  theme.js                      Colors and design tokens
database.rules.json             Firebase security rules
```

---

## Known limitations / future work

- **No authentication** — room codes are the only access control. Add Firebase Auth for production.
- **Host must stay connected** — session is removed on host disconnect (`onDisconnect`).
- **Track URLs are plain HTTP** — add Firebase Storage + signed URLs for private content.
- **No pause/resume** — only start and stop are supported.
- **Single-room** — one session per room code at a time.
