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

CREATE TABLE IF NOT EXISTS analytics_views (
  id uuid PRIMARY KEY,
  visitor text NOT NULL,
  path text NOT NULL,
  newsletter_slug text,
  country text NOT NULL DEFAULT 'Unknown',
  region text NOT NULL DEFAULT 'Unknown',
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 7200),
  scroll_depth integer NOT NULL DEFAULT 0 CHECK (scroll_depth BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_views_created ON analytics_views (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_views_newsletter ON analytics_views (newsletter_slug, created_at);

CREATE TABLE IF NOT EXISTS analytics_clicks (
  id uuid PRIMARY KEY,
  view_id uuid NOT NULL REFERENCES analytics_views(id) ON DELETE CASCADE,
  target text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_clicks_view ON analytics_clicks (view_id);
CREATE INDEX IF NOT EXISTS idx_analytics_clicks_created ON analytics_clicks (created_at);

CREATE TABLE IF NOT EXISTS analytics_subscription_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('added', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_subscriptions_created ON analytics_subscription_events (created_at);

CREATE OR REPLACE FUNCTION record_subscription_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.active THEN
      INSERT INTO analytics_subscription_events (kind) VALUES ('added');
    END IF;
  ELSIF OLD.active IS DISTINCT FROM NEW.active THEN
    INSERT INTO analytics_subscription_events (kind) VALUES (CASE WHEN NEW.active THEN 'added' ELSE 'removed' END);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS analytics_subscription_change ON subscribers;
CREATE TRIGGER analytics_subscription_change AFTER INSERT OR UPDATE OF active ON subscribers
FOR EACH ROW EXECUTE FUNCTION record_subscription_change();
