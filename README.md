# Krabi Outage Tracker

Next.js (App Router) + Tailwind + TypeScript dashboard for tracking planned outage jobs backed by Supabase Postgres.

## File tree

```
.
├── .env.example
├── README.md
├── next-env.d.ts
├── next.config.mjs
├── package.json
├── postcss.config.js
├── sql
│   └── 001_init.sql
├── src
│   ├── app
│   │   ├── globals.css
│   │   ├── job
│   │   │   └── [id]
│   │   │       └── page.tsx
│   │   ├── layout.tsx
│   │   ├── new
│   │   │   └── page.tsx
│   │   └── page.tsx
│   └── lib
│       ├── dateUtils.ts
│       ├── jobsRepo.ts
│       └── supabaseClient.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Setup

1. Create a Supabase project.
2. Run the SQL in `sql/001_init.sql` using the Supabase SQL editor.
3. Run the SQL in `sql/002_nakhon_and_doc.sql` to add the นคร + เอกสาร workflow fields.
4. Run the SQL in `sql/003_doc_fields.sql` to add Google Doc generation fields.
5. Copy `.env.example` to `.env.local` and set the Supabase URL + anon key.
6. Configure Google Docs integration:
   - Create a Google Cloud project and enable the Google Drive API + Google Docs API.
   - Create a Service Account and download its JSON key.
   - Share the Google Doc template with the Service Account email.
   - Add the Google env vars from `.env.example` (service account email, private key, template ID, and optional folder ID).
7. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

## Notes

- No authentication or login UI is included yet (open access).
- Data is stored in the `outage_jobs` table and is shared across devices in the same Supabase project.
- Dashboard cards now include an in-card workflow to record นคร notifications and request document creation.
