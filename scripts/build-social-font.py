"""Give the bundled Noto Sans Thai variable font a private image-rendering name.

Sharp/Pango otherwise silently substitutes an OS font when a family is missing.
The glyphs and weight axes are unchanged; only name records and checksums change.
"""

from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / "assets/fonts/NotoSansThai.ttf"
output = ROOT / "assets/fonts/SocialNotoSansThai.ttf"
font = bytearray(source.read_bytes())
tables = {}
for index in range(struct.unpack_from(">H", font, 4)[0]):
    record = 12 + index * 16
    tag, _, offset, length = struct.unpack_from(">4sIII", font, record)
    tables[tag.decode("ascii")] = (record, offset, length)

record, offset, length = tables["name"]
_, count, string_offset = struct.unpack_from(">HHH", font, offset)
for index in range(count):
    name_record = offset + 6 + index * 12
    platform, _, _, name_id, size, relative = struct.unpack_from(">HHHHHH", font, name_record)
    if name_id not in (1, 4, 6):
        continue
    start = offset + string_offset + relative
    encoding = "utf-16-be" if platform in (0, 3) else "latin-1"
    original = bytes(font[start:start + size]).decode(encoding)
    renamed = original.replace("Noto Sans Thai", "KB Outage Thai").replace("NotoSansThai", "KBOutageThai")
    encoded = renamed.encode(encoding)
    if len(encoded) != size:
        raise ValueError(f"Font name length changed: {original!r}")
    font[start:start + size] = encoded


def checksum(value: bytes) -> int:
    value += bytes(-len(value) % 4)
    return sum(struct.unpack(f">{len(value) // 4}I", value)) & 0xFFFFFFFF


struct.pack_into(">I", font, record + 4, checksum(bytes(font[offset:offset + length])))
head = tables["head"][1]
struct.pack_into(">I", font, head + 8, 0)
struct.pack_into(">I", font, head + 8, (0xB1B0AFBA - checksum(bytes(font))) & 0xFFFFFFFF)
output.write_bytes(font)
print(output)
