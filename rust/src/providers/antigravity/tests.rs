use super::*;

fn make_summary(groups: Vec<serde_json::Value>) -> String {
    serde_json::json!({ "response": { "groups": groups } }).to_string()
}

fn gemini_group(buckets: Vec<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({ "displayName": "Gemini Models", "buckets": buckets })
}

fn bucket(bucket_id: &str, display_name: &str, remaining_fraction: f64) -> serde_json::Value {
    serde_json::json!({
        "bucketId": bucket_id,
        "displayName": display_name,
        "remainingFraction": remaining_fraction
    })
}

#[test]
fn test_parse_quota_summary_maps_five_hour_and_weekly() {
    // Observed agy 1.1.5 shape: weekly first, then 5h — order must not matter.
    let text = make_summary(vec![
        gemini_group(vec![
            bucket("gemini-weekly", "Weekly Limit", 0.958),
            bucket("gemini-5h", "Five Hour Limit", 0.749),
        ]),
        serde_json::json!({
            "displayName": "Claude and GPT models",
            "buckets": [
                bucket("3p-weekly", "Weekly Limit", 1.0),
                bucket("3p-5h", "Five Hour Limit", 1.0),
            ]
        }),
    ]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    assert!((snap.primary.used_percent - 25.1).abs() < 0.1);
    assert_eq!(snap.primary.window_minutes, Some(300));
    let sec = snap.secondary.unwrap();
    assert!((sec.used_percent - 4.2).abs() < 0.1);
    assert_eq!(sec.window_minutes, Some(10_080));
    assert!(snap.model_specific.is_none());
    assert!(snap.extra_rate_windows.is_empty());
}

#[test]
fn test_parse_quota_summary_accepts_nested_remaining_fraction() {
    let text = make_summary(vec![gemini_group(vec![
        serde_json::json!({
            "bucketId": "gemini-weekly",
            "displayName": "Weekly Limit",
            "window": "weekly",
            "remaining": { "remainingFraction": 0.5 }
        }),
        serde_json::json!({
            "bucketId": "gemini-5h",
            "displayName": "Five Hour Limit",
            "window": "5h",
            "remaining": { "remainingFraction": 0.25 }
        }),
    ])]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    assert!((snap.primary.used_percent - 75.0).abs() < 0.1);
    assert!((snap.secondary.unwrap().used_percent - 50.0).abs() < 0.1);
}

#[test]
fn test_parse_quota_summary_prefers_explicit_window_field() {
    // Explicit `window` wins over bucketId/displayName inference.
    let text = make_summary(vec![gemini_group(vec![
        serde_json::json!({
            "bucketId": "anything-weekly",
            "displayName": "Weekly Limit",
            "window": "weekly",
            "remainingFraction": 0.1
        }),
        serde_json::json!({
            "bucketId": "anything-5h",
            "displayName": "Five Hour Limit",
            "window": "5h",
            "remainingFraction": 0.2
        }),
    ])]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    assert!((snap.primary.used_percent - 80.0).abs() < 0.1);
    assert_eq!(snap.primary.window_minutes, Some(300));
    assert!((snap.secondary.unwrap().used_percent - 90.0).abs() < 0.1);
}

#[test]
fn test_parse_quota_summary_weekly_only_is_partial_but_usable() {
    let text = make_summary(vec![gemini_group(vec![bucket(
        "gemini-weekly",
        "Weekly Limit",
        0.4,
    )])]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    // Weekly-only: the weekly bucket becomes primary (classified by minutes),
    // and is not duplicated into secondary.
    assert!((snap.primary.used_percent - 60.0).abs() < 0.1);
    assert_eq!(snap.primary.window_minutes, Some(10_080));
    assert!(snap.secondary.is_none());
}

#[test]
fn test_parse_quota_summary_most_constrained_bucket_wins() {
    let text = make_summary(vec![gemini_group(vec![
        bucket("gemini-5h-a", "Five Hour Limit", 0.9),
        bucket("gemini-5h-b", "Five Hour Limit", 0.5),
    ])]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    // Lowest remaining (most constrained) represents the cadence.
    assert!((snap.primary.used_percent - 50.0).abs() < 0.1);
}

#[test]
fn test_parse_quota_summary_rejects_fifteen_hour_as_five_hour() {
    let text = make_summary(vec![gemini_group(vec![
        bucket("gemini-15h", "Fifteen Hour Limit", 0.5),
        bucket("gemini-weekly", "Weekly Limit", 0.9),
    ])]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    // 15h is not five-hour; weekly still surfaces.
    assert_eq!(snap.primary.window_minutes, Some(10_080));
    assert!(snap.secondary.is_none());
}

#[test]
fn test_parse_quota_summary_rejects_non_finite_fraction() {
    // serde_json cannot represent NaN, so build the bucket struct directly.
    let nan_bucket = QuotaSummaryBucket {
        bucket_id: "gemini-5h".to_string(),
        display_name: "Five Hour Limit".to_string(),
        description: None,
        window: None,
        remaining_fraction: Some(f64::NAN),
        remaining: None,
        reset_time: None,
    };
    assert!(nan_bucket.usable_fraction().is_none());
    assert!(
        QuotaSummaryBucket {
            remaining_fraction: Some(f64::INFINITY),
            ..nan_bucket
        }
        .usable_fraction()
        .is_none()
    );
}

#[test]
fn test_parse_quota_summary_clamps_fraction() {
    let text = make_summary(vec![gemini_group(vec![
        bucket("gemini-5h", "Five Hour Limit", 1.5),
        bucket("gemini-weekly", "Weekly Limit", -0.5),
    ])]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    assert!((snap.primary.used_percent - 0.0).abs() < 0.1);
    assert!((snap.secondary.unwrap().used_percent - 100.0).abs() < 0.1);
}

#[test]
fn test_parse_quota_summary_no_gemini_group_fails() {
    let text = make_summary(vec![serde_json::json!({
        "displayName": "Claude and GPT models",
        "buckets": [
            bucket("3p-weekly", "Weekly Limit", 0.5),
            bucket("3p-5h", "Five Hour Limit", 0.5),
        ]
    })]);
    let provider = AntigravityProvider::new();
    assert!(provider.parse_quota_summary(&text).is_err());
}

#[test]
fn test_parse_quota_summary_ignores_claude_group_capitalization() {
    // "Claude and GPT models" must not be selected as the Gemini group.
    let text = make_summary(vec![
        gemini_group(vec![bucket("gemini-5h", "Five Hour Limit", 0.2)]),
        serde_json::json!({
            "displayName": "CLAUDE AND GPT MODELS",
            "buckets": [bucket("3p-5h", "Five Hour Limit", 0.0)]
        }),
    ]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    assert_eq!(snap.primary.window_minutes, Some(300));
    assert!((snap.primary.used_percent - 80.0).abs() < 0.1);
}

#[test]
fn test_parse_quota_summary_missing_payload_fails() {
    let provider = AntigravityProvider::new();
    assert!(provider.parse_quota_summary(r#"{"code": 0}"#).is_err());
    assert!(provider.parse_quota_summary("not json").is_err());
}

#[test]
fn test_parse_quota_summary_parses_reset_time() {
    let mut g = gemini_group(vec![bucket("gemini-5h", "Five Hour Limit", 0.2)]);
    g["buckets"][0]["resetTime"] = serde_json::json!("2026-07-23T17:05:10Z");
    let text = make_summary(vec![g]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_quota_summary(&text).unwrap();

    let resets = snap.primary.resets_at.unwrap();
    assert_eq!(resets.to_rfc3339(), "2026-07-23T17:05:10+00:00");
}

#[test]
fn test_classify_model_families() {
    assert_eq!(classify_model("Claude 3.5 Sonnet"), ModelFamily::Claude);
    assert_eq!(classify_model("claude-4-opus"), ModelFamily::Claude);
    assert_eq!(
        classify_model("Claude Thinking"),
        ModelFamily::ClaudeThinking
    );
    assert_eq!(
        classify_model("claude-3.5-sonnet-thinking"),
        ModelFamily::ClaudeThinking
    );
    assert_eq!(classify_model("Gemini 2.5 Pro Low"), ModelFamily::GeminiPro);
    assert_eq!(classify_model("gemini-pro-low"), ModelFamily::GeminiPro);
    assert_eq!(classify_model("Pro Low Latency"), ModelFamily::GeminiPro);
    assert_eq!(classify_model("Gemini 2.5 Flash"), ModelFamily::GeminiFlash);
    assert_eq!(classify_model("gemini-flash"), ModelFamily::GeminiFlash);
    assert_eq!(classify_model("Flash Model"), ModelFamily::GeminiFlash);
    assert_eq!(classify_model("GPT-4o"), ModelFamily::Other);
    assert_eq!(classify_model("unknown-model"), ModelFamily::Other);
}

#[test]
fn parses_current_language_server_process() {
    let output = r"4242	C:\Users\test\AppData\Local\Programs\Antigravity\resources\bin\language_server.exe --csrf_token 11111111-2222-3333-4444-555555555555 --extension_server_port 54123";

    let process = AntigravityProvider::parse_process_info(output).expect("process info");

    assert_eq!(process.pid, Some(4242));
    assert_eq!(process.extension_port, Some(54123));
    assert_eq!(process.csrf_token, "11111111-2222-3333-4444-555555555555");
    assert_eq!(process.source, ProcessSource::Ide);
}

#[test]
fn parses_language_server_without_extension_server_port() {
    let output = "34564\tC:\\Users\\test\\AppData\\Local\\Programs\\Antigravity\\resources\\bin\\language_server.exe --standalone --override_ide_name antigravity --subclient_type hub --override_ide_version 2.0.11 --https_server_port 0 --csrf_token 68dda2fb-6b26-40c0-aeef-b9a628615714 --app_data_dir antigravity";

    let process =
        AntigravityProvider::parse_process_info(output).expect("process info should be detected");

    assert_eq!(process.pid, Some(34564));
    assert_eq!(process.extension_port, Some(0));
    assert_eq!(process.csrf_token, "68dda2fb-6b26-40c0-aeef-b9a628615714");
    assert_eq!(process.source, ProcessSource::Ide);
}

#[test]
fn parses_language_server_without_any_port_arg() {
    let output = "34564\tC:\\Users\\test\\AppData\\Local\\Programs\\Antigravity\\resources\\bin\\language_server.exe --standalone --csrf_token aabbccdd-1122-3344-5566-778899001122 --app_data_dir antigravity";

    let process =
        AntigravityProvider::parse_process_info(output).expect("process info should be detected");

    assert_eq!(process.pid, Some(34564));
    assert_eq!(process.extension_port, None);
    assert_eq!(process.csrf_token, "aabbccdd-1122-3344-5566-778899001122");
    assert_eq!(process.source, ProcessSource::Ide);
}

#[test]
fn parses_equals_form_args() {
    let output = "34564\tC:\\Users\\test\\AppData\\Local\\Programs\\Antigravity\\resources\\bin\\language_server.exe --csrf_token=68dda2fb-6b26-40c0-aeef-b9a628615714 --https_server_port=61999";

    let process =
        AntigravityProvider::parse_process_info(output).expect("process info should be detected");

    assert_eq!(process.pid, Some(34564));
    assert_eq!(process.extension_port, Some(61999));
    assert_eq!(process.csrf_token, "68dda2fb-6b26-40c0-aeef-b9a628615714");
    assert_eq!(process.source, ProcessSource::Ide);
}

fn make_response(models: Vec<(&str, f64)>) -> UserStatusResponse {
    let json = serde_json::json!({
        "userStatus": {
            "cascadeModelConfigData": {
                "clientModelConfigs": models.iter().map(|(label, remaining)| {
                    serde_json::json!({
                        "label": label,
                        "quotaInfo": {
                            "remainingFraction": remaining
                        }
                    })
                }).collect::<Vec<_>>()
            }
        }
    });
    serde_json::from_value(json).unwrap()
}

#[test]
fn test_parse_user_status_standard() {
    let resp = make_response(vec![
        ("Claude 3.5 Sonnet", 0.8),
        ("Gemini 2.5 Pro Low", 0.5),
        ("Gemini 2.5 Flash", 0.9),
    ]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_user_status(resp).unwrap();

    assert!((snap.primary.used_percent - 20.0).abs() < 0.1);
    let sec = snap.secondary.unwrap();
    assert!((sec.used_percent - 50.0).abs() < 0.1);
    let ter = snap.model_specific.unwrap();
    assert!((ter.used_percent - 10.0).abs() < 0.1);
    assert_eq!(snap.extra_rate_windows.len(), 3);
    assert!(
        snap.extra_rate_windows
            .iter()
            .any(|window| window.title == "Gemini 2.5 Flash")
    );
}

#[test]
fn test_parse_user_status_thinking_skipped() {
    let resp = make_response(vec![
        ("Claude Thinking", 0.6),
        ("Claude 3.5 Sonnet", 0.7),
        ("Gemini 2.5 Flash", 0.5),
    ]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_user_status(resp).unwrap();

    assert!((snap.primary.used_percent - 30.0).abs() < 0.1);
}

#[test]
fn test_parse_user_status_fallback_first() {
    let resp = make_response(vec![("GPT-4o", 0.4), ("Mistral Large", 0.6)]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_user_status(resp).unwrap();

    assert!((snap.primary.used_percent - 60.0).abs() < 0.1);
    assert!(snap.secondary.is_none());
    assert!(snap.model_specific.is_none());
}

#[test]
fn test_noisy_models_do_not_drive_summary_windows() {
    let resp = make_response(vec![
        ("Gemini 2.5 Flash Image", 0.01),
        ("Gemini 2.5 Pro Lite", 0.02),
        ("Gemini autocomplete internal", 0.03),
        ("Claude 4 Sonnet", 0.8),
        ("Gemini 2.5 Pro Low", 0.6),
        ("Gemini 2.5 Flash", 0.7),
    ]);
    let provider = AntigravityProvider::new();
    let snap = provider.parse_user_status(resp).unwrap();

    assert!((snap.primary.used_percent - 20.0).abs() < 0.1);
    assert!((snap.secondary.unwrap().used_percent - 40.0).abs() < 0.1);
    assert!((snap.model_specific.unwrap().used_percent - 30.0).abs() < 0.1);
    assert!(
        snap.extra_rate_windows
            .iter()
            .any(|window| window.title == "Gemini 2.5 Flash Image")
    );
}

#[test]
fn not_running_error_tells_user_how_to_start() {
    let error = ProviderError::NotInstalled(NOT_RUNNING_MESSAGE.to_string()).to_string();

    assert!(error.contains("Start Google Antigravity and sign in"));
}

// ── agy CLI process matching ───────────────────────────────────────

#[test]
fn detects_agy_exe_cli_process_with_empty_csrf() {
    // agy.exe hosts the language server in-process with no --csrf_token.
    let output =
        "7777\tC:\\Users\\test\\AppData\\Local\\agy\\bin\\agy.exe session --model gemini-2.5-pro";

    let process = AntigravityProvider::parse_process_info(output)
        .expect("agy CLI process should be detected");

    assert_eq!(process.pid, Some(7777));
    assert_eq!(process.source, ProcessSource::Cli);
    assert_eq!(process.csrf_token, "");
    assert!(
        process.csrf_token.is_empty(),
        "agy CLI requires no CSRF token"
    );
    assert_eq!(process.extension_server_csrf_token, None);
    assert_eq!(process.extension_port, None);
}

#[test]
fn detects_bare_agy_command() {
    // The CLI may appear under the bare `agy` name (no .exe suffix).
    let output = "8888\tagy serve";

    let process = AntigravityProvider::parse_process_info(output)
        .expect("bare agy command should be detected");

    assert_eq!(process.pid, Some(8888));
    assert_eq!(process.source, ProcessSource::Cli);
    assert!(process.csrf_token.is_empty());
}

#[test]
fn detects_antigravity_cli_command() {
    // Upstream also matches antigravity-cli / antigravity_cli.
    let output = "9999\t/opt/homebrew/bin/antigravity-cli status";

    let process = AntigravityProvider::parse_process_info(output)
        .expect("antigravity-cli command should be detected");

    assert_eq!(process.pid, Some(9999));
    assert_eq!(process.source, ProcessSource::Cli);
    assert!(process.csrf_token.is_empty());
}

#[test]
fn ide_match_preferred_over_agy_cli_when_both_running() {
    // When the desktop IDE server and the agy CLI are both running, the
    // CSRF-protected IDE match wins (mirrors upstream process-kind precedence).
    let output = "4242\tC:\\Antigravity\\language_server.exe --csrf_token deadbeef-aaaa-bbbb-cccc-dddddddddddd --extension_server_port 54123\n\
                  7777\tC:\\Users\\test\\AppData\\Local\\agy\\bin\\agy.exe session";

    let process =
        AntigravityProvider::parse_process_info(output).expect("a process should be detected");

    assert_eq!(process.pid, Some(4242));
    assert_eq!(process.source, ProcessSource::Ide);
    assert_eq!(process.csrf_token, "deadbeef-aaaa-bbbb-cccc-dddddddddddd");
}

#[test]
fn agy_cli_matches_when_only_cli_running() {
    // No --csrf_token anywhere: only the agy CLI line should match.
    let output = "7777\tC:\\Users\\test\\AppData\\Local\\agy\\bin\\agy.exe";

    let process = AntigravityProvider::parse_process_info(output)
        .expect("agy CLI should be detected when it is the only match");

    assert_eq!(process.source, ProcessSource::Cli);
    assert!(process.csrf_token.is_empty());
}

#[test]
fn non_antigravity_process_without_csrf_is_not_matched() {
    // An unrelated tokenless process must not be mistaken for the agy CLI.
    let output = "1234\tC:\\Windows\\System32\\notepad.exe";

    let process = AntigravityProvider::parse_process_info(output);

    assert!(process.is_none(), "unrelated process must not match");
}

#[test]
fn is_agy_cli_command_matches_known_names() {
    assert!(is_agy_cli_command("agy serve"));
    assert!(is_agy_cli_command(
        "C:\\Users\\test\\AppData\\Local\\agy\\bin\\agy.exe session"
    ));
    assert!(is_agy_cli_command("/usr/local/bin/antigravity-cli status"));
    assert!(is_agy_cli_command("/opt/antigravity_cli run"));
}

#[test]
fn is_agy_cli_command_matches_quoted_windows_paths() {
    // Observed real Windows command line: the executable path is double-quoted
    // and a closing `"` immediately follows agy.exe before the arguments.
    assert!(is_agy_cli_command(
        "\"C:\\Users\\RyooJungsub\\AppData\\Local\\agy\\bin\\agy.exe\" --dangerously-skip-permissions"
    ));
    assert!(is_agy_cli_command(
        "\"C:\\Users\\test\\AppData\\Local\\agy\\bin\\antigravity-cli.exe\" serve"
    ));
    assert!(is_agy_cli_command(
        "\"C:\\Users\\test\\AppData\\Local\\agy\\bin\\antigravity_cli.exe\" serve"
    ));
}

#[test]
fn detects_quoted_agy_exe_command_line() {
    // Regression: a double-quoted agy.exe path (Windows command line) must be
    // recognized as the CLI even though a closing quote follows the name.
    let output = "5555\t\"C:\\Users\\RyooJungsub\\AppData\\Local\\agy\\bin\\agy.exe\" --dangerously-skip-permissions";

    let process = AntigravityProvider::parse_process_info(output)
        .expect("quoted agy.exe command should be detected");

    assert_eq!(process.pid, Some(5555));
    assert_eq!(process.source, ProcessSource::Cli);
    assert!(process.csrf_token.is_empty());
}

#[test]
fn is_agy_cli_command_rejects_unrelated_names() {
    // A leading path separator prevents `notantigravity-cli` from matching.
    assert!(!is_agy_cli_command("notantigravity-cli status"));
    assert!(!is_agy_cli_command("C:\\Windows\\System32\\notepad.exe"));
    assert!(!is_agy_cli_command("language_server.exe --csrf_token abc"));
    assert!(
        !is_agy_cli_command("C:\\agy\\other.exe"),
        "a directory segment named agy must not match the agy executable"
    );
    assert!(!is_agy_cli_command("\"C:\\tools\\agy-helper.exe\" run"));
    assert!(!is_agy_cli_command("\"C:\\tools\\notagy.exe\" run"));
    assert!(!is_agy_cli_command(""));
}
