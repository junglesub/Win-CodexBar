//! Auto-update checker for CodexBar
//! Checks GitHub releases for new versions and handles background downloads

use crate::settings::UpdateChannel;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::watch;

const GITHUB_API_URL: &str = "https://api.github.com";
const GITHUB_REPO: &str = "junglesub/Win-CodexBar";
const PERSONAL_LATEST_TAG: &str = "personal-latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const COMPILED_BUILD_SHA: Option<&str> = option_env!("CODEXBAR_BUILD_SHA");

/// Returns the compile-time injected build SHA, if set.
fn current_build_sha() -> Option<&'static str> {
    COMPILED_BUILD_SHA.map(str::trim).filter(|s| !s.is_empty())
}

/// Check if a local build ID matches the remote Git commit SHA.
fn is_same_build_id(current_sha: &str, remote_sha: &str) -> bool {
    let current = current_sha.trim();
    let remote = remote_sha.trim();
    if current.is_empty() || remote.is_empty() {
        return false;
    }
    if current.eq_ignore_ascii_case(remote) {
        return true;
    }
    if current.len() >= 7 && remote.len() >= 7 {
        if current.len() < remote.len()
            && remote
                .to_ascii_lowercase()
                .starts_with(&current.to_ascii_lowercase())
        {
            return true;
        }
        if remote.len() < current.len()
            && current
                .to_ascii_lowercase()
                .starts_with(&remote.to_ascii_lowercase())
        {
            return true;
        }
    }
    false
}

/// State of the update download process
#[derive(Debug, Clone, PartialEq, Default)]
pub enum UpdateState {
    /// No update available or not checked
    #[default]
    Idle,
    /// Update available but not downloaded
    Available,
    /// Currently downloading with progress (0.0 to 1.0)
    Downloading(f32),
    /// Download complete, ready to install
    Ready(PathBuf),
    /// Download or install failed
    Failed(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateDelivery {
    Installer,
    Manual,
}

#[derive(Debug, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub expected_sha256: Option<String>,
    #[allow(dead_code, reason = "read by the desktop shell through UpdateInfo")]
    pub release_url: String,
    #[allow(
        dead_code,
        reason = "retained in public update metadata for downstream clients"
    )]
    pub release_notes: String,
    pub delivery: UpdateDelivery,
}

impl UpdateInfo {
    pub fn supports_auto_apply(&self) -> bool {
        self.delivery == UpdateDelivery::Installer
    }

    pub fn supports_auto_download(&self) -> bool {
        self.delivery == UpdateDelivery::Installer && self.expected_sha256.is_some()
    }
}

#[derive(Debug, Deserialize)]
struct GitHubTagRef {
    object: GitHubTagObject,
}

#[derive(Debug, Deserialize)]
struct GitHubTagObject {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
    #[serde(default)]
    draft: bool,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    digest: Option<String>,
}

/// Check for updates from GitHub releases.
///
/// For personal rolling releases (`personal-latest`), checks the tag ref
/// commit SHA against the current compile-time build ID.
/// If no build ID is set (local dev build), does not check for updates.
pub async fn check_for_updates() -> Option<UpdateInfo> {
    check_for_personal_update(current_build_sha()).await
}

/// Check for updates with a channel preference.
///
/// Win-CodexBar personal builds roll under `personal-latest`, so the channel
/// setting is accepted for interface compatibility but both channels check
/// the `personal-latest` rolling prerelease.
pub async fn check_for_updates_with_channel(_channel: UpdateChannel) -> Option<UpdateInfo> {
    check_for_personal_update(current_build_sha()).await
}

async fn check_for_personal_update(build_sha: Option<&str>) -> Option<UpdateInfo> {
    let build_sha = build_sha?;
    let client = update_client()?;
    check_for_personal_update_at(
        &client,
        build_sha,
        GITHUB_API_URL,
        GITHUB_REPO,
        PERSONAL_LATEST_TAG,
    )
    .await
}

async fn check_for_personal_update_at(
    client: &reqwest::Client,
    build_sha: &str,
    api_url: &str,
    repo: &str,
    tag: &str,
) -> Option<UpdateInfo> {
    let tag_ref_url = format!("{api_url}/repos/{repo}/git/ref/tags/{tag}");
    let tag_response = client.get(&tag_ref_url).send().await.ok()?;
    if !tag_response.status().is_success() {
        tracing::debug!(
            "GitHub tag ref API returned status: {}",
            tag_response.status()
        );
        return None;
    }
    let tag_ref: GitHubTagRef = tag_response.json().await.ok()?;
    let remote_sha = tag_ref.object.sha.trim();

    if is_same_build_id(build_sha, remote_sha) {
        tracing::debug!(
            "Current build SHA {build_sha} matches remote {tag} SHA {remote_sha}; up to date"
        );
        return None;
    }

    let release_url = format!("{api_url}/repos/{repo}/releases/tags/{tag}");
    let release_response = client.get(&release_url).send().await.ok()?;
    if !release_response.status().is_success() {
        tracing::debug!(
            "GitHub release API returned status: {}",
            release_response.status()
        );
        return None;
    }
    let release: GitHubRelease = release_response.json().await.ok()?;
    if release.draft {
        return None;
    }

    select_release_target(&release, Some(remote_sha))
}

fn update_client() -> Option<reqwest::Client> {
    crate::core::apply_app_proxy(reqwest::Client::builder())
        .user_agent("CodexBar")
        .build()
        .ok()
}

fn select_release_target(release: &GitHubRelease, remote_sha: Option<&str>) -> Option<UpdateInfo> {
    let installer = release
        .assets
        .iter()
        .find(|a| is_installer_asset_name(&a.name));

    let (download_url, delivery, expected_sha256) = if let Some(asset) = installer {
        (
            asset.browser_download_url.clone(),
            UpdateDelivery::Installer,
            asset
                .digest
                .as_deref()
                .and_then(parse_sha256_digest)
                .map(str::to_string),
        )
    } else {
        (release.html_url.clone(), UpdateDelivery::Manual, None)
    };

    let version = if let Some(sha) = remote_sha.filter(|s| !s.is_empty()) {
        let short_sha = sha.chars().take(7).collect::<String>();
        format!("{}-{}", release.tag_name, short_sha)
    } else {
        release.tag_name.clone()
    };

    Some(UpdateInfo {
        version,
        download_url,
        expected_sha256,
        release_url: release.html_url.clone(),
        release_notes: release.body.clone().unwrap_or_default(),
        delivery,
    })
}

fn is_installer_asset_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with("-setup.exe") || lower.ends_with(".msi")
}

fn parse_version_triplet(v: &str) -> (u32, u32, u32) {
    let parts: Vec<u32> = v.split('.').filter_map(|p| p.parse().ok()).collect();
    (
        parts.first().copied().unwrap_or(0),
        parts.get(1).copied().unwrap_or(0),
        parts.get(2).copied().unwrap_or(0),
    )
}

fn installer_version_from_name(name: &str) -> Option<(u32, u32, u32)> {
    let lower = name.to_ascii_lowercase();
    let stem = lower
        .strip_suffix("-setup.exe")
        .or_else(|| lower.strip_suffix(".msi"))?;

    let version_candidate = stem.split_once('-').map(|(_, rest)| rest).unwrap_or(stem);
    let version_text: String = version_candidate
        .chars()
        .skip_while(|ch| !ch.is_ascii_digit())
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect();

    if version_text.is_empty() {
        return None;
    }

    let version = parse_version_triplet(&version_text);
    if version == (0, 0, 0) {
        return None;
    }

    Some(version)
}

fn parse_sha256_digest(digest: &str) -> Option<&str> {
    let (algo, hex) = digest.split_once(':')?;
    if !algo.eq_ignore_ascii_case("sha256") {
        return None;
    }

    let hex = hex.trim();
    if hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(hex)
    } else {
        None
    }
}

/// Get the current version
#[allow(dead_code, reason = "public updater API for downstream clients")]
pub fn current_version() -> &'static str {
    CURRENT_VERSION
}

/// Get the download directory for updates
fn get_download_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join("CodexBar").join("updates"))
}

/// Download an update with progress reporting
///
/// Returns a receiver that will receive progress updates (0.0 to 1.0)
/// and the final downloaded file path on completion.
pub async fn download_update(
    update_info: &UpdateInfo,
    progress_tx: watch::Sender<UpdateState>,
) -> Result<PathBuf, String> {
    validate_auto_download(update_info)?;

    let file_path = prepare_download_path(update_info)?;
    let response = start_download(&update_info.download_url).await?;
    write_download_response(response, &file_path, &progress_tx).await?;
    verify_download_hash(&file_path, expected_update_sha256(update_info)?).await?;

    // Signal download complete
    drop(progress_tx.send(UpdateState::Ready(file_path.clone())));

    Ok(file_path)
}

fn validate_auto_download(update_info: &UpdateInfo) -> Result<(), String> {
    if update_info.supports_auto_download() {
        Ok(())
    } else {
        Err("This update must be downloaded manually from the release page.".to_string())
    }
}

fn prepare_download_path(update_info: &UpdateInfo) -> Result<PathBuf, String> {
    let download_dir =
        get_download_dir().ok_or_else(|| "Could not determine download directory".to_string())?;

    std::fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Failed to create download directory: {}", e))?;

    Ok(download_dir.join(download_filename(&update_info.download_url)))
}

fn download_filename(download_url: &str) -> String {
    download_url
        .split('/')
        .next_back()
        .unwrap_or("CodexBar-Setup.exe")
        .to_string()
}

fn expected_update_sha256(update_info: &UpdateInfo) -> Result<&str, String> {
    update_info
        .expected_sha256
        .as_deref()
        .ok_or_else(|| "Missing SHA256 digest for update asset".to_string())
}

fn update_http_client() -> Result<reqwest::Client, String> {
    crate::core::apply_app_proxy(reqwest::Client::builder())
        .user_agent("CodexBar")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

async fn start_download(download_url: &str) -> Result<reqwest::Response, String> {
    let response = update_http_client()?
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if response.status().is_success() {
        Ok(response)
    } else {
        Err(format!(
            "Download failed with status: {}",
            response.status()
        ))
    }
}

async fn write_download_response(
    response: reqwest::Response,
    file_path: &Path,
    progress_tx: &watch::Sender<UpdateState>,
) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(file_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error downloading chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        send_download_progress(progress_tx, downloaded, total_size);
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))
}

fn send_download_progress(
    progress_tx: &watch::Sender<UpdateState>,
    downloaded: u64,
    total_size: u64,
) {
    let progress = if total_size > 0 {
        (downloaded as f32 / total_size as f32).clamp(0.0, 1.0)
    } else {
        0.0
    };

    drop(progress_tx.send(UpdateState::Downloading(progress)));
}

/// Verify the SHA256 hash of a downloaded file against release metadata.
async fn verify_download_hash(file_path: &PathBuf, expected_hash: &str) -> Result<(), String> {
    let actual = sha256_file_async(file_path).await?;
    if let Err(e) = verify_sha256_hex(&actual, expected_hash) {
        drop(std::fs::remove_file(file_path));
        return Err(e);
    }

    tracing::info!("SHA256 verification passed for {:?}", file_path);
    Ok(())
}

/// Re-verify an installer immediately before launching it.
pub fn verify_installer_hash(file_path: &Path, expected_hash: &str) -> Result<(), String> {
    let actual = sha256_file(file_path)?;
    verify_sha256_hex(&actual, expected_hash)
}

fn verify_sha256_hex(actual_hash: &str, expected_hash: &str) -> Result<(), String> {
    let expected = expected_hash.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid SHA256 digest provided for update asset".to_string());
    }

    if actual_hash != expected {
        return Err("SHA256 mismatch. Download may be corrupted or tampered.".to_string());
    }

    Ok(())
}

async fn sha256_file_async(file_path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let file_bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Failed to read downloaded file for hashing: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn sha256_file(file_path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let file_bytes = std::fs::read(file_path)
        .map_err(|e| format!("Failed to read downloaded file for hashing: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

/// Start background download of an update
///
/// Returns a receiver that can be polled for progress updates.
#[allow(dead_code, reason = "public updater API for downstream clients")]
pub fn start_background_download(
    update_info: UpdateInfo,
) -> (
    Arc<watch::Receiver<UpdateState>>,
    std::thread::JoinHandle<()>,
) {
    let (tx, rx) = watch::channel(UpdateState::Available);
    let rx = Arc::new(rx);

    let handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            match download_update(&update_info, tx.clone()).await {
                Ok(_path) => {
                    // UpdateState::Ready is already sent by download_update
                }
                Err(e) => {
                    drop(tx.send(UpdateState::Failed(e)));
                }
            }
        });
    });

    (rx, handle)
}

/// Apply a downloaded update by spawning the installer and exiting
///
/// This function will:
/// 1. Spawn the installer executable
/// 2. Exit the current application
///
/// The installer should handle upgrading the application while it's closed.
pub fn apply_update(installer_path: &PathBuf) -> Result<(), String> {
    // Verify the file exists
    if !installer_path.exists() {
        return Err(format!("Installer not found: {:?}", installer_path));
    }

    let file_name = installer_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if !is_installer_asset_name(file_name) {
        return Err(
            "Downloaded update is not an installer. Open the release page to update manually."
                .to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    spawn_windows_installer(
        installer_path,
        &windows_update_relaunch_path(
            &std::env::current_exe()
                .map_err(|e| format!("Failed to determine current executable for restart: {e}"))?,
        ),
    )?;

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;

        Command::new(installer_path)
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;
    }

    // Exit the application to allow the installer to proceed
    std::process::exit(0);
}

#[cfg(target_os = "windows")]
fn windows_update_relaunch_path(current_exe: &Path) -> PathBuf {
    let file_name = current_exe.file_name().and_then(|name| name.to_str());
    if file_name.is_some_and(|name| name.eq_ignore_ascii_case("codexbar-desktop.exe"))
        && let Some(primary_desktop_exe) = current_exe
            .parent()
            .map(|dir| dir.join("codexbar.exe"))
            .filter(|path| path.exists())
    {
        return primary_desktop_exe;
    }

    current_exe.to_path_buf()
}

#[cfg(target_os = "windows")]
fn spawn_windows_installer(installer_path: &Path, relaunch_path: &Path) -> Result<(), String> {
    use std::process::Command;

    let plan = windows_installer_launch_plan(installer_path)?;
    Command::new(windows_powershell_path())
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &windows_installer_apply_script(&plan, std::process::id(), relaunch_path),
        ])
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {}", e))?;
    Ok(())
}

#[cfg(target_os = "windows")]
struct WindowsInstallerLaunchPlan {
    program: PathBuf,
    args: Vec<std::ffi::OsString>,
}

#[cfg(target_os = "windows")]
fn windows_installer_launch_plan(
    installer_path: &Path,
) -> Result<WindowsInstallerLaunchPlan, String> {
    let extension = installer_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "msi" {
        return Ok(WindowsInstallerLaunchPlan {
            program: PathBuf::from("msiexec.exe"),
            args: vec![
                std::ffi::OsString::from("/i"),
                installer_path.as_os_str().to_os_string(),
                std::ffi::OsString::from("/quiet"),
                std::ffi::OsString::from("/norestart"),
            ],
        });
    }

    // CodexBar release setup executables are built by rust/installer/codexbar.iss
    // (Inno Setup). Silent installs skip the installer's postinstall [Run]
    // entry, so the update helper relaunches CodexBar after setup exits.
    Ok(WindowsInstallerLaunchPlan {
        program: installer_path.to_path_buf(),
        args: vec![
            std::ffi::OsString::from("/SILENT"),
            std::ffi::OsString::from("/SUPPRESSMSGBOXES"),
            std::ffi::OsString::from("/CLOSEAPPLICATIONS"),
            std::ffi::OsString::from("/NORESTART"),
        ],
    })
}

#[cfg(target_os = "windows")]
fn windows_installer_apply_script(
    plan: &WindowsInstallerLaunchPlan,
    current_pid: u32,
    relaunch_path: &Path,
) -> String {
    format!(
        "Wait-Process -Id {current_pid} -ErrorAction SilentlyContinue; \
         $p = Start-Process -FilePath {} -ArgumentList {} -PassThru -Wait; \
         if ($p.ExitCode -eq 0 -and (Test-Path {})) {{ \
           Start-Process -FilePath {} -ArgumentList @('menubar') \
         }}",
        powershell_single_quoted(&plan.program.to_string_lossy()),
        powershell_argument_list(&plan.args),
        powershell_single_quoted(&relaunch_path.to_string_lossy()),
        powershell_single_quoted(&relaunch_path.to_string_lossy()),
    )
}

#[cfg(target_os = "windows")]
fn powershell_argument_list(args: &[std::ffi::OsString]) -> String {
    let args = args
        .iter()
        .map(|arg| powershell_single_quoted(&arg.to_string_lossy()))
        .collect::<Vec<_>>()
        .join(",");
    format!("@({args})")
}

#[cfg(target_os = "windows")]
fn powershell_single_quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(target_os = "windows")]
fn windows_powershell_path() -> PathBuf {
    std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .map(|root| {
            root.join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .filter(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("powershell.exe"))
}

/// Check if there's a pending update ready to install
#[allow(dead_code, reason = "public updater API for downstream clients")]
pub fn get_pending_update() -> Option<PathBuf> {
    let download_dir = get_download_dir()?;

    if !download_dir.exists() {
        return None;
    }

    find_pending_installer_in_dir(&download_dir)
}

fn find_pending_installer_in_dir(download_dir: &Path) -> Option<PathBuf> {
    let current_version = parse_version_triplet(CURRENT_VERSION);

    // Only treat newer installer assets as pending updates, and prefer the highest
    // installer version when multiple cached installers are present.
    std::fs::read_dir(download_dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let file_name = path.file_name()?.to_str()?;
            let installer_version = installer_version_from_name(file_name)?;
            if installer_version <= current_version {
                return None;
            }

            let modified = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0);

            Some(((installer_version, modified), path))
        })
        .max_by_key(|(sort_key, _)| *sort_key)
        .map(|(_, path)| path)
}

/// Clean up downloaded updates
#[allow(dead_code, reason = "public updater API for downstream clients")]
pub fn cleanup_downloads() {
    if let Some(download_dir) = get_download_dir() {
        drop(std::fs::remove_dir_all(&download_dir));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_installer_asset_for_auto_update() {
        let release = GitHubRelease {
            tag_name: "v1.2.6".to_string(),
            html_url: "https://github.com/junglesub/Win-CodexBar/releases/tag/v1.2.6".to_string(),
            body: None,
            assets: vec![
                GitHubAsset {
                    name: "codexbar.exe".to_string(),
                    browser_download_url: "https://example.com/codexbar.exe".to_string(),
                    digest: None,
                },
                GitHubAsset {
                    name: "CodexBar-1.2.6-Setup.exe".to_string(),
                    browser_download_url: "https://example.com/CodexBar-1.2.6-Setup.exe"
                        .to_string(),
                    digest: Some(
                        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                            .to_string(),
                    ),
                },
            ],
            draft: false,
        };

        let update = select_release_target(&release, None).expect("update target");

        assert_eq!(
            update.download_url,
            "https://example.com/CodexBar-1.2.6-Setup.exe"
        );
        assert!(update.supports_auto_apply());
        assert!(update.supports_auto_download());
    }

    #[test]
    fn falls_back_to_manual_release_when_only_portable_exe_exists() {
        let release = GitHubRelease {
            tag_name: "v1.2.6".to_string(),
            html_url: "https://github.com/junglesub/Win-CodexBar/releases/tag/v1.2.6".to_string(),
            body: None,
            assets: vec![GitHubAsset {
                name: "codexbar.exe".to_string(),
                browser_download_url: "https://example.com/codexbar.exe".to_string(),
                digest: None,
            }],
            draft: false,
        };

        let update = select_release_target(&release, None).expect("update target");

        assert_eq!(
            update.download_url,
            "https://github.com/junglesub/Win-CodexBar/releases/tag/v1.2.6"
        );
        assert!(!update.supports_auto_apply());
    }

    #[test]
    fn finds_newest_pending_installer_and_ignores_portable_exe() {
        let temp = tempfile::tempdir().expect("temp dir");
        let (major, minor, patch) = parse_version_triplet(CURRENT_VERSION);
        let portable = temp.path().join("codexbar.exe");
        let older = temp
            .path()
            .join(format!("CodexBar-{}.{}.{}-Setup.exe", major, minor, patch));
        let newer = temp.path().join(format!(
            "CodexBar-{}.{}.{}-Setup.exe",
            major,
            minor,
            patch + 1
        ));

        std::fs::write(&portable, b"portable").expect("write portable");
        std::fs::write(&older, b"older installer").expect("write older installer");
        std::fs::write(&newer, b"newer installer").expect("write newer installer");

        let pending = find_pending_installer_in_dir(temp.path()).expect("pending installer");

        assert_eq!(pending, newer);
    }

    #[test]
    fn ignores_cached_installers_for_current_or_older_versions() {
        let temp = tempfile::tempdir().expect("temp dir");
        let (major, minor, patch) = parse_version_triplet(CURRENT_VERSION);
        let current = temp
            .path()
            .join(format!("CodexBar-{}.{}.{}-Setup.exe", major, minor, patch));
        let older = temp.path().join(format!(
            "CodexBar-{}.{}.{}-Setup.exe",
            major,
            minor,
            patch.saturating_sub(1)
        ));

        std::fs::write(&current, b"current installer").expect("write current installer");
        std::fs::write(&older, b"older installer").expect("write older installer");

        assert!(find_pending_installer_in_dir(temp.path()).is_none());
    }

    #[test]
    fn parses_prerelease_installer_names_for_beta_updates() {
        let (major, minor, patch) = parse_version_triplet(CURRENT_VERSION);
        assert_eq!(
            installer_version_from_name(&format!(
                "CodexBar-{}.{}.{}-beta.1-Setup.exe",
                major,
                minor,
                patch + 1
            )),
            Some((major, minor, patch + 1))
        );
    }

    #[test]
    fn verify_installer_hash_accepts_matching_sha256() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("CodexBar-1.2.3-Setup.exe");
        std::fs::write(&path, b"installer bytes").expect("write installer");

        let expected = sha256_file(&path).expect("hash");
        assert!(verify_installer_hash(&path, &expected).is_ok());
    }

    #[test]
    fn verify_installer_hash_rejects_mismatched_sha256() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("CodexBar-1.2.3-Setup.exe");
        std::fs::write(&path, b"installer bytes").expect("write installer");

        let wrong = "0".repeat(64);
        let err = verify_installer_hash(&path, &wrong).unwrap_err();
        assert!(err.contains("SHA256 mismatch"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_setup_exe_uses_inno_silent_flags() {
        let path = PathBuf::from(r"C:\Temp\CodexBar-1.2.3-Setup.exe");

        let plan = windows_installer_launch_plan(&path).expect("launch plan");

        assert_eq!(plan.program, path);
        assert_eq!(
            plan.args,
            vec![
                std::ffi::OsString::from("/SILENT"),
                std::ffi::OsString::from("/SUPPRESSMSGBOXES"),
                std::ffi::OsString::from("/CLOSEAPPLICATIONS"),
                std::ffi::OsString::from("/NORESTART"),
            ]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_apply_script_waits_for_current_process_before_installing() {
        let path = PathBuf::from(r"C:\Temp\CodexBar-1.2.3-Setup.exe");
        let relaunch_path = PathBuf::from(r"C:\Program Files\CodexBar\codexbar.exe");
        let plan = windows_installer_launch_plan(&path).expect("launch plan");

        let script = windows_installer_apply_script(&plan, 12345, &relaunch_path);

        assert!(script.contains("Wait-Process -Id 12345"));
        assert!(script.contains(r"Start-Process -FilePath 'C:\Temp\CodexBar-1.2.3-Setup.exe'"));
        assert!(script.contains(
            "-ArgumentList @('/SILENT','/SUPPRESSMSGBOXES','/CLOSEAPPLICATIONS','/NORESTART')"
        ));
        assert!(script.contains("-PassThru -Wait"));
        assert!(script.contains(r"Start-Process -FilePath 'C:\Program Files\CodexBar\codexbar.exe' -ArgumentList @('menubar')"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_update_relaunch_path_prefers_primary_desktop_exe_from_legacy_alias() {
        let temp = tempfile::tempdir().expect("temp dir");
        let desktop_path = temp.path().join("codexbar.exe");
        let legacy_desktop_path = temp.path().join("codexbar-desktop.exe");
        std::fs::write(&desktop_path, b"desktop").expect("write desktop");
        std::fs::write(&legacy_desktop_path, b"legacy desktop").expect("write legacy desktop");

        assert_eq!(
            windows_update_relaunch_path(&legacy_desktop_path),
            desktop_path
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_msi_uses_msiexec_quiet_install() {
        let path = PathBuf::from(r"C:\Temp\CodexBar-1.2.3.msi");

        let plan = windows_installer_launch_plan(&path).expect("launch plan");

        assert_eq!(plan.program, PathBuf::from("msiexec.exe"));
        assert_eq!(
            plan.args,
            vec![
                std::ffi::OsString::from("/i"),
                path.as_os_str().to_os_string(),
                std::ffi::OsString::from("/quiet"),
                std::ffi::OsString::from("/norestart"),
            ]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn powershell_quoting_escapes_single_quotes() {
        assert_eq!(
            powershell_single_quoted(r"C:\Temp\CodexBar's Setup.exe"),
            r"'C:\Temp\CodexBar''s Setup.exe'"
        );
    }

    #[test]
    fn test_is_same_build_id() {
        // Exact match
        assert!(is_same_build_id(
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3",
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3"
        ));
        // Case insensitive
        assert!(is_same_build_id(
            "1EBB612FD2A15552EE910B4ABD8429D7BC4C14A3",
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3"
        ));
        // Short prefix (>=7 chars) vs full SHA
        assert!(is_same_build_id(
            "1ebb612",
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3"
        ));
        assert!(is_same_build_id(
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3",
            "1ebb612"
        ));
        // Different commit SHAs
        assert!(!is_same_build_id(
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3",
            "5b11cfcb571064e5e46e5d5ea0c4faab986c7157"
        ));
        assert!(!is_same_build_id("1ebb612", "5b11cfc"));
        // Empty or whitespace strings
        assert!(!is_same_build_id("", "1ebb612"));
        assert!(!is_same_build_id("1ebb612", "   "));
        assert!(!is_same_build_id("", ""));
        // Short strings under 7 chars that aren't identical
        assert!(!is_same_build_id(
            "1ebb6",
            "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3"
        ));
    }

    #[tokio::test]
    async fn local_dev_build_without_sha_does_not_check_updates() {
        assert!(check_for_personal_update(None).await.is_none());
    }

    #[tokio::test]
    async fn different_personal_tag_commit_fetches_the_rolling_release() {
        let mut server = mockito::Server::new_async().await;
        let tag_ref = server
            .mock("GET", "/repos/owner/repo/git/ref/tags/personal-latest")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "ref":"refs/tags/personal-latest",
                    "object":{
                        "sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        "type":"commit"
                    }
                }"#,
            )
            .create_async()
            .await;
        let release = server
            .mock("GET", "/repos/owner/repo/releases/tags/personal-latest")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "tag_name":"personal-latest",
                    "html_url":"https://example.test/release",
                    "body":"rolling build",
                    "assets":[{
                        "name":"CodexBar-0.55.0-Setup.exe",
                        "browser_download_url":"https://example.test/setup.exe",
                        "digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    }],
                    "draft":false,
                    "prerelease":true
                }"#,
            )
            .create_async()
            .await;

        let update = check_for_personal_update_at(
            &reqwest::Client::new(),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            &server.url(),
            "owner/repo",
            "personal-latest",
        )
        .await
        .expect("different build should update");

        assert_eq!(update.version, "personal-latest-bbbbbbb");
        assert_eq!(update.download_url, "https://example.test/setup.exe");
        tag_ref.assert_async().await;
        release.assert_async().await;
    }

    #[tokio::test]
    async fn matching_personal_tag_commit_skips_the_rolling_release() {
        let mut server = mockito::Server::new_async().await;
        let sha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let tag_ref = server
            .mock("GET", "/repos/owner/repo/git/ref/tags/personal-latest")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(format!(
                r#"{{
                    "ref":"refs/tags/personal-latest",
                    "object":{{
                        "sha":"{sha}",
                        "type":"commit"
                    }}
                }}"#
            ))
            .create_async()
            .await;
        let release = server
            .mock("GET", "/repos/owner/repo/releases/tags/personal-latest")
            .with_status(200)
            .expect(0)
            .create_async()
            .await;

        let update = check_for_personal_update_at(
            &reqwest::Client::new(),
            sha,
            &server.url(),
            "owner/repo",
            "personal-latest",
        )
        .await;

        assert!(update.is_none());
        tag_ref.assert_async().await;
        release.assert_async().await;
    }

    #[test]
    fn personal_latest_non_semver_target_selection() {
        let release = GitHubRelease {
            tag_name: "personal-latest".to_string(),
            html_url: "https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest".to_string(),
            body: Some("Automated build of personal branch".to_string()),
            assets: vec![
                GitHubAsset {
                    name: "CodexBar-0.55.0-Setup.exe".to_string(),
                    browser_download_url: "https://github.com/junglesub/Win-CodexBar/releases/download/personal-latest/CodexBar-0.55.0-Setup.exe".to_string(),
                    digest: Some("sha256:1c87abba6f0c71c32ebb39fc51f2dc2d921c23e5a8f70a6ba8f9e19fbc72eba6".to_string()),
                },
                GitHubAsset {
                    name: "CodexBar-0.55.0-portable.exe".to_string(),
                    browser_download_url: "https://github.com/junglesub/Win-CodexBar/releases/download/personal-latest/CodexBar-0.55.0-portable.exe".to_string(),
                    digest: None,
                },
            ],
            draft: false,
        };

        let remote_sha = "1ebb612fd2a15552ee910b4abd8429d7bc4c14a3";
        let update = select_release_target(&release, Some(remote_sha)).expect("update info");

        assert_eq!(update.version, "personal-latest-1ebb612");
        assert_eq!(
            update.download_url,
            "https://github.com/junglesub/Win-CodexBar/releases/download/personal-latest/CodexBar-0.55.0-Setup.exe"
        );
        assert_eq!(
            update.expected_sha256,
            Some("1c87abba6f0c71c32ebb39fc51f2dc2d921c23e5a8f70a6ba8f9e19fbc72eba6".to_string())
        );
        assert!(update.supports_auto_apply());
        assert!(update.supports_auto_download());
    }
}
