# SyncWatch

**Watch videos together, in perfect sync — no matter where you are.**

SyncWatch is a real-time synchronized video watching platform that lets you and your friends watch YouTube videos or direct video files together in the same room. Playback, seeking, pausing — everything stays in sync for every member of the room, in real time.

---

## Features

### Core
- **Synchronized Playback** — Play, pause, and seek events are broadcast instantly to all room members with network-latency compensation so everyone stays frame-accurate
- **YouTube & Direct Video Support** — Paste any YouTube URL or a direct `.mp4`, `.webm`, `.ogg` link (including Dropbox share links, which are auto-converted)
- **Room System** — Create a named room and share the link; anyone with the link can join
- **Host Controls** — The room host can grant or revoke video control permissions for any member
- **Live Member List** — See who's in the room and who's online or offline in real time
- **Presence Tracking** — Members who switch tabs appear as offline instantly; when they return they are automatically re-synced to the current playback position

### Video Call
- **In-room Video Calls** — Start a video call directly inside the room powered by Agora RTC
- **Audio & Video Toggles** — Mute/unmute and turn camera on/off independently; camera-off shows a proper placeholder screen instead of a frozen frame
- **Screen Sharing** — Share your screen to everyone in the call
- **Draggable Call Panel** — Drag the video call overlay anywhere on screen; on mobile it requires a 1.5-second press-and-hold before dragging to avoid accidental moves
- **Minimizable** — Collapse the call to a small floating badge while you keep watching

### Chat
- **Live Chat Panel** — Send messages visible to all room members in real time via Supabase Realtime
- **Fullscreen Overlay** — The last 3 messages appear as a translucent overlay when the video is fullscreen, with configurable opacity and a toggle to hide it entirely
- **Desktop Layout** — On desktop the message input sits above the message list so the latest messages are always at the bottom of your view without scrolling

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` Arrow | Seek back 10 seconds |
| `→` Arrow | Seek forward 10 seconds |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [SvelteKit](https://kit.svelte.dev/) with Svelte 5 runes |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Backend / Database | [Supabase](https://supabase.com/) (Postgres + Realtime + Auth + Presence) |
| Video Calls | [Agora RTC SDK](https://www.agora.io/) |
| Authentication | Supabase Auth with Google OAuth |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A [Supabase](https://supabase.com/) project
- An [Agora](https://www.agora.io/) project (for video calls)
- A Google OAuth app (for authentication)

### 1. Clone the repository

```bash
git clone https://github.com/HappySR/syncwatch.git
cd syncwatch
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root of the project:

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
PUBLIC_AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-app-certificate
```

### 4. Set up the Supabase database

Run the following SQL in your Supabase SQL editor to create the required tables:

```sql
-- Profiles (auto-created on sign-up)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Rooms
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid references profiles(id) on delete cascade,
  is_public boolean default true,
  current_video_url text,
  current_video_type text,
  video_time float8 default 0,
  is_playing boolean default false,
  last_updated timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Room Members
create table room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  has_controls boolean default true,
  joined_at timestamptz default now(),
  unique(room_id, user_id)
);

-- Chat Messages
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);
```

Enable Row Level Security and add appropriate policies for each table so authenticated users can read/write their own data and room data they are members of.

### 5. Set up Agora token server

SyncWatch requires a server-side Agora token endpoint at `POST /api/agora-token`. There is `src/routes/api/agora-token/+server.ts`

Add `AGORA_APP_CERTIFICATE` to your `.env` file (this is a server-only secret, no `PUBLIC_` prefix).

### 6. Configure Google OAuth

In your Supabase dashboard go to **Authentication → Providers → Google** and add your Google OAuth Client ID and Secret. Set the redirect URL in your Google Cloud Console to:

```
https://your-project.supabase.co/auth/v1/callback
```

### 7. Run the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 8. Build for production

```bash
npm run build
npm run preview
```

---

## How It Works

### Sync Architecture

SyncWatch uses two layers for synchronization:

1. **Supabase Realtime Broadcast** — Play, pause, seek, and video change events are broadcast peer-to-peer through Supabase channels with sub-100ms delivery. Each event carries a `sentAt` timestamp so receivers can compensate for network transit time and land at the exact correct position.

2. **Supabase Postgres** — Room state (current video URL, playback position, play/pause state) is persisted to the database in the background. New members joining the room read this state to catch up. Seek writes are debounced to 1 write per second to avoid flooding the database during scrubbing.

### Presence & Offline Handling

- Supabase Presence channels track who is online. When a member switches tabs, their presence is untracked immediately via the `visibilitychange` event, marking them offline for all other members.
- When they return, presence is retracked and `syncWithRoom` fires — but only if no play/pause event has occurred in the last 5 seconds (to prevent stale DB state from overriding a live event).
- `syncWithRoom` applies the DB's `is_playing` state conservatively: if the DB timestamp is older than 10 seconds, it does not auto-start playback, preventing a returning member from starting a video that everyone else has paused.

### Video Call

Video calls use Agora's RTC SDK. Tracks are disabled by default (camera and mic off) before publishing to avoid a brief flash of enabled media reaching remote users. Remote video elements are rendered by Svelte reactivity and played with a retry loop — if the DOM container is not yet available when the track arrives, playback is retried every 150ms for up to 3 seconds.

---

## Supported Video Sources

| Source | Support | Notes |
|--------|---------|-------|
| YouTube | ✅ Full | Paste any `youtube.com` or `youtu.be` URL |
| Dropbox | ✅ Full | Share links auto-converted to direct stream URLs |
| Direct `.mp4` / `.webm` / `.ogg` | ✅ Full | Must be publicly accessible |
| Cloudinary / Vimeo CDN | ✅ Full | Any direct streamable URL |
| Google Drive | ❌ Not supported | Blocks video streaming for shared files |

---

## License

SyncWatch is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- You are free to use, study, modify, and distribute this software
- If you run a modified version of SyncWatch as a network service (e.g. a website), you **must** make your modified source code available to users of that service under the same license
- Any derivative works must also be licensed under AGPL-3.0

See the [LICENSE](./LICENSE) file for the full license text.

```
SyncWatch — Real-time synchronized video watching
Copyright (C) 2026

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
```

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change. All contributions must be compatible with the AGPL-3.0 license.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request
