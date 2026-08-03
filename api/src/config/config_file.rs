use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Clone, Debug)]
pub enum Error { Read, Deserialize(String) }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileConfig {
    pub server: Server,
    pub security: Security,
    pub authentication: Authentication,
    pub database: Database,
    pub analytics: Analytics,
    pub cache: Cache,
    pub pipeline: Pipeline,
    pub ui: Ui,
}

impl FileConfig {
    pub fn load_from_toml() -> Result<Self, Error> {
        let value = fs::read_to_string("config.toml").map_err(|_| Error::Read)?;
        toml::from_str(&value).map_err(|e| Error::Deserialize(format!("TOML error: {}", e.message())))
    }
}

impl Default for FileConfig {
    fn default() -> Self {
        FileConfig {
            server: Server { listen_ip: "0.0.0.0".into(), listen_port: 8080, worker_count: 1 },
            security: Security { environment_token_encryption_key: "0000000000000000000000000000000000000000000000000000000000000000".into() },
            authentication: Authentication { username: "admin".into(), password: "admin".into(), secure_cookie: false },
            database: Database { url: "".into(), max_connections: 5 },
            analytics: Analytics { enabled: false, sync_interval_seconds: 60, retention_days: 30 },
            cache: Cache { group_ttl_seconds: 60, project_ttl_seconds: 60, branch_ttl_seconds: 60, job_ttl_seconds: 60, pipeline_ttl_seconds: 60, schedule_ttl_seconds: 60, runner_ttl_seconds: 60, runner_detail_ttl_seconds: 60, runner_job_ttl_seconds: 60, artifact_ttl_seconds: 60 },
            pipeline: Pipeline { history_days: 30 },
            ui: Ui { read_only: false, hide_write_actions: false, page_size_options: vec![10,25,50], default_page_size: 25 },
        }
    }
}

impl Default for Server { fn default() -> Self { Server{ listen_ip: "0.0.0.0".into(), listen_port: 8080, worker_count: 1 } } }
impl Default for Security { fn default() -> Self { Security{ environment_token_encryption_key: "0000000000000000000000000000000000000000000000000000000000000000".into() } } }
impl Default for Authentication { fn default() -> Self { Authentication{ username: "admin".into(), password: "admin".into(), secure_cookie:false } } }
impl Default for Database { fn default() -> Self { Database{ url: "".into(), max_connections:5 } } }
impl Default for Analytics { fn default() -> Self { Analytics{ enabled:false, sync_interval_seconds:60, retention_days:30 } } }
impl Default for Cache { fn default() -> Self { Cache{ group_ttl_seconds:60, project_ttl_seconds:60, branch_ttl_seconds:60, job_ttl_seconds:60, pipeline_ttl_seconds:60, schedule_ttl_seconds:60, runner_ttl_seconds:60, runner_detail_ttl_seconds:60, runner_job_ttl_seconds:60, artifact_ttl_seconds:60 } } }
impl Default for Pipeline { fn default() -> Self { Pipeline{ history_days:30 } } }
impl Default for Ui { fn default() -> Self { Ui{ read_only:false, hide_write_actions:false, page_size_options: vec![10,25,50], default_page_size:25 } } }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Server { pub listen_ip: String, pub listen_port: u16, pub worker_count: usize }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Security { pub environment_token_encryption_key: String }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Authentication { pub username: String, pub password: String, pub secure_cookie: bool }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Database { pub url: String, pub max_connections: u32 }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Analytics { pub enabled: bool, pub sync_interval_seconds: u64, pub retention_days: i64 }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cache {
    pub group_ttl_seconds: u64, pub project_ttl_seconds: u64, pub branch_ttl_seconds: u64,
    pub job_ttl_seconds: u64, pub pipeline_ttl_seconds: u64, pub schedule_ttl_seconds: u64,
    pub runner_ttl_seconds: u64, pub runner_detail_ttl_seconds: u64,
    pub runner_job_ttl_seconds: u64, pub artifact_ttl_seconds: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Pipeline { pub history_days: i64 }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ui {
    pub read_only: bool,
    pub hide_write_actions: bool, pub page_size_options: Vec<usize>, pub default_page_size: usize,
}
