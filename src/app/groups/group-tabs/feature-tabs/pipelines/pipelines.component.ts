import { FETCH_REFRESH_INTERVAL } from '$groups/http'
import { GroupId } from '$groups/model/group'
import { PipelineId } from '$groups/model/pipeline'
import { ProjectId, ProjectPipeline, ProjectPipelines } from '$groups/model/project'
import { Status } from '$groups/model/status'
import { filterArrayNotNull, filterPipeline, filterProject, filterString } from '$groups/util/filter'
import { forkJoinFlatten } from '$groups/util/fork'
import { projectNamespacePath } from '$groups/util/project-path'

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NzSpinModule } from 'ng-zorro-antd/spin'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzTooltipModule } from 'ng-zorro-antd/tooltip'
import { finalize, interval, switchMap } from 'rxjs'
import { ProjectFilterComponent } from '../components/project-filter/project-filter.component'
import { TopicFilterComponent } from '../components/topic-filter/topic-filter.component'
import { BranchFilterComponent } from './components/branch-filter/branch-filter.component'
import { GroupFilterComponent } from './components/group-filter/group-filter.component'
import { PipelineSummaryComponent } from './components/pipeline-summary/pipeline-summary.component'
import { StatusFilterComponent } from './components/status-filter/status-filter.component'
import { PipelineTableComponent } from './pipeline-table/pipeline-table.component'
import { PipelinesService } from './service/pipelines.service'

const STORAGE_KEY = 'pinned_pipelines'

@Component({
  selector: 'gcd-pipelines',
  imports: [
    NzSpinModule,
    NzButtonModule,
    NzIconModule,
    NzTooltipModule,
    ProjectFilterComponent,
    GroupFilterComponent,
    PipelineSummaryComponent,
    TopicFilterComponent,
    BranchFilterComponent,
    StatusFilterComponent,
    PipelineTableComponent
],
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PipelinesComponent implements OnInit {
  private pipelinesService = inject(PipelinesService)
  private destroyRef = inject(DestroyRef)

  groupMap = input.required<Map<GroupId, Set<ProjectId>>>()

  filterTextProject = signal('')
  filterTextGroup = signal('')
  filterTextBranch = signal('')
  filterTopics = signal<string[]>([])
  filterStatuses = signal<Status[]>([])
  pinnedPipelines = signal<PipelineId[]>(this.getPinnedPipelines())

  projectPipelines = signal<ProjectPipelines[]>([])
  loading = signal(false)
  refreshing = signal(false)

  statusCounts = computed<ReadonlyMap<Status, number>>(() => {
    const counts = new Map<Status, number>()

    for (const { pipelines } of this.projectPipelines()) {
      for (const { status } of pipelines) {
        counts.set(status, (counts.get(status) ?? 0) + 1)
      }
    }

    return counts
  })

  filteredProjectPipelines = computed(() => {
    return this.projectPipelines()
      .flatMap(({ project, pipelines, group_id }) => pipelines.map((pipeline) => ({ project, pipeline, group_id })))
      .filter(({ pipeline, project }) => {
        return (
          filterProject(project, this.filterTextProject(), this.filterTopics()) &&
          filterString(projectNamespacePath(project), this.filterTextGroup()) &&
          filterPipeline(pipeline, this.filterTextBranch(), this.filterStatuses())
        )
      })
      .sort((a, b) => this.sortByUpdatedAt(a, b))
      .sort((a, b) => this.sortPinned(a, b, this.pinnedPipelines()))
  })

  projects = computed(() => {
    return this.projectPipelines()
      .filter(({ pipelines }) => pipelines.length > 0)
      .map(({ project }) => project)
  })
  branches = computed(() => {
    return filterArrayNotNull(this.projectPipelines().flatMap(({ pipelines }) => pipelines.map(({ ref }) => ref)))
  })

  ngOnInit(): void {
    this.loading.set(true)

    this.loadPipelines(false, this.loading)

    interval(FETCH_REFRESH_INTERVAL)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() =>
          forkJoinFlatten(this.groupMap(), this.pipelinesService.getProjectsWithPipelines.bind(this.pipelinesService))
        )
      )
      .subscribe((projectPipelines) => this.projectPipelines.set(projectPipelines))
  }

  onRefresh(): void {
    if (!this.refreshing()) {
      this.loadPipelines(true, this.refreshing)
    }
  }

  onFilterTopicsChanged(topics: string[]) {
    this.filterTopics.set(topics)
  }

  onFilterTextProjectsChanged(filterText: string) {
    this.filterTextProject.set(filterText)
  }

  onFilterTextGroupsChanged(filterText: string) {
    this.filterTextGroup.set(filterText)
  }

  onFilterTextBranchesChanged(filterText: string) {
    this.filterTextBranch.set(filterText)
  }

  onFilterStatusesChanged(statuses: Status[]) {
    this.filterStatuses.set(statuses)
  }

  onPinnedPipelinesChanged(pinnedPipelines: PipelineId[]) {
    this.pinnedPipelines.set(pinnedPipelines)
    this.savePinnedPipelines(pinnedPipelines)
  }

  private loadPipelines(refresh: boolean, activity: { set(value: boolean): void }): void {
    activity.set(true)
    const request = (groupId: GroupId, projectIds?: Set<ProjectId>) =>
      this.pipelinesService.getProjectsWithPipelines(groupId, projectIds, refresh)

    forkJoinFlatten(this.groupMap(), request)
      .pipe(finalize(() => activity.set(false)))
      .subscribe((projectPipelines) => this.projectPipelines.set(projectPipelines))
  }

  private savePinnedPipelines(pinnedPipelines: PipelineId[]) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedPipelines))
    } catch (_) {}
  }

  private getPinnedPipelines(): PipelineId[] {
    try {
      const item = sessionStorage.getItem(STORAGE_KEY)
      if (item) {
        return JSON.parse(item)
      }
    } catch (_) {}

    return []
  }

  private sortByUpdatedAt(a: ProjectPipeline, b: ProjectPipeline): number {
    if (a.pipeline == null || b.pipeline == null) {
      return 0
    }
    return new Date(b.pipeline.updated_at).getTime() - new Date(a.pipeline.updated_at).getTime()
  }

  private sortPinned(a: ProjectPipeline, b: ProjectPipeline, pinnedPipelines: number[]): number {
    const aPinned = pinnedPipelines.includes(Number(a.pipeline?.id))
    const bPinned = pinnedPipelines.includes(Number(b.pipeline?.id))

    if (aPinned && !bPinned) {
      return -1
    }
    if (!aPinned && bPinned) {
      return 1
    }

    return 0
  }
}
