import { StatusColorPipe } from '$groups/group-tabs/feature-tabs/pipes/status-color.pipe'
import { Status } from '$groups/model/status'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

interface StatusSegment {
  status: Status
  count: number
  percentage: number
}

@Component({
  selector: 'gcd-pipeline-summary',
  imports: [StatusColorPipe],
  templateUrl: './pipeline-summary.component.html',
  styleUrls: ['./pipeline-summary.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PipelineSummaryComponent {
  statusCounts = input.required<ReadonlyMap<Status, number>>()

  total = computed(() => Array.from(this.statusCounts().values()).reduce((total, count) => total + count, 0))

  segments = computed<StatusSegment[]>(() => {
    const total = this.total()
    if (total === 0) {
      return []
    }

    return Object.values(Status)
      .filter((status) => status !== Status.FAILED_ALLOW_FAILURE)
      .map((status) => {
        const count = this.statusCounts().get(status) ?? 0
        return { status, count, percentage: (count / total) * 100 }
      })
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count)
  })
}
