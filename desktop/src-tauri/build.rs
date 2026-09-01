fn main() {
    // Embed Lemon Squeezy product config at build time.
    // Set these in CI secrets: LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_PRODUCT_ID, LEMONSQUEEZY_API_URL
    println!("cargo:rerun-if-env-changed=LEMONSQUEEZY_STORE_ID");
    println!("cargo:rerun-if-env-changed=LEMONSQUEEZY_PRODUCT_ID");
    println!("cargo:rerun-if-env-changed=LEMONSQUEEZY_API_URL");

    let store_id = std::env::var("LEMONSQUEEZY_STORE_ID").unwrap_or_else(|_| "0".to_string());
    let product_id = std::env::var("LEMONSQUEEZY_PRODUCT_ID").unwrap_or_else(|_| "0".to_string());
    let api_base = std::env::var("LEMONSQUEEZY_API_URL")
        .unwrap_or_else(|_| "https://api.lemonsqueezy.com/v1/licenses".to_string());

    println!("cargo:rustc-env=LS_STORE_ID={store_id}");
    println!("cargo:rustc-env=LS_PRODUCT_ID={product_id}");
    println!("cargo:rustc-env=LS_API_BASE={api_base}");

    tauri_build::build()
}
