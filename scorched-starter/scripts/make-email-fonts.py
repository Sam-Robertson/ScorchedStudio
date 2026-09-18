# Converts the brand fonts to woff2 for use in email.
#
# The site's fonts are .otf, served through next/font. Email needs its own copy:
# a mail client fetches the file directly from a URL, and woff2 is the format
# every client that supports web fonts at all understands.
#
# Only the faces an email actually uses are converted. Gmail strips @font-face
# entirely, so most recipients never download any of this and fall back to the
# stack declared alongside it.
#
#   python3 scripts/make-email-fonts.py
from fontTools.ttLib import TTFont
import os

FACES = [
    "VulfSans-Regular",
    "VulfSans-Bold",
    "VulfSans-Italic",
    "VulfMono-Regular",
    "VulfMono-Bold",
]

os.makedirs("public/email/fonts", exist_ok=True)

for name in FACES:
    src = f"public/fonts/{name}.otf"
    dst = f"public/email/fonts/{name}.woff2"
    font = TTFont(src)
    font.flavor = "woff2"
    font.save(dst)
    before = os.path.getsize(src)
    after = os.path.getsize(dst)
    print(f"{name}: {before // 1024}KB otf -> {after // 1024}KB woff2")
