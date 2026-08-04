import { GroupId } from '$groups/model/group'
import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable, catchError, of, timeout } from 'rxjs'

const REQUEST_TIMEOUT_MS = 20_000

export interface AnalyticsSummary {
  window_days: number
  window_hours: number
  project_count: number
  pipeline_count: number
  success_count: number
  failed_count: number
  manual_count: number
  active_count: number
  canceled_count: number
  runner_count: number
  runner_running_count: number
  runner_idle_count: number
  runner_offline_count: number
  history: AnalyticsHistoryPoint[]
  success_rate: number
}

export interface AnalyticsHistoryPoint {
  label: string
  pipeline_count: number
  project_count: number
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient)

  getSummary(groupIds: GroupId[], hours = 24, pipelineView: 'all' | 'latest' = 'all'): Observable<AnalyticsSummary | undefined> {
    return this.http
      .get<AnalyticsSummary>('api/analytics/summary', {
        params: {
          group_ids: groupIds.join(','),
          hours: String(hours),
          pipeline_view: pipelineView
        }
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS))
      .pipe(catchError(() => of(undefined)))
  }
}
