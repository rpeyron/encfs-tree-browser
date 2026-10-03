use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;

/// Embeds the standalone app built by `npm run build:standalone`.
/// The html is stored gzipped (`Content-Encoding: gzip` when served), which keeps
/// the binary small; flate2 is a build-dependency only and is not linked into the
/// final executable.
fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let html_src = manifest.join("../dist-standalone/encfs-browser.html");
    let icon_src = manifest.join("../dist-standalone/favicon.svg");
    println!("cargo:rerun-if-changed={}", html_src.display());
    println!("cargo:rerun-if-changed={}", icon_src.display());

    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap());

    if !html_src.exists() {
        panic!(
            "{} not found — run `npm run build:standalone` in encfs-tree-browser first",
            html_src.display()
        );
    }
    let raw = fs::read(&html_src).unwrap_or_else(|e| panic!("cannot read {}: {e}", html_src.display()));
    let gz_path = out.join("encfs-browser.html.gz");
    let gz_file = File::create(&gz_path).expect("cannot create embedded html.gz");
    let mut encoder = flate2::write::GzEncoder::new(gz_file, flate2::Compression::best());
    encoder.write_all(&raw).expect("gzip failed");
    encoder.finish().expect("gzip finish failed");

    if !icon_src.exists() {
        panic!(
            "{} not found — run `npm run build:standalone` in encfs-tree-browser first",
            icon_src.display()
        );
    }
    fs::copy(&icon_src, out.join("favicon.svg")).unwrap_or_else(|e| {
        panic!("failed to copy {} into OUT_DIR: {e}", icon_src.display());
    });

    // Windows exe resource: same design as the favicon (see make-icon.mjs).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let icon = manifest.join("icon.ico");
        println!("cargo:rerun-if-changed={}", icon.display());
        if icon.exists() {
            let mut res = winresource::WindowsResource::new();
            res.set_icon(icon.to_str().expect("icon path"));
            res.compile().expect("failed to embed icon.ico");
        }
    }
}
