# My Personal Diary 📔

A full-stack offline-first mobile journaling app built with React Native (Expo) and Supabase. Create daily diary entries with photos, captions, and voice notes — synced securely across devices, accessible even without internet.

## Features

- **Calendar-based navigation** — tap any date to view or create an entry
- **Rich entries** — add a photo, write a caption, and record a voice note
- **Offline-first** — entries save locally when there's no internet, and sync automatically to the cloud once reconnected
- **Cross-device sync** — log in from any device and access all your entries
- **AI mood tagging** — Gemini AI analyzes your caption and tags the mood of each entry
- **Secure storage** — private cloud storage with signed URLs; Row-Level Security ensures users can only access their own data
- **Profile** — set a display name and avatar, view your total entry count

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54, Expo Router) |
| Language | TypeScript |
| Backend & Auth | Supabase (PostgreSQL, Auth, Storage) |
| Local Database | expo-sqlite (offline-first sync) |
| AI | Google Gemini API via Supabase Edge Functions |
| Media | expo-image-picker, expo-audio |
| Version Control | Git + GitHub |

## Project Structure

```
diary-app/
├── app/
│   ├── index.tsx           # Splash screen with session-aware routing
│   ├── login.tsx           # Email/password login
│   ├── signup.tsx          # Account creation with email confirmation
│   ├── (tabs)/
│   │   ├── index.tsx       # Calendar screen with entry dots
│   │   └── profile.tsx     # Profile: avatar, display name, entry count
│   └── entry/
│       └── [date].tsx      # Entry screen: view/edit, image/audio/caption
├── services/
│   ├── supabase.ts         # Supabase client with session persistence
│   ├── localdb.ts          # SQLite local database schema and queries
│   └── sync.ts             # Offline sync engine (pending → Supabase)
└── supabase/
    └── functions/
        └── analyze-mood/   # Edge Function: Gemini mood analysis
```

## Architecture Highlights

### Offline-First Sync
Entries are written to a local SQLite database first, with a `sync_status` field (`pending` or `synced`). A sync engine runs every time the Calendar screen is focused, pushing any pending entries to Supabase and marking them as synced. Reads check local cache before hitting the network, so the app is fully functional without internet.

### Security
- All storage buckets are private — files are accessed only via short-lived signed URLs
- Supabase Row-Level Security policies restrict all table access to the authenticated user's own rows
- API keys and secrets are never committed to the repository (`.env` is gitignored; Gemini API key stored as a Supabase Edge Function secret)

### AI Mood Tagging
After each entry is saved, a Supabase Edge Function calls the Gemini API with the entry's caption and returns a single mood word (happy, sad, calm, anxious, etc.), displayed as an emoji tag on the entry view screen.

## Setup

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo`)
- Expo Go app on your phone
- A Supabase project
- A Google AI Studio API key (free tier)

### Environment Variables
Create a `.env` file in the project root:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation
```bash
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.

### Supabase Setup
1. Create the `entries` and `profiles` tables with RLS enabled (see schema below)
2. Create private storage buckets: `entry-images`, `entry-audio`, `avatars`
3. Add `GEMINI_API_KEY` as an Edge Function secret
4. Deploy the mood analysis function: `supabase functions deploy analyze-mood`

### Database Schema
```sql
-- Entries table
create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  entry_date date not null,
  caption text,
  image_url text,
  audio_url text,
  ai_mood text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table entries enable row level security;
create policy "Users manage own entries" on entries
  for all using (auth.uid() = user_id);

-- Profiles table
create table profiles (
  id uuid primary key references auth.users,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users manage own profile" on profiles
  for all using (auth.uid() = id);
```

## Built By

Ayishath Raheesha — B.E. Computer Science, MITE (Class of 2026)  
[GitHub](https://github.com/Raheesha27) · [Portfolio](https://raheesha-portfolio.vercel.app)
