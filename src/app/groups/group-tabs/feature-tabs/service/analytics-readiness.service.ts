import { GroupId } from '$groups/model/group'
import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable, catchError, of, timeout } from 'rxjs'

const REQUEST_TIMEOUT_MS = 10_000

export interface AnalyticsReadiness {
  ready: boolean
  data_available: boolean
  message: string
  last_completed_at?: string | null
}

@Injectable({ providedIn: 'root' })
export class AnalyticsReadinessService {
  private http = inject(HttpClient)

  getReadiness(groupIds: GroupId[]): Observable<AnalyticsReadiness | undefined> {
    return this.http
      .get<AnalyticsReadiness>('api/analytics/readiness', {
        params: {
          group_ids: groupIds.join(',')
        }
      })
      .pipe(timeout(REQUEST_TIMEOUT_MS))
      .pipe(catchError(() => of(undefined)))
  }
}
