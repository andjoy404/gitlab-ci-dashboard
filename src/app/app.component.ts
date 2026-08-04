import { ErrorService } from '$service/error.service'
import { AuthService } from '$service/auth.service'
import { ThemeService } from '$service/theme.service'
import { HttpErrorResponse } from '@angular/common/http'

import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router, RouterOutlet } from '@angular/router'
import { NzAlertModule } from 'ng-zorro-antd/alert'
import { NzButtonModule } from 'ng-zorro-antd/button'
import { HeaderComponent } from './header/header.component'
import { LoginComponent } from './login/login.component'
import { NzSpinModule } from 'ng-zorro-antd/spin'
import { NzInputModule } from 'ng-zorro-antd/input'
import { NzIconModule } from 'ng-zorro-antd/icon'

@Component({
  selector: 'gcd-root',
  imports: [RouterOutlet, HeaderComponent, LoginComponent, NzAlertModule, NzButtonModule, NzSpinModule, FormsModule, NzInputModule, NzIconModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  errorService = inject(ErrorService)
  auth = inject(AuthService)
  private router = inject(Router)
  private theme = inject(ThemeService)

  error = this.errorService.error
  currentPassword = signal('')
  newPassword = signal('')
  confirmPassword = signal('')
  showCurrentPassword = signal(false)
  showNewPassword = signal(false)
  showConfirmPassword = signal(false)
  passwordSaving = signal(false)
  passwordError = signal('')

  get title() {
    return computed(() => {
      const error = this.error()
      if (!error) return ''

      const { statusCode } = error
      return `Error ${statusCode}`
    })
  }

  get message() {
    return computed(() => {
      const error = this.error()
      return error ? error.message : ''
    })
  }

  get actionLabel() {
    return computed(() => this.shouldRecoverToEnvironments() ? 'Set up environment' : 'Refresh')
  }

  onClick(): void {
    if (this.shouldRecoverToEnvironments()) {
      try {
        sessionStorage.setItem('gcd_open_environment_setup', 'true')
      } catch {
        // Ignore storage failures and still redirect.
      }
      this.errorService.clearError()
      this.router.navigate(['/'])
      return
    }

    window.location.reload()
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword.update((visible) => !visible)
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update((visible) => !visible)
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((visible) => !visible)
  }

  passwordsMismatch(): boolean {
    const next = this.newPassword().trim()
    const confirm = this.confirmPassword().trim()
    return next.length > 0 && confirm.length > 0 && next !== confirm
  }

  updatePassword(): void {
    if (this.passwordSaving()) return

    const current = this.currentPassword()
    const next = this.newPassword()
    const confirm = this.confirmPassword()

    if (!current || !next || !confirm) {
      this.passwordError.set('All password fields are required.')
      return
    }
    if (next.length < 8) {
      this.passwordError.set('New password must contain at least 8 characters.')
      return
    }
    if (next !== confirm) {
      this.passwordError.set('New password and confirmation do not match.')
      return
    }

    this.passwordSaving.set(true)
    this.passwordError.set('')
    this.auth.changePassword(current, next).subscribe({
      next: () => {
        this.passwordSaving.set(false)
        this.currentPassword.set('')
        this.newPassword.set('')
        this.confirmPassword.set('')
        this.showCurrentPassword.set(false)
        this.showNewPassword.set(false)
        this.showConfirmPassword.set(false)
      },
      error: ({ error }: HttpErrorResponse) => {
        this.passwordSaving.set(false)
        this.passwordError.set(error?.message ?? 'Unable to update password')
      }
    })
  }

  shouldRecoverToEnvironments(): boolean {
    const error = this.error()
    return error?.statusCode === 401 || error?.statusCode === 403
  }
}
