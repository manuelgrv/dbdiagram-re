"""Download an official package for static comparison, without installing it."""
from pathlib import Path
import argparse
import gzip
import hashlib
import io
import json
import re
import urllib.request
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("version", help="Exact Marketplace version, for example 0.5.3")
args = parser.parse_args()
if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
    parser.error("Use an exact numeric version")
base = Path(__file__).resolve().parents[1] / "artifacts" / "reference" / args.version
url = f"https://marketplace.visualstudio.com/_apis/public/gallery/publishers/dbdiagram/vsextensions/dbdiagram-vscode/{args.version}/vspackage"
with urllib.request.urlopen(url, timeout=45) as response:
    data = response.read(40_000_001)
if len(data) > 40_000_000:
    raise ValueError("Package exceeds expected download limit")
if data[:2] == b"\x1f\x8b":
    data = gzip.decompress(data)
archive = zipfile.ZipFile(io.BytesIO(data))
files = [entry for entry in archive.infolist() if entry.filename.startswith("extension/") and not entry.is_dir()]
if sum(entry.file_size for entry in files) > 120_000_000:
    raise ValueError("Archive exceeds expected extraction limit")
for entry in files:
    dest = (base / entry.filename).resolve()
    if not dest.is_relative_to(base.resolve()):
        raise ValueError("Invalid archive path")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(archive.read(entry))
metadata = {"version": args.version, "url": url, "vsix_sha256": hashlib.sha256(data).hexdigest(), "extracted_files": len(files)}
(base / "download.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps(metadata, indent=2))
