import { Injectable, signal } from '@angular/core'

@Injectable({ providedIn: 'root' })
export class FavoritesPanelService {
  readonly open = signal(false)

  toggle(): void {
    this.open.update((open) => !open)
  }

  close(): void {
    this.open.set(false)
  }
}
