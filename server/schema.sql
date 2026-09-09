-- Database schema for the newsletter app.
-- Idempotent: safe to run repeatedly (used by ensureSchema() on server startup).
-- Matches the frontend types Newsletter (src/data/newsletters.ts),
-- NewsletterDraft (src/types/newsletter-creation.ts) and SubmittedArticle (src/types/article.ts).

-- Published / display newsletters (also the migration target for the bundled .htm files).
CREATE TABLE IF NOT EXISTS newsletters (
  id          text PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  date        date NOT NULL,
  excerpt     text,
  content     jsonb  NOT NULL DEFAULT '[]'::jsonb,
  tags        text[] NOT NULL DEFAULT '{}',
  source_path text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Submitted articles (image kept as base64 for now; can move to S3 later).
CREATE TABLE IF NOT EXISTS articles (
  id                     text PRIMARY KEY,
  template               text NOT NULL CHECK (template IN ('landscape','portrait')),
  title                  text NOT NULL,
  content                text NOT NULL,
  image_data_url         text,
  contact                text,
  chapter                text,
  button_label           text,
  button_url             text,
  image_aspect           double precision,
  image_zoom             double precision,
  image_pos_x            double precision,
  image_pos_y            double precision,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  imported_to_newsletter boolean NOT NULL DEFAULT false
);

-- Migrations for databases created before the article picker/button/crop fields
-- existed. ADD COLUMN IF NOT EXISTS keeps ensureSchema() idempotent.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS chapter      text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS button_label text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS button_url   text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_aspect double precision;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_zoom   double precision;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_pos_x  double precision;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_pos_y  double precision;

-- Full newsletter editor state. The whole NewsletterDraft object is stored in `data`;
-- `status` is duplicated as a column so published drafts can be filtered in SQL.
CREATE TABLE IF NOT EXISTS newsletter_drafts (
  id         text PRIMARY KEY,
  status     text NOT NULL DEFAULT 'draft',
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Newsletter distribution list. Visitors subscribe via the public site; a newly
-- published newsletter is emailed to every active subscriber. `unsubscribe_token`
-- is a random secret embedded in the one-click unsubscribe link so a recipient
-- can only remove their own address.
CREATE TABLE IF NOT EXISTS subscribers (
  id                text PRIMARY KEY,
  email             text UNIQUE NOT NULL,
  active            boolean NOT NULL DEFAULT true,
  unsubscribe_token text NOT NULL,
  subscribed_at     timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_newsletters_date ON newsletters (date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_submitted_at ON articles (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_status ON newsletter_drafts (status);
CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers (active);
