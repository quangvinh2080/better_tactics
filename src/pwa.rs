use axum::extract::Path;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};

/// The web app manifest, served at a stable root URL so its scope is "/".
const MANIFEST: &str = include_str!("pwa/manifest.webmanifest");

/// The service worker, served at /sw.js so its scope is "/".
const SERVICE_WORKER: &str = include_str!("pwa/sw.js");

pub async fn manifest() -> Response {
    (
        [(header::CONTENT_TYPE, "application/manifest+json")],
        MANIFEST,
    )
        .into_response()
}

pub async fn service_worker() -> Response {
    (
        [
            (header::CONTENT_TYPE, "application/javascript"),
            (
                header::HeaderName::from_static("service-worker-allowed"),
                "/",
            ),
        ],
        SERVICE_WORKER,
    )
        .into_response()
}

pub async fn icon(Path(name): Path<String>) -> Response {
    let encoded = match name.as_str() {
        "icon-192.png" => crate::pwa_icons::ICON_192_PNG_B64,
        "icon-512.png" => crate::pwa_icons::ICON_512_PNG_B64,
        "icon-maskable-512.png" => crate::pwa_icons::ICON_MASKABLE_512_PNG_B64,
        "apple-touch-icon.png" => crate::pwa_icons::APPLE_TOUCH_ICON_PNG_B64,
        _ => return (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    };
    let bytes = decode_base64(encoded);
    (
        [
            (header::CONTENT_TYPE, "image/png"),
            (
                header::CACHE_CONTROL,
                "public, max-age=31536000, immutable",
            ),
        ],
        bytes,
    )
        .into_response()
}

/// Minimal base64 decoder (standard alphabet, `=` padding). The icon PNGs
/// are embedded as base64 text because the GitHub snapshot push only
/// carries UTF-8 text files; the icons are tiny and decoded per request.
fn decode_base64(input: &str) -> Vec<u8> {
    fn value(byte: u8) -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }

    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    for &byte in input.as_bytes() {
        if byte == b'=' {
            break;
        }
        let v = match value(byte) {
            Some(v) => v,
            None => continue,
        };
        acc = (acc << 6) | u32::from(v);
        nbits += 6;
        if nbits >= 8 {
            nbits -= 8;
            out.push((acc >> nbits) as u8);
            acc &= (1 << nbits) - 1;
        }
    }
    out
}
