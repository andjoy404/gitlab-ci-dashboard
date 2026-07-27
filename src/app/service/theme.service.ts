import { Injectable, signal } from '@angular/core'

const STORAGE_KEY = 'theme'
const DRACULA_THEME = 'dracula'

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDracula = signal(this.getSavedTheme() === DRACULA_THEME)

  constructor() {
    this.applyTheme()
  }

  toggle(): void {
    this.isDracula.update((enabled) => !enabled)
    try {
      localStorage.setItem(STORAGE_KEY, this.isDracula() ? DRACULA_THEME : 'light')
    } catch {}
    this.applyTheme()
  }

  private applyTheme(): void {
    document.documentElement.classList.toggle('dracula-theme', this.isDracula())
  }

  private getSavedTheme(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'light'
    } catch {
      return 'light'
    }
  }
}
