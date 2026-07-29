import { filterNotNull } from '$groups/util/filter'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { NzIconModule } from 'ng-zorro-antd/icon'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzTabChangeEvent, NzTabsModule } from 'ng-zorro-antd/tabs'
import { NzTooltipModule } from 'ng-zorro-antd/tooltip'
import { map } from 'rxjs'
import { LatestPipelinesComponent } from './latest-pipelines/latest-pipelines.component'
import { PipelinesComponent } from './pipelines/pipelines.component'
import { RunnersComponent } from './runners/runners.component'
import { GroupId } from '$groups/model/group'
import { ProjectId } from '$groups/model/project'
import { ConfigService } from '$service/config.service'
import { DashboardFeature, DashboardPreloadService } from './service/dashboard-preload.service'

interface Tab {
  id: 'latest-pipelines' | 'pipelines' | 'runners'
  title: string
  icon: string
}

const tabs: Tab[] = [
  {
    id: 'latest-pipelines',
    title: 'Pipelines (latest)',
    icon: 'to-top'
  },
  {
    id: 'pipelines',
    title: 'Pipelines',
    icon: 'unordered-list'
  },
  {
    id: 'runners',
    title: 'Runners',
    icon: 'thunderbolt'
  }
]

@Component({
  selector: 'gcd-feature-tabs',
  imports: [
    CommonModule,
    NzTabsModule,
    NzIconModule,
    NzButtonModule,
    NzTooltipModule,
    LatestPipelinesComponent,
    PipelinesComponent,
    RunnersComponent
  ],
  templateUrl: './feature-tabs.component.html',
  styleUrls: ['./feature-tabs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeatureTabsComponent implements OnInit {
  private config = inject(ConfigService)
  private preloader = inject(DashboardPreloadService)

  groupMap = input.required<Map<GroupId, Set<ProjectId>>>()
  groupName = input('Group')
  disableRouting = input(false)
  companyName = this.config.companyName

  tabs: Tab[] = tabs
  menuCollapsed = signal(this.getSavedMenuState())

  selectedIndex$ = this.route.paramMap.pipe(
    map((map) => map.get('featureId')),
    filterNotNull,
    map((featureId) => this.tabs.findIndex(({ id }) => id === featureId))
  )

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(),
        map((map) => map.get('featureId'))
      )
      .subscribe((featureId) => {
        if (!this.tabs.map(({ id }) => id).includes(featureId as Tab['id'])) {
          this.onChange({ index: 0, tab: null })
        }
      })
  }

  ngOnInit(): void {
    const featureId = this.route.snapshot.paramMap.get('featureId') as DashboardFeature | null
    const activeFeature = this.tabs.some(({ id }) => id === featureId) ? featureId! : 'latest-pipelines'
    this.preloader.preload(this.groupMap(), activeFeature)
  }

  onChange({ index }: NzTabChangeEvent): void {
    if (this.disableRouting()) return

    const { id } = this.tabs[index!]
    const currentSegments = this.route.snapshot.url.map(({ path }) => path)
    this.router.navigate([...currentSegments.slice(0, -1), id])
  }

  toggleMenu(): void {
    this.menuCollapsed.update((collapsed) => !collapsed)
    try {
      localStorage.setItem('feature_menu_collapsed', String(this.menuCollapsed()))
    } catch {}
  }

  private getSavedMenuState(): boolean {
    try {
      return localStorage.getItem('feature_menu_collapsed') === 'true'
    } catch {
      return false
    }
  }
}
