# Event posters for ticket PDFs

The default event poster is **`art_gallery_poster.png`** (Studio 3 — Form & Dimension exhibition artwork).

**Lookup order:**

1. `assets/posters/{event-slug}.jpg` (or `.png`, `.jpeg`, `.webp`) — e.g. `inside-the-mind-2026.jpg`
2. `assets/posters/art_gallery_poster.png` — shared default poster
3. `assets/posters/default.jpg` (or `.png`, etc.)
4. `EVENT_POSTER_URL` in `.env` (public image URL)
5. Branded gradient banner (if none of the above exist)

The same poster is used on the frontend My Tickets card at `Studio-3-teaser/public/assets/images/art_gallery_poster.png`.
