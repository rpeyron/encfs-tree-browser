// No console window in release builds on Windows; `cargo run` keeps one for dev.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod fs;
mod http;

use http::{is_allowed, read_request, respond, respond_gz};
use std::fs::OpenOptions;
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The app is embedded gzipped; served with `Content-Encoding: gzip` (the browser
/// inflates natively â€” keeps the binary small, zero runtime cost).
const APP_HTML_GZ: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/encfs-browser.html.gz"));
const FAVICON: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/favicon.svg"));
const PORT_RANGE: std::ops::RangeInclusive<u16> = 8765..=8785;
const VERSION: &str = env!("CARGO_PKG_VERSION");

/// UTC timestamp without a time crate (civil-from-days, Hinnant algorithm).
fn now_utc() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (days, rem) = (secs / 86_400, secs % 86_400);
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn log(message: &str) {
    let line = format!("{}\t{message}\n", now_utc());
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let _ = append(&dir.join("agent.log"), line.as_bytes());
        }
    }
    // Visible when running from a terminal (dev / console-enabled builds).
    println!("{message}");
}

fn append(path: &PathBuf, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(bytes)
}

fn bind() -> std::io::Result<(TcpListener, u16)> {
    for port in PORT_RANGE {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => return Ok((listener, port)),
            Err(e) => log(&format!("port {port} unavailable: {e}")),
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AddrInUse,
        "no free port in 8765-8785",
    ))
}

fn main() {
    let (listener, port) = match bind() {
        Ok(v) => v,
        Err(e) => {
            log(&format!("failed to bind: {e}"));
            std::process::exit(1);
        }
    };
    let url = format!("http://127.0.0.1:{port}/");
    log(&format!("encfs-agent {VERSION} listening on {url}"));

    // Open the default browser; log the URL for console-less (release) runs.
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(250));
        open_browser(&url);
    });

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let port = port;
                thread::spawn(move || serve(stream, port));
            }
            Err(e) => log(&format!("accept error: {e}")),
        }
    }
}

fn open_browser(url: &str) {
    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .args(["/C", "start", "", url])
        .status();
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url).status();

    match status {
        Ok(s) if s.success() => log(&format!("browser opened: {url}")),
        Ok(s) => log(&format!("browser start failed (exit {s}): open {url} manually")),
        Err(e) => log(&format!("browser start error: {e}; open {url} manually")),
    }
}

fn serve(mut stream: TcpStream, port: u16) {
    let request = match read_request(&mut stream) {
        Ok(req) => req,
        Err(()) => return,
    };
    if request.method != "GET" {
        respond(&mut stream, 405, "text/plain", b"method not allowed");
        return;
    }
    if !is_allowed(&request, port) {
        respond(&mut stream, 403, "text/plain", b"forbidden origin/host");
        return;
    }

    match request.path.as_str() {
        "/" => respond_gz(&mut stream, 200, "text/html; charset=utf-8", APP_HTML_GZ),
        "/favicon.svg" => respond(&mut stream, 200, "image/svg+xml", FAVICON),
        "/api/health" => {
            let body = format!("{{\"ok\":true,\"name\":\"encfs-agent\",\"version\":\"{VERSION}\"}}");
            respond(&mut stream, 200, "application/json", body.as_bytes());
        }
        // Graceful local stop: curl http://127.0.0.1:8765/api/shutdown
        "/api/shutdown" => {
            respond(&mut stream, 200, "application/json", br#"{"ok":true}"#);
            log("shutdown requested (/api/shutdown)");
            // give the client time to receive the response before the process dies
            std::thread::sleep(std::time::Duration::from_millis(80));
            std::process::exit(0);
        }
        "/api/roots" => {
            let roots = fs::roots();
            let items: Vec<String> = roots
                .iter()
                .map(|r| {
                    let label = match &r.label {
                        Some(l) => format!("\"{}\"", fs::json_escape(l)),
                        None => "null".to_string(),
                    };
                    format!(
                        "{{\"name\":\"{}\",\"path\":\"{}\",\"label\":{}}}",
                        fs::json_escape(&r.name),
                        fs::json_escape(&r.path),
                        label
                    )
                })
                .collect();
            let body = format!("{{\"roots\":[{}]}}", items.join(","));
            respond(&mut stream, 200, "application/json", body.as_bytes());
        }
        "/api/list" => match query_param(&request.query, "path") {
            None => respond(
                &mut stream,
                400,
                "application/json",
                br#"{"error":"missing path"}"#,
            ),
            Some(raw) => match fs::percent_decode(&raw) {
                Err(e) => {
                    let body = format!("{{\"error\":\"{}\"}}", fs::json_escape(&e));
                    respond(&mut stream, 400, "application/json", body.as_bytes());
                }
                Ok(path) => match fs::list(&path) {
                    Err(e) => {
                        let body = format!("{{\"error\":\"{}\"}}", fs::json_escape(&e));
                        respond(&mut stream, 404, "application/json", body.as_bytes());
                    }
                    Ok((normalized, entries)) => {
                        let items: Vec<String> = entries
                            .iter()
                            .map(|entry| {
                                format!(
                                    "{{\"name\":\"{}\",\"isDir\":{},\"size\":{},\"mtime\":{}}}",
                                    fs::json_escape(&entry.name),
                                    entry.is_dir,
                                    entry.size,
                                    entry.mtime_ms
                                )
                            })
                            .collect();
                        let body = format!(
                            "{{\"path\":\"{}\",\"entries\":[{}]}}",
                            fs::json_escape(&normalized),
                            items.join(",")
                        );
                        respond(&mut stream, 200, "application/json", body.as_bytes());
                    }
                },
            },
        },
        _ => respond(
            &mut stream,
            404,
            "application/json",
            br#"{"error":"not found"}"#,
        ),
    }
}

fn query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then_some(v)
    })
}
