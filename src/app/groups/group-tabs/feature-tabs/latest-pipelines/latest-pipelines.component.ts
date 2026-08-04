import { FETCH_REFRESH_INTERVAL } from '$groups/http'
import { GroupId } from '$groups/model/group'
import { ProjectId } from '$groups/model/project'
import { AnalyticsRangeService } from '$service/analytics-range.service'
import { ConfigService } from '$service/config.service'
import { AnalyticsReadiness, AnalyticsReadinessService } from '../service/analytics-readiness.service'

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzDropDownModule } from 'ng-zorro-antd/dropdown'
import { NzMenuModule } from 'ng-zorro-antd/menu'
import { interval } from 'rxjs'
import { AnalyticsService, AnalyticsSummary } from './service/analytics.service'

@Component({
  selector: 'gcd-latest-pipelines',
  imports: [NzButtonModule, NzIconModule, NzDropDownModule, NzMenuModule],
  templateUrl: './latest-pipelines.component.html',
  styleUrls: ['./latest-pipelines.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LatestPipelinesComponent implements OnInit {
  private analyticsService = inject(AnalyticsService)
  private readinessService = inject(AnalyticsReadinessService)
  private config = inject(ConfigService)
  readonly range = inject(AnalyticsRangeService)
  private destroyRef = inject(DestroyRef)
  private loadedGroupKey = ''
  private loadedSummaryKey = ''
  private loadedReadinessKey = ''
  private expandedEmptyRange = false

  groupMap = input.required<Map<GroupId, Set<ProjectId>>>()
  analytics = signal<AnalyticsSummary | undefined>(undefined)
  readiness = signal<AnalyticsReadiness | undefined>(undefined)
  readinessMessage = computed(() => {
    const readiness = this.readiness()
    if (!readiness) return ''

    const summary = this.analytics()
    const pipelineDataMissing = !summary || summary.pipeline_count === 0
    if (!pipelineDataMissing) {
      return ''
    }

    if (!readiness.ready && readiness.message) {
      return readiness.message
    }

    return 'Collecting analytics for first-time setup. Data will appear automatically.'
  })
  showPanelWaitingOverlay = computed(() => {
    const readiness = this.readiness()
    if (!readiness) return false

    const summary = this.analytics()
    return !summary || summary.pipeline_count === 0
  })
  statusTooltip = signal<{ text: string; x: number; y: number } | null>(null)

  private emptySummary(hours: number): AnalyticsSummary {
    return {
      window_days: Math.max(1, Math.ceil(hours / 24)),
      window_hours: hours,
      project_count: 0,
      pipeline_count: 0,
      success_count: 0,
      failed_count: 0,
      manual_count: 0,
      active_count: 0,
      canceled_count: 0,
      runner_count: 0,
      runner_running_count: 0,
      runner_idle_count: 0,
      runner_offline_count: 0,
      history: [],
      success_rate: 0
    }
  }

  failureRate = computed(() => {
    const summary = this.analytics()
    if (!summary) return 0
    const completed = summary.success_count + summary.failed_count
    return completed === 0 ? 0 : (summary.failed_count * 100) / completed
  })

  pipelineStatusGradient = computed(() => {
    const summary = this.analytics()
    if (!summary || summary.pipeline_count === 0) return 'conic-gradient(var(--dashboard-gauge-track) 0 100%)'

    const success = this.percentage(summary.success_count)
    const manual = success + this.percentage(summary.manual_count)
    const failed = manual + this.percentage(summary.failed_count)
    const active = failed + this.percentage(summary.active_count)
    const canceled = Math.min(100, active + this.percentage(summary.canceled_count))

    return `conic-gradient(
      var(--dashboard-success) 0 ${success}%,
      var(--dashboard-manual) ${success}% ${manual}%,
      var(--dashboard-danger) ${manual}% ${failed}%,
      var(--dashboard-info) ${failed}% ${active}%,
      var(--dashboard-waning) ${active}% ${canceled}%,
      var(--dashboard-gauge-track) ${canceled}% 100%
    )`
  })

  constructor() {
    effect((onCleanup) => {
      const groupIds = [...this.groupMap().keys()]
      const groupKey = groupIds.join(',')
      if (groupKey !== this.loadedGroupKey) {
        this.loadedGroupKey = groupKey
        this.expandedEmptyRange = false
      }
      if (groupKey !== this.loadedReadinessKey) {
        this.loadedReadinessKey = groupKey
        this.refreshReadiness(groupIds)
      }
      const hours = this.range.hours()
      const pipelineView = this.config.pipelineView()
      const summaryKey = `${groupKey}|${hours}|${pipelineView}`
      if (summaryKey === this.loadedSummaryKey) {
        return
      }
      this.loadedSummaryKey = summaryKey
      const request = this.analyticsService
        .getSummary(groupIds, hours, pipelineView)
        .subscribe((summary) => this.applySummary(summary ?? this.emptySummary(hours)))

      onCleanup(() => request.unsubscribe())
    })
  }

  ngOnInit(): void {
    interval(FETCH_REFRESH_INTERVAL)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadAnalytics()
        this.refreshReadiness([...this.groupMap().keys()])
      })
  }

  percentage(value: number): number {
    const total = this.analytics()?.pipeline_count ?? 0
    return total === 0 ? 0 : (value * 100) / total
  }


  runnerPercentage(value: number): number {
    const total = this.analytics()?.runner_count ?? 0
    return total === 0 ? 0 : (value * 100) / total
  }

  moveStatusTooltip(event: PointerEvent): void {
    const summary = this.analytics()
    if (!summary?.pipeline_count) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const radius = Math.hypot(dx, dy)
    if (radius < rect.width * 0.31 || radius > rect.width * 0.52) {
      this.statusTooltip.set(null)
      return
    }
    const position = ((Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360) / 3.6
    const statuses = [
      ['success', summary.success_count],
      ['manual', summary.manual_count],
      ['failed', summary.failed_count],
      ['active', summary.active_count],
      ['canceled', summary.canceled_count]
    ] as const
    let end = 0
    for (const [status, count] of statuses) {
      end += this.percentage(count)
      if (position <= end) {
        this.statusTooltip.set({
          text: `${status}: ${count} (${this.percentage(count).toFixed(1)}%)`,
          x: Math.min(event.clientX + 14, window.innerWidth - 190),
          y: Math.min(event.clientY + 14, window.innerHeight - 48)
        })
        return
      }
    }
    this.statusTooltip.set(null)
  }
  historyHeight(value: number, metric: 'pipeline_count' | 'project_count'): number {
    const maximum = Math.max(...(this.analytics()?.history ?? []).map((point) => point[metric]), 1)
    return value === 0 ? 4 : Math.max(12, (value * 100) / maximum)
  }

  onRangeChange(value: number): void {
    this.range.set(value)
  }
  private loadAnalytics(): void {
    const hours = this.range.hours()
    this.analyticsService
      .getSummary([...this.groupMap().keys()], hours, this.config.pipelineView())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((summary) => this.applySummary(summary ?? this.emptySummary(hours)))
  }

  private applySummary(summary: AnalyticsSummary | undefined): void {
    this.analytics.set(summary)
    if (
      summary &&
      summary.project_count > 0 &&
      summary.pipeline_count === 0 &&
      !this.expandedEmptyRange &&
      this.range.hours() < this.range.maximumHours()
    ) {
      this.expandedEmptyRange = true
      this.range.set(this.range.maximumHours())
    }
  }

  private refreshReadiness(groupIds: GroupId[]): void {
    this.readinessService
      .getReadiness(groupIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((readiness) => {
        this.readiness.set(readiness)
      })
  }
}
