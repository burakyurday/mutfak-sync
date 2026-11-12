#!/usr/bin/env bash
set -euo pipefail
cd /workspace/mutfak-drive-yedekleme
export CARGO_HOME=/workspace/.cargo RUSTUP_HOME=/workspace/.rustup
export PATH="$CARGO_HOME/bin:$PATH"
if ! command -v rustup >/dev/null; then
  curl -fsS https://sh.rustup.rs -o /tmp/mutfak-rustup.sh
  sh /tmp/mutfak-rustup.sh -y --profile minimal --default-toolchain 1.99.1 --no-modify-path
fi
rustup toolchain install 1.99.1 --profile minimal --component rustfmt --component clippy
npm ci --cache /workspace/.npm --no-audit --no-fund
npm run sidecar
# Rootless, signature-verified Debian packages. No changes to system directories.
if [ "$(uname -s)" = Linux ] && ! pkg-config --exists webkit2gtk-4.1; then
  . /etc/os-release
  [ "$ID" = debian ] && [ "$VERSION_ID" = 13 ] || { echo 'This cloud sysroot script requires Debian 13.' >&2; exit 1; }
  mkdir -p /workspace/.apt/lists/partial /workspace/.apt/cache/archives/partial /workspace/.apt/sysroot
  cat > /workspace/.apt/sources.list <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
SOURCES
  apt_args=(-o Dir::State::lists=/workspace/.apt/lists -o Dir::Cache=/workspace/.apt/cache -o Dir::Cache::archives=/workspace/.apt/cache/archives -o Dir::Etc::sourcelist=/workspace/.apt/sources.list -o Dir::Etc::sourceparts=- -o APT::Sandbox::User=agent -o Debug::NoLocking=1)
  /usr/bin/apt-get "${apt_args[@]}" update
  /usr/bin/apt-get "${apt_args[@]}" --download-only -y --no-install-recommends install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libdbus-1-dev
  python3 - <<'PY'
import glob,subprocess,pathlib,re
root='/workspace/.apt/sysroot'
for package in glob.glob('/workspace/.apt/cache/archives/*.deb'):
    subprocess.run(['dpkg-deb','-x',package,root],check=True)
pc=pathlib.Path('/workspace/.apt/pkgconfig');pc.mkdir(exist_ok=True)
for package in pathlib.Path(root).rglob('*.pc'):
    text=re.sub(r'(?<=[= ])/(usr|lib)(?=/|\n|$)',lambda m:root+m.group(),package.read_text())
    (pc/package.name).write_text(text)
for p in pathlib.Path(root).rglob('*'):
    if p.is_symlink() and not p.exists():
        target=p.readlink()
        if not target.is_absolute():
            system=pathlib.Path('/')/p.parent.relative_to(root)/target
            if system.exists() and not (p.parent/target).exists():
                (p.parent/target).symlink_to(system)
PY
fi
mkdir -p /workspace/.apt
cat > /workspace/.apt/env.sh <<'ENV'
export CARGO_HOME=/workspace/.cargo
export RUSTUP_HOME=/workspace/.rustup
export PATH=/workspace/.cargo/bin:$PATH
export PKG_CONFIG_PATH=/workspace/.apt/pkgconfig
export LIBRARY_PATH=/workspace/.apt/sysroot/usr/lib/x86_64-linux-gnu
export LD_LIBRARY_PATH=/workspace/.apt/sysroot/usr/lib/x86_64-linux-gnu
ENV
. /workspace/.apt/env.sh
npm run build
npm test
CARGO_BUILD_JOBS=3 cargo test --manifest-path src-tauri/Cargo.toml --locked
CARGO_BUILD_JOBS=3 cargo check --manifest-path src-tauri/Cargo.toml --features desktop --locked
