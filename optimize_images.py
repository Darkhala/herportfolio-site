"""
Shrinks your pose images for fast loading. Backgrounds are kept as they are.
  ./images/*.png  ->  ./images/web/*.webp   (same names, much smaller files)

Setup (once):   pip install pillow
Run (from the project folder, the one containing index.html):
                python optimize_images.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("images")
OUT = SRC / "web"
WIDTH = 900      # px. The head shows at ~600px max, so 900 stays sharp on retina
QUALITY = 78     # WebP quality 1-100 (70-85 is the sweet spot)

OUT.mkdir(exist_ok=True)
files = sorted(p for p in SRC.iterdir() if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
if not files:
    raise SystemExit("No images found in ./images")

before_total = after_total = 0
for p in files:
    img = Image.open(p).convert("RGB")
    if img.width > WIDTH:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    out = OUT / f"{p.stem}.webp"
    img.save(out, "WEBP", quality=QUALITY, method=6)
    b, a = p.stat().st_size, out.stat().st_size
    before_total += b; after_total += a
    print(f"{p.name:20} {b/1024:6.0f} KB -> {a/1024:4.0f} KB")

print(f"\nTotal: {before_total/1024/1024:.1f} MB -> {after_total/1024/1024:.2f} MB")
print("Done. Hard-refresh the site (Ctrl+Shift+R).")
