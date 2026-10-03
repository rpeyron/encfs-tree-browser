use std::io::{Read, Write};
use std::net::TcpStream;

pub struct Request {
    pub method: String,
    pub path: String,
    pub query: String,
    pub host: String,
    pub origin: Option<String>,
}

const MAX_REQUEST: usize = 8 * 1024;

pub fn read_request(stream: &mut TcpStream) -> Result<Request, ()> {
    let mut buf = [0u8; MAX_REQUEST];
    let mut filled = 0usize;
    loop {
        match stream.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => {
                filled += n;
                if filled >= MAX_REQUEST {
                    respond(stream, 431, "text/plain", b"request too large");
                    return Err(());
                }
                if buf[..filled].windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            Err(_) => return Err(()),
        }
    }

    let text = String::from_utf8_lossy(&buf[..filled]);
    let mut lines = text.lines();
    let head = lines.next().ok_or(())?;
    let mut parts = head.split_whitespace();
    let method = parts.next().ok_or(())?.to_string();
    let target = parts.next().ok_or(())?.to_string();
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (target, String::new()),
    };

    let mut host = String::new();
    let mut origin = None;
    for line in lines {
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim();
            match key.as_str() {
                "host" => host = value.to_string(),
                "origin" => origin = Some(value.to_string()),
                _ => {}
            }
        }
    }

    Ok(Request {
        method,
        path,
        query,
        host,
        origin,
    })
}

/// Anti DNS-rebinding: only our own local origins may talk to the agent.
pub fn is_allowed(req: &Request, port: u16) -> bool {
    let allowed_hosts = [format!("127.0.0.1:{port}"), format!("localhost:{port}")];
    if !allowed_hosts.iter().any(|h| *h == req.host) {
        return false;
    }
    match &req.origin {
        None => true,
        Some(origin) => {
            origin.as_str() == "null"
                || origin.as_str() == format!("http://127.0.0.1:{port}")
                || origin.as_str() == format!("http://localhost:{port}")
        }
    }
}

pub fn respond(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    write_response(stream, status, content_type, body, false);
}

/// Same as [`respond`] but marks the body as gzip-compressed.
pub fn respond_gz(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    write_response(stream, status, content_type, body, true);
}

fn write_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8], gzip: bool) {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        431 => "Request Header Fields Too Large",
        _ => "Error",
    };
    let encoding = if gzip { "Content-Encoding: gzip\r\n" } else { "" };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\n{encoding}Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}
