
import { NzTooltipModule } from 'ng-zorro-antd/tooltip'

import { AuthService } from '$service/auth.service'
import { FavoritesPanelService } from '$service/favorites-panel.service'
import { ThemeService } from '$service/theme.service'
import { Component, inject } from '@angular/core'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { NzIconModule } from 'ng-zorro-antd/icon'

@Component({
  selector: 'gcd-header',
  imports: [NzIconModule, NzButtonModule, NzTooltipModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  readonly auth = inject(AuthService)
  readonly favorites = inject(FavoritesPanelService)
  readonly theme = inject(ThemeService)

  onClick(): void {
    window.open('https://github.com/larscom/gitlab-ci-dashboard', '_blank')
  }
}
