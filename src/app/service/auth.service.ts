import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { EMPTY, Observable, catchError, finalize, tap, throwError } from 'rxjs'

interface AuthStatus {
  authenticated: boolean
  enabled: boolean
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient)

  authenticated = signal(false)
  enabled = signal(false)
  loading = signal(true)

  constructor() {
    this.refresh()
  }

  login(username: string, password: string): Observable<AuthStatus> {
    return this.http.post<AuthStatus>('api/auth/login', { username, password }).pipe(
      tap((status) => this.applyStatus(status)),
      catchError((error: HttpErrorResponse) => throwError(() => error))
    )
  }

  logout(): void {
    this.http.post('api/auth/logout', {}).subscribe(() => {
      this.authenticated.set(false)
    })
  }

  private refresh(): void {
    this.http
      .get<AuthStatus>('api/auth/status')
      .pipe(
        tap((status) => this.applyStatus(status)),
        catchError(() => {
          this.authenticated.set(false)
          return EMPTY
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe()
  }

  private applyStatus(status: AuthStatus): void {
    this.authenticated.set(status.authenticated)
    this.enabled.set(status.enabled)
  }
}
