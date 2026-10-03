use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

pub struct Entry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: u64,
}

/// Absolute-path check: Windows drive (`C:\`), UNC (`\\server\share`) or Unix root.
pub fn is_absolute_path(path: &str) -> bool {
    if path.starts_with('/') {
        return true;
    }
    let bytes = path.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    path.starts_with("\\\\")
}

/// Reject `..` traversal after normalization.
fn normalize(path: &str) -> Result<PathBuf, &'static str> {
    if !is_absolute_path(path) {
        return Err("path must be absolute");
    }
    let mut out = PathBuf::new();
    for component in Path::new(path).components() {
        match component {
            Component::ParentDir => return Err("'..' is not allowed"),
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    if out.as_os_str().is_empty() {
        return Err("empty path");
    }
    Ok(out)
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn list(path: &str) -> Result<(String, Vec<Entry>), String> {
    let normalized = normalize(path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    let read = std::fs::read_dir(&normalized).map_err(|e| format!("cannot read directory: {e}"))?;
    for item in read {
        let item = item.map_err(|e| format!("cannot read entry: {e}"))?;
        let meta = item.metadata().map_err(|e| format!("cannot stat: {e}"))?;
        entries.push(Entry {
            name: item.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
            mtime_ms: modified_ms(&meta),
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok((normalized.to_string_lossy().into_owned(), entries))
}

pub struct Root {
    pub name: String,
    pub path: String,
    /// Filesystem/volume label when the OS exposes one (else None).
    pub label: Option<String>,
}

/// Best-effort volume labels on Windows via one PowerShell call (cached).
/// Returns None when PowerShell is unavailable — labels are optional by design.
#[cfg(windows)]
fn windows_volume_labels() -> Option<std::collections::HashMap<char, String>> {
    use std::process::Command;
    use std::sync::OnceLock;
    static CACHE: OnceLock<Option<std::collections::HashMap<char, String>>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; \
[IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object { \
$_.Name.Substring(0,1) + '|' + $_.VolumeLabel }";
            let output = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .output()
                .ok()?;
            if !output.status.success() {
                return None;
            }
            let text = String::from_utf8_lossy(&output.stdout);
            let mut map = std::collections::HashMap::new();
            for line in text.lines() {
                let mut parts = line.splitn(2, '|');
                let letter = parts.next()?.chars().next()?;
                let label = parts.next().unwrap_or("").trim();
                if !label.is_empty() {
                    map.insert(letter.to_ascii_uppercase(), label.to_string());
                }
            }
            Some(map)
        })
        .clone()
}

pub fn roots() -> Vec<Root> {
    #[cfg(windows)]
    {
        let labels = windows_volume_labels();
        let mut roots: Vec<Root> = ('A'..='Z')
            .filter_map(|letter| {
                let root = format!("{letter}:\\");
                std::fs::metadata(&root).ok().map(|_| Root {
                    name: root.clone(),
                    path: root,
                    label: labels
                        .as_ref()
                        .and_then(|m| m.get(&letter))
                        .cloned(),
                })
            })
            .collect();
        roots.sort_by_key(|r| r.path.clone());
        roots
    }
    #[cfg(not(windows))]
    {
        unix_roots()
    }
}

/// Unix: `/` plus real mounts from /proc/mounts (mounted disks/USB/network),
/// skipping virtual filesystems. Labels: not exposed without extra tools.
#[cfg(not(windows))]
fn unix_roots() -> Vec<Root> {
    use std::collections::HashSet;

    let mut roots = vec![Root {
        name: "/".into(),
        path: "/".into(),
        label: None,
    }];
    let mut seen: HashSet<String> = HashSet::new();
    let virtual_fs: &[&str] = &[
        "proc", "sysfs", "devtmpfs", "devpts", "tmpfs", "cgroup", "cgroup2", "overlay",
        "squashfs", "securityfs", "debugfs", "tracefs", "pstore", "bpf", "mqueue",
        "hugetlbfs", "configfs", "fusectl", "binfmt_misc", "autofs", "rpc_pipefs",
        "nfsd", "efivarfs", "ramfs", "selinuxfs",
    ];
    if let Ok(mounts) = std::fs::read_to_string("/proc/mounts") {
        for line in mounts.lines() {
            let mut parts = line.split_whitespace();
            let _device = parts.next();
            let Some(mount) = parts.next() else { continue };
            let fs = parts.next().unwrap_or("");
            if !mount.starts_with('/') || mount == "/" || virtual_fs.contains(&fs) {
                continue;
            }
            let mount = unescape_mount(mount);
            if seen.insert(mount.clone()) {
                roots.push(Root {
                    name: mount.clone(),
                    path: mount,
                    label: None,
                });
            }
        }
    }
    roots
}

/// /proc/mounts escapes spaces/tabs/backslashes as octal (\040 …).
#[cfg(not(windows))]
fn unescape_mount(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            let digits: String = chars.by_ref().take(3).collect();
            if let Ok(byte) = u8::from_str_radix(&digits, 8) {
                out.push(byte as char);
                continue;
            }
            out.push('\\');
            out.push_str(&digits);
            continue;
        }
        out.push(ch);
    }
    out
}

/// Minimal JSON string escaping (quotes, backslash, control characters).
pub fn json_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

pub fn percent_decode(value: &str) -> Result<String, String> {
    let mut bytes: Vec<u8> = Vec::with_capacity(value.len());
    let raw = value.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        match raw[i] {
            b'%' => {
                if i + 3 > raw.len() {
                    return Err("bad percent escape".to_string());
                }
                let hex = std::str::from_utf8(&raw[i + 1..i + 3]).map_err(|_| "bad percent escape")?;
                let byte = u8::from_str_radix(hex, 16).map_err(|_| "bad percent escape")?;
                bytes.push(byte);
                i += 3;
            }
            b'+' => {
                bytes.push(b' ');
                i += 1;
            }
            b => {
                bytes.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(bytes).map_err(|_| "path is not valid UTF-8".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absolute_path_detection() {
        assert!(is_absolute_path(r"D:\Dev\vol"));
        assert!(is_absolute_path("D:/vol"));
        assert!(is_absolute_path("/home/x"));
        assert!(is_absolute_path(r"\\server\share"));
        assert!(!is_absolute_path("relative/path"));
        assert!(!is_absolute_path("D:vol"));
    }

    #[test]
    fn rejects_dotdot_traversal() {
        assert!(normalize(r"D:\a\..\b").is_err());
        assert!(normalize(r"D:\a\.\b").is_ok());
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(percent_decode("a%20b").unwrap(), "a b");
        assert_eq!(percent_decode("C%3A%5CDev").unwrap(), r"C:\Dev");
        assert_eq!(percent_decode("sp+ace").unwrap(), "sp ace");
        assert_eq!(percent_decode("%E2%9C%93").unwrap(), "✓");
        assert!(percent_decode("%zz").is_err());
        assert!(percent_decode("%2").is_err());
    }

    #[test]
    fn json_escaping() {
        assert_eq!(json_escape("a\"b\\c\nd"), "a\\\"b\\\\c\\nd");
        assert_eq!(json_escape("plain"), "plain");
    }

    #[test]
    fn lists_a_real_directory() {
        let dir = std::env::temp_dir().join(format!("encfs-agent-test-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("file.txt"), b"hi").unwrap();
        let path = dir.to_string_lossy().into_owned();

        let (normalized, entries) = list(&path).unwrap();
        assert_eq!(normalized.to_lowercase(), path.to_lowercase());
        let sub = entries.iter().find(|e| e.name == "sub").expect("sub dir");
        let file = entries.iter().find(|e| e.name == "file.txt").expect("file");
        assert!(sub.is_dir);
        assert!(!file.is_dir);
        assert_eq!(file.size, 2);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn lists_roots() {
        let roots = roots();
        assert!(!roots.is_empty());
    }
}
