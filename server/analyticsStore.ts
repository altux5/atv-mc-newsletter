import type { AnalyticsEvent, AnalyticsReport } from '../src/types/analytics.js'

export type AnalyticsQuery = (sql: string, params?: unknown[]) => Promise<Record<string, any>[]>
export type VisitorLocation = { country: string; region: string }

export async function storeAnalyticsEvent(query: AnalyticsQuery, event: AnalyticsEvent, visitor: string, location: VisitorLocation): Promise<void> {
  if (event.type === 'view') {
    await query(`INSERT INTO analytics_views (id, visitor, path, newsletter_slug, country, region)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [event.viewId, visitor, event.path, event.newsletterSlug ?? null, location.country, location.region])
  } else if (event.type === 'engagement') {
    await query(`UPDATE analytics_views SET active_seconds = GREATEST(active_seconds, $1), scroll_depth = GREATEST(scroll_depth, $2)
      WHERE id = $3 AND visitor = $4 AND path = $5`, [event.activeSeconds, event.scrollDepth, event.viewId, visitor, event.path])
  } else {
    await query(`INSERT INTO analytics_clicks (id, view_id, target)
      SELECT $1, id, $2 FROM analytics_views WHERE id = $3 AND visitor = $4 AND path = $5
      ON CONFLICT (id) DO NOTHING`, [event.id, event.target, event.viewId, visitor, event.path])
  }
}

export async function pruneAnalytics(query: AnalyticsQuery): Promise<void> {
  await query("DELETE FROM analytics_views WHERE created_at < now() - interval '90 days'")
  await query("DELETE FROM analytics_subscription_events WHERE created_at < now() - interval '90 days'")
}

export async function getAnalyticsReport(query: AnalyticsQuery, days: number, enabled: boolean): Promise<AnalyticsReport> {
  const since = "date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - ($1::integer - 1) * interval '1 day'"
  const params = [days]
  const totals = await query(`SELECT count(DISTINCT visitor)::int AS visitors, count(*)::int AS views,
    count(*) FILTER (WHERE newsletter_slug IS NOT NULL)::int AS "newsletterViews",
    COALESCE(round(avg(active_seconds) FILTER (WHERE newsletter_slug IS NOT NULL)), 0)::int AS "activeSeconds",
    COALESCE(round(avg(scroll_depth) FILTER (WHERE newsletter_slug IS NOT NULL)), 0)::int AS "scrollDepth",
    (SELECT count(*)::int FROM analytics_clicks WHERE created_at >= ${since}) AS clicks
    FROM analytics_views WHERE created_at >= ${since}`, params)
  const subscribers = await query(`SELECT (SELECT count(*)::int FROM subscribers WHERE active) AS active,
    count(*) FILTER (WHERE kind = 'added')::int AS added,
    count(*) FILTER (WHERE kind = 'removed')::int AS removed
    FROM analytics_subscription_events WHERE created_at >= ${since}`, params)
  const daily = await query(`SELECT to_char(day AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
    (SELECT count(DISTINCT visitor)::int FROM analytics_views WHERE created_at >= day AND created_at < day + interval '1 day') AS visitors,
    (SELECT count(*)::int FROM analytics_views WHERE created_at >= day AND created_at < day + interval '1 day') AS views,
    (SELECT count(*)::int FROM analytics_clicks WHERE created_at >= day AND created_at < day + interval '1 day') AS clicks
    FROM generate_series(${since}, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', interval '1 day') AS day`, params)
  const newsletters = await query(`SELECT newsletter_slug AS slug, COALESCE(max(newsletters.title), newsletter_slug) AS title,
    count(DISTINCT visitor)::int AS visitors, count(*)::int AS views,
    COALESCE(round(avg(active_seconds)), 0)::int AS "activeSeconds", COALESCE(round(avg(scroll_depth)), 0)::int AS "scrollDepth",
    (SELECT count(*)::int FROM analytics_clicks JOIN analytics_views AS source ON source.id = analytics_clicks.view_id
      WHERE source.newsletter_slug = analytics_views.newsletter_slug AND analytics_clicks.created_at >= ${since}) AS clicks
    FROM analytics_views LEFT JOIN newsletters ON newsletters.slug = analytics_views.newsletter_slug
    WHERE analytics_views.created_at >= ${since} AND newsletter_slug IS NOT NULL
    GROUP BY newsletter_slug ORDER BY views DESC LIMIT 100`, params)
  const regions = await query(`SELECT country, region, count(DISTINCT visitor)::int AS visitors, count(*)::int AS views
    FROM analytics_views WHERE created_at >= ${since} GROUP BY country, region ORDER BY views DESC`, params)
  const links = await query(`SELECT newsletter_slug AS slug, target, count(*)::int AS clicks
    FROM analytics_clicks JOIN analytics_views ON analytics_views.id = view_id
    WHERE analytics_clicks.created_at >= ${since} GROUP BY newsletter_slug, target ORDER BY clicks DESC LIMIT 100`, params)
  return { enabled, days, totals: totals[0], subscribers: subscribers[0], daily, newsletters, regions, links } as AnalyticsReport
}