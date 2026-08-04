import { HttpClient } from '@angular/common/http'
import { computed, inject, Injectable, signal } from '@angular/core'
import { catchError, forkJoin, of } from 'rxjs'

export interface ApiConfig {
  api_version: string
  read_only: boolean
  hide_write_actions: boolean
  page_size_options: number[]
  default_page_size: number
  analytics_retention_days: number
  pipeline_history_days: number
}

export interface BrandingConfig {
  company_name: string
  company_logo: string
}

export interface GlobalConfig extends BrandingConfig {
  pipeline_view: 'all' | 'latest'
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient)
  private readonly config = signal<ApiConfig | undefined>(undefined)
  private readonly branding = signal<BrandingConfig>({ company_name: 'GitLab CI Dashboard', company_logo: '' })
  private readonly pipelineViewSignal = signal<'all' | 'latest'>('all')

  readonly companyName = computed(() => this.branding().company_name)
  readonly companyLogo = computed(() => this.branding().company_logo)
  readonly pipelineView = computed(() => this.pipelineViewSignal())

  readonly version = computed(() => {
    const version = this.config()?.api_version ?? ''
    const parts = version.split('@')
    return parts.length > 1 ? `${parts[0].slice(0, 7)}@${parts[1]}` : version
  })

  readonly pageSizeOptions = computed(() => this.config()?.page_size_options ?? [10, 20, 30, 40, 50])
  readonly defaultPageSize = computed(() => this.config()?.default_page_size ?? 10)
  readonly readOnly = computed(() => this.config()?.read_only ?? true)
  readonly hideWriteActions = computed(() => this.readOnly() && (this.config()?.hide_write_actions ?? false))
  readonly analyticsRetentionDays = computed(() => this.config()?.analytics_retention_days ?? 90)
  readonly pipelineHistoryDays = computed(() => this.config()?.pipeline_history_days ?? 90)

  load(): void {
    forkJoin({
      config: this.http.get<ApiConfig>('api/config').pipe(catchError(() => of(undefined))),
      branding: this.http.get<GlobalConfig>('api/global-config').pipe(catchError(() => of(undefined)))
    }).subscribe(({ config, branding }) => {
      if (config) this.config.set(config)
      if (branding) {
        this.branding.set({ company_name: branding.company_name, company_logo: branding.company_logo })
        this.pipelineViewSignal.set(branding.pipeline_view ?? 'all')
      }
    })
  }

  setBranding(branding: BrandingConfig): void {
    this.branding.set(branding)
  }

  setPipelineView(pipelineView: 'all' | 'latest'): void {
    this.pipelineViewSignal.set(pipelineView)
  }

  setGlobalConfig(globalConfig: GlobalConfig): void {
    this.branding.set({ company_name: globalConfig.company_name, company_logo: globalConfig.company_logo })
    this.pipelineViewSignal.set(globalConfig.pipeline_view ?? 'all')
  }
}
