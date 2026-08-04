use super::AnalyticsStore;
use actix_web::web::{self, Data, Json};
use serde::{Deserialize, Serialize};
use serde_querystring_actix::QueryString;
use sqlx::Row;

#[derive(Deserialize, Serialize)]
pub struct AnalyticsHistoryPoint {
    label: String,
    pipeline_count: i64,
    project_count: i64,
}

#[derive(Default, Deserialize, Serialize)]
pub struct AnalyticsSummary {
    window_days: i32,
    window_hours: i32,
    project_count: i64,
    pipeline_count: i64,
    success_count: i64,
    failed_count: i64,
    manual_count: i64,
    active_count: i64,
    canceled_count: i64,
    runner_count: i64,
    runner_running_count: i64,
    runner_idle_count: i64,
    runner_offline_count: i64,
    history: Vec<AnalyticsHistoryPoint>,
    success_rate: f64,
}

#[derive(Deserialize)]
struct SummaryQuery {
    #[serde(default)]
    group_ids: Vec<u64>,
    hours: Option<i32>,
    pipeline_view: Option<String>,
}

#[derive(Deserialize)]
struct ReadinessQuery {
    #[serde(default)]
    group_ids: Vec<u64>,
}

#[derive(Serialize)]
struct AnalyticsReadiness {
    ready: bool,
    data_available: bool,
    message: String,
    last_completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub fn setup_handlers(cfg: &mut web::ServiceConfig) {
    cfg.route("/analytics/summary", web::get().to(get_summary))
        .route("/analytics/readiness", web::get().to(get_readiness))
        .route("/analytics/pipelines", web::get().to(super::pipelines::get_pipelines));
}

async fn get_readiness(
    QueryString(query): QueryString<ReadinessQuery>,
    store: Data<AnalyticsStore>,
) -> Result<Json<AnalyticsReadiness>, crate::error::ApiError> {
    let Some(pool) = &store.pool else {
        return Ok(Json(AnalyticsReadiness {
            ready: true,
            data_available: false,
            message: String::new(),
            last_completed_at: None,
        }));
    };

    let group_ids = query.group_ids.iter().map(|id| *id as i64).collect::<Vec<_>>();
    let counts = sqlx::query(
        r#"SELECT
             (SELECT COUNT(*) FROM analytics_projects ap WHERE cardinality($1::bigint[]) = 0 OR ap.group_id = ANY($1)) AS project_count,
             (SELECT COUNT(*) FROM analytics_pipelines p
              WHERE p.project_id IN (
                SELECT ap.gitlab_id FROM analytics_projects ap
                WHERE cardinality($1::bigint[]) = 0 OR ap.group_id = ANY($1)
              )) AS pipeline_count,
             (SELECT COUNT(*) FROM analytics_runner_state rs WHERE cardinality($1::bigint[]) = 0 OR rs.group_id = ANY($1)) AS runner_state_count"#,
    )
    .bind(&group_ids)
    .fetch_one(pool)
    .await
    .map_err(|error| {
        log::error!("Could not load analytics readiness counts: {error}");
        crate::error::ApiError::server_error("Could not load analytics readiness")
    })?;

    let sync = sqlx::query(
        "SELECT last_started_at, last_completed_at, last_error FROM analytics_sync_state WHERE scope = 'pipelines'",
    )
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        log::error!("Could not load analytics readiness state: {error}");
        crate::error::ApiError::server_error("Could not load analytics readiness")
    })?;

    let pipeline_count: i64 = counts.try_get("pipeline_count").unwrap_or_default();
    let runner_state_count: i64 = counts.try_get("runner_state_count").unwrap_or_default();
    let data_available = pipeline_count > 0 || runner_state_count > 0;

    let (ready, last_completed_at, message) = if let Some(sync) = sync {
        let last_started_at = sync
            .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_started_at")
            .unwrap_or(None);
        let last_completed_at = sync
            .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_completed_at")
            .unwrap_or(None);
        let last_error = sync
            .try_get::<Option<String>, _>("last_error")
            .unwrap_or(None);

        // Sync is considered active when the current start marker is newer than
        // the last completion marker (or there has never been a completion yet).
        let sync_in_progress = match (last_started_at, last_completed_at) {
            (Some(_), None) => true,
            (Some(started_at), Some(completed_at)) => started_at > completed_at,
            _ => false,
        };

        if sync_in_progress {
            (
                false,
                last_completed_at,
                "Collecting analytics for first-time setup. Data will appear automatically.".to_string(),
            )
        } else if !data_available && last_error.is_some() {
            (
                false,
                last_completed_at,
                "Analytics sync is retrying in the background. Data will appear automatically.".to_string(),
            )
        } else if last_completed_at.is_some() || last_error.is_some() {
            (true, last_completed_at, String::new())
        } else {
            (
                false,
                last_completed_at,
                "Collecting analytics for first-time setup. Data will appear automatically.".to_string(),
            )
        }
    } else {
        (
            false,
            None,
            "Preparing initial analytics synchronization. Please wait a moment.".to_string(),
        )
    };

    Ok(Json(AnalyticsReadiness {
        ready,
        data_available,
        message,
        last_completed_at,
    }))
}

async fn get_summary(
    QueryString(query): QueryString<SummaryQuery>,
    store: Data<AnalyticsStore>,
) -> Result<Json<AnalyticsSummary>, crate::error::ApiError> {
    let hours = query.hours.unwrap_or(24).clamp(1, 24 * 365);
    let pipeline_view = match query.pipeline_view.as_deref() {
        Some("latest") => "latest",
        _ => "all",
    };
    summary_cached(&store, query.group_ids, hours, pipeline_view)
        .await
        .map(Json)
        .map_err(|error| {
            log::error!("Could not load analytics summary: {error}");
            crate::error::ApiError::server_error("Could not load analytics summary")
        })
}

fn build_cache_key(group_ids: &[i64], hours: i32, pipeline_view: &str) -> String {
    let joined = group_ids
        .iter()
        .map(std::string::ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!("{pipeline_view}:{hours}:{joined}")
}

async fn summary_cached(
    store: &AnalyticsStore,
    group_ids: Vec<u64>,
    hours: i32,
    pipeline_view: &str,
) -> Result<AnalyticsSummary, sqlx::Error> {
    let group_ids_i64 = group_ids.iter().map(|id| *id as i64).collect::<Vec<_>>();
    let cache_key = build_cache_key(&group_ids_i64, hours, pipeline_view);

    let sync_epoch = if let Some(pool) = &store.pool {
        sqlx::query_scalar::<_, Option<i64>>(
            "SELECT EXTRACT(EPOCH FROM last_completed_at)::bigint FROM analytics_sync_state WHERE scope='pipelines'",
        )
        .fetch_optional(pool)
        .await?
        .flatten()
    } else {
        None
    };

    if let Some(pool) = &store.pool {
        if let Some(row) = sqlx::query(
            "SELECT payload, source_completed_epoch FROM analytics_summary_cache WHERE cache_key = $1",
        )
        .bind(&cache_key)
        .fetch_optional(pool)
        .await?
        {
            let cached_epoch = row.try_get::<Option<i64>, _>("source_completed_epoch")?;
            let valid = sync_epoch.is_none() || cached_epoch == sync_epoch;
            if valid {
                let payload = row.try_get::<serde_json::Value, _>("payload")?;
                if let Ok(summary) = serde_json::from_value::<AnalyticsSummary>(payload) {
                    return Ok(summary);
                }
            }
        }
    }

    let summary = summary_live(store, group_ids, hours, pipeline_view).await?;

    if let Some(pool) = &store.pool {
        let payload = serde_json::to_value(&summary)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        sqlx::query(
            r#"INSERT INTO analytics_summary_cache(
                 cache_key, group_ids, hours, pipeline_view, payload, source_completed_epoch
               ) VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT(cache_key) DO UPDATE SET
                 payload = EXCLUDED.payload,
                 source_completed_epoch = EXCLUDED.source_completed_epoch,
                 computed_at = NOW()"#,
        )
        .bind(&cache_key)
        .bind(&group_ids_i64)
        .bind(hours)
        .bind(pipeline_view)
        .bind(payload)
        .bind(sync_epoch)
        .execute(pool)
        .await?;
    }

    Ok(summary)
}

async fn summary_live(
    store: &AnalyticsStore,
    group_ids: Vec<u64>,
    hours: i32,
    pipeline_view: &str,
) -> Result<AnalyticsSummary, sqlx::Error> {
    let Some(pool) = &store.pool else {
        return Ok(AnalyticsSummary::default());
    };
    let group_ids = group_ids.into_iter().map(|id| id as i64).collect::<Vec<_>>();
    let row = sqlx::query(
        r#"WITH selected_projects AS (
             SELECT gitlab_id FROM analytics_projects
             WHERE cardinality($1::bigint[]) = 0 OR group_id = ANY($1)
                     ), ranked_pipelines AS (
                         SELECT
                             p.project_id,
                             p.branch,
                             p.status,
                             p.updated_at,
                             ROW_NUMBER() OVER(PARTITION BY p.project_id, p.branch ORDER BY p.updated_at DESC) AS rn
                         FROM analytics_pipelines p
                         WHERE p.project_id IN (SELECT gitlab_id FROM selected_projects)
                             AND p.updated_at >= NOW() - make_interval(hours => $2)
                     ), selected_pipelines AS (
                         SELECT status
                         FROM ranked_pipelines
                         WHERE $3 <> 'latest' OR rn = 1
           ), runner_items AS (
             SELECT item
             FROM analytics_runner_state state
             CROSS JOIN LATERAL jsonb_array_elements(state.payload) AS item
             WHERE cardinality($1::bigint[]) = 0 OR state.group_id = ANY($1)
           )
           SELECT
             (SELECT COUNT(*) FROM selected_projects) AS project_count,
             COUNT(*) AS pipeline_count,
             COUNT(*) FILTER (WHERE status = 'success') AS success_count,
             COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
             COUNT(*) FILTER (WHERE status = 'manual') AS manual_count,
             COUNT(*) FILTER (WHERE status IN ('running','pending','created','preparing','waiting_for_resource')) AS active_count,
             COUNT(*) FILTER (WHERE status IN ('canceled','canceling')) AS canceled_count,
             (SELECT COUNT(*) FROM runner_items) AS runner_count,
             (SELECT COUNT(*) FROM runner_items WHERE item->'runner'->>'job_execution_status' IN ('running','active')) AS runner_running_count,
             (SELECT COUNT(*) FROM runner_items WHERE (item->'runner'->>'online')::boolean AND item->'runner'->>'job_execution_status' = 'idle') AS runner_idle_count,
             (SELECT COUNT(*) FROM runner_items WHERE NOT COALESCE((item->'runner'->>'online')::boolean, false)) AS runner_offline_count
           FROM selected_pipelines"#,
    )
    .bind(&group_ids)
    .bind(hours)
    .bind(pipeline_view)
    .fetch_one(pool)
    .await?;

    let history = sqlx::query(
        r#"WITH bounds AS (
             SELECT NOW() - make_interval(hours => $2) AS start_time, NOW() AS end_time
           ), selected_projects AS (
             SELECT gitlab_id FROM analytics_projects
             WHERE cardinality($1::bigint[]) = 0 OR group_id = ANY($1)
           ), buckets AS (
             SELECT bucket_index,
                    start_time + (end_time - start_time) * bucket_index / 12 AS bucket_start,
                    start_time + (end_time - start_time) * (bucket_index + 1) / 12 AS bucket_end
             FROM bounds CROSS JOIN generate_series(0, 11) AS bucket_index
                     ), bucket_pipelines AS (
                         SELECT
                             b.bucket_index,
                             rp.gitlab_id,
                             rp.project_id
                         FROM buckets b
                         LEFT JOIN LATERAL (
                             SELECT ranked.gitlab_id, ranked.project_id
                             FROM (
                                 SELECT
                                     p.gitlab_id,
                                     p.project_id,
                                     ROW_NUMBER() OVER(PARTITION BY p.project_id, p.branch ORDER BY p.updated_at DESC) AS rn
                                 FROM analytics_pipelines p
                                 WHERE p.updated_at >= b.bucket_start
                                     AND p.updated_at < b.bucket_end
                                     AND p.project_id IN (SELECT gitlab_id FROM selected_projects)
                             ) ranked
                             WHERE $3 <> 'latest' OR ranked.rn = 1
                         ) rp ON TRUE
           )
           SELECT CASE WHEN $2 <= 48
                       THEN to_char(bucket_start AT TIME ZONE 'UTC', 'Mon DD HH24:MI')
                       ELSE to_char(bucket_start AT TIME ZONE 'UTC', 'Mon DD') END AS label,
                                    COUNT(bp.gitlab_id) AS pipeline_count,
                                    COUNT(DISTINCT bp.project_id) AS project_count
           FROM buckets
                     LEFT JOIN bucket_pipelines bp
                         ON bp.bucket_index = buckets.bucket_index
           GROUP BY buckets.bucket_index, buckets.bucket_start
           ORDER BY buckets.bucket_index"#,
    )
    .bind(&group_ids)
    .bind(hours)
        .bind(pipeline_view)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|point| AnalyticsHistoryPoint {
        label: point.try_get("label").unwrap_or_default(),
        pipeline_count: point.try_get("pipeline_count").unwrap_or_default(),
        project_count: point.try_get("project_count").unwrap_or_default(),
    })
    .collect::<Vec<_>>();
    let success_count: i64 = row.try_get("success_count")?;
    let failed_count: i64 = row.try_get("failed_count")?;
    let completed = success_count + failed_count;
    Ok(AnalyticsSummary {
        window_days: (hours + 23) / 24,
        window_hours: hours,
        project_count: row.try_get("project_count")?,
        pipeline_count: row.try_get("pipeline_count")?,
        success_count,
        failed_count,
        manual_count: row.try_get("manual_count")?,
        active_count: row.try_get("active_count")?,
        canceled_count: row.try_get("canceled_count")?,
        runner_count: row.try_get("runner_count")?,
        runner_running_count: row.try_get("runner_running_count")?,
        runner_idle_count: row.try_get("runner_idle_count")?,
        runner_offline_count: row.try_get("runner_offline_count")?,
        history,
        success_rate: if completed == 0 { 0.0 } else { success_count as f64 * 100.0 / completed as f64 },
    })
}
