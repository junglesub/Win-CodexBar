fn main() {
    println!("cargo:rerun-if-env-changed=CODEXBAR_BUILD_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    if let Ok(sha) = std::env::var("CODEXBAR_BUILD_SHA").or_else(|_| std::env::var("GITHUB_SHA")) {
        let sha = sha.trim();
        if !sha.is_empty() {
            println!("cargo:rustc-env=CODEXBAR_BUILD_SHA={}", sha);
        }
    }
    tauri_build::build()
}
