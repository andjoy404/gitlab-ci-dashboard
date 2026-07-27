use actix_web::cookie::{Cookie, SameSite};
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const COOKIE_NAME: &str = "gcd_session";
const MAX_FAILED_ATTEMPTS: usize = 5;
const LOGIN_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct AuthState {
    username: String,
    password: String,
    session_token: String,
    secure_cookie: bool,
    enabled: bool,
    failed_attempts: Arc<Mutex<VecDeque<Instant>>>,
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct AuthStatus {
    authenticated: bool,
    enabled: bool,
}

impl AuthState {
    pub fn from_env() -> Self {
        let username = std::env::var("APP_LOGIN_USERNAME").unwrap_or_default();
        let password = std::env::var("APP_LOGIN_PASSWORD").unwrap_or_default();

        if username.is_empty() != password.is_empty() {
            panic!("APP_LOGIN_USERNAME and APP_LOGIN_PASSWORD must both be set");
        }

        let enabled = !username.is_empty();
        let secure_cookie = std::env::var("APP_LOGIN_SECURE_COOKIE")
            .map(|value| value.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let session_token = rand::random::<[u8; 32]>()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();

        Self {
            username,
            password,
            session_token,
            secure_cookie,
            enabled,
            failed_attempts: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    pub fn is_authenticated(&self, request: &HttpRequest) -> bool {
        !self.enabled
            || request
                .cookie(COOKIE_NAME)
                .map(|cookie| constant_time_eq(cookie.value(), &self.session_token))
                .unwrap_or(false)
    }

    fn login_is_rate_limited(&self) -> bool {
        let mut attempts = self.failed_attempts.lock().expect("login attempts lock");
        let cutoff = Instant::now() - LOGIN_WINDOW;
        while attempts.front().is_some_and(|attempt| *attempt < cutoff) {
            attempts.pop_front();
        }
        attempts.len() >= MAX_FAILED_ATTEMPTS
    }

    fn record_failed_login(&self) {
        self.failed_attempts
            .lock()
            .expect("login attempts lock")
            .push_back(Instant::now());
    }

    fn clear_failed_logins(&self) {
        self.failed_attempts
            .lock()
            .expect("login attempts lock")
            .clear();
    }
}

pub fn setup_handlers(cfg: &mut web::ServiceConfig) {
    cfg.route("/status", web::get().to(status))
        .route("/login", web::post().to(login))
        .route("/logout", web::post().to(logout));
}

async fn status(request: HttpRequest, auth: web::Data<AuthState>) -> impl Responder {
    web::Json(AuthStatus {
        authenticated: auth.is_authenticated(&request),
        enabled: auth.enabled,
    })
}

async fn login(credentials: web::Json<LoginRequest>, auth: web::Data<AuthState>) -> HttpResponse {
    if auth.login_is_rate_limited() {
        return HttpResponse::TooManyRequests().json(serde_json::json!({
            "message": "Too many login attempts. Try again in one minute."
        }));
    }

    if !auth.enabled
        || (constant_time_eq(&credentials.username, &auth.username)
            && constant_time_eq(&credentials.password, &auth.password))
    {
        auth.clear_failed_logins();
        let cookie = Cookie::build(COOKIE_NAME, auth.session_token.clone())
            .path("/")
            .http_only(true)
            .secure(auth.secure_cookie)
            .same_site(SameSite::Lax)
            .finish();

        return HttpResponse::Ok()
            .insert_header(("Cache-Control", "no-store"))
            .cookie(cookie)
            .json(AuthStatus {
                authenticated: true,
                enabled: auth.enabled,
            });
    }

    auth.record_failed_login();
    HttpResponse::Unauthorized().json(serde_json::json!({
        "message": "Invalid username or password"
    }))
}

async fn logout() -> HttpResponse {
    let mut cookie = Cookie::build(COOKIE_NAME, "").path("/").finish();
    cookie.make_removal();
    HttpResponse::Ok().cookie(cookie).finish()
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    let left = left.as_bytes();
    let right = right.as_bytes();
    let mut difference = left.len() ^ right.len();

    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(
            *left.get(index).unwrap_or(&0) ^ *right.get(index).unwrap_or(&0),
        );
    }

    difference == 0
}
