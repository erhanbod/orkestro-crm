# Orkestro Kanban CRM

A lightweight, Pipedrive-style CRM built as a React 18 Kanban board with fixed sales stages, a Supabase-ready schema, and a Vercel-friendly setup for the MVP.

## Features

- 5 fixed stages: Lead, Contact Made, Presentation, Negotiation, Verbal Won
- Drag-and-drop board UI inspired by Pipedrive
- Deal fields: name, AUD value, stage, owner, account or partner, expected close date
- Supabase-ready real-time subscription layer for multi-user visibility
- No auth in the MVP, but RLS is enabled and ready for future auth and row-level scoping

## Local quick start

1. Install dependencies:
   npm install

2. Create a local environment file:
   cp .env.example .env

3. Add your Supabase values:
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key

4. Run the app:
   npm run dev

5. Open the local URL shown by Vite, usually http://localhost:5173

## Supabase schema

Use the SQL in `supabase/schema.sql` to create the deals table and enable RLS.

## Deploy to Vercel

1. Push the app to GitHub
2. Import the repo into Vercel
3. Set the environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
4. Deploy the project

## Notes

- The app runs in demo mode without Supabase config, so you can open it locally immediately.
- When Supabase is configured, the app subscribes to `public.deals` and updates across connected clients in real time.
- The schema includes policies that allow future auth and per-user access control without redesigning the table.
