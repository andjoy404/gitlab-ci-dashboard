import { HttpClient } from '@angular/common/http'
import { Injectable, effect, inject, signal } from '@angular/core'
import { AuthService } from './auth.service'
import { catchError, of } from 'rxjs'

const STORAGE_KEY = 'theme'
const DRACULA_THEME = 'dracula'
const LIGHT_THEME = 'light'

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private http = inject(HttpClient)
  private auth = inject(AuthService)
  isDracula = signal(this.getSavedTheme() === DRACULA_THEME)
  private loadedUser = ''

  constructor() {
    this.applyTheme()
    effect(() => {
      const username = this.auth.authenticated() ? this.auth.username() : ''
      if (!username || username === this.loadedUser) return
      this.loadedUser = username
      this.http
        .get<{ theme: 'light' | 'dracula' }>('api/preferences')
        .pipe(catchError(() => of({ theme: this.isDracula() ? DRACULA_THEME : LIGHT_THEME })))
        .subscribe(({ theme }) => {
        const localTheme = this.getSavedTheme()
        const preserveLocalDark = localTheme === DRACULA_THEME && theme === LIGHT_THEME
        const selectedTheme = preserveLocalDark ? DRACULA_THEME : theme

        this.isDracula.set(selectedTheme === DRACULA_THEME)
        this.saveLocalTheme()
        this.applyTheme()

        // If server has default light but local preference is dark, persist dark
        // so subsequent refreshes stay consistent for this user.
        if (preserveLocalDark && this.auth.authenticated()) {
          this.http.put('api/preferences/theme', { theme: DRACULA_THEME }).subscribe()
        }
      })
    })
  }

  toggle(): void {
    this.isDracula.update((enabled) => !enabled)
    const theme = this.isDracula() ? DRACULA_THEME : 'light'
    this.saveLocalTheme()
    this.applyTheme()
    if (this.auth.authenticated()) this.http.put('api/preferences/theme', { theme }).subscribe()
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

  private saveLocalTheme(): void {
    try { localStorage.setItem(STORAGE_KEY, this.isDracula() ? DRACULA_THEME : 'light') } catch {}
  }
}
