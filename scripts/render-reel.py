"""Render licensed moving footage with the website message and embedded music."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1080, 1920
plan_file = Path(sys.argv[1]).resolve()
plan = json.loads(plan_file.read_text(encoding='utf-8'))
out = plan_file.parent
cache = ROOT / '.private' / 'broll-assets'
cache.mkdir(parents=True, exist_ok=True)
ffmpeg = os.environ.get('FFMPEG_PATH') or shutil.which('ffmpeg')
if not ffmpeg and (ROOT / '.private/python').exists():
    sys.path.insert(0, str(ROOT / '.private/python'))
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
if not ffmpeg:
    raise RuntimeError('Install ffmpeg or set FFMPEG_PATH.')

def checked_asset(info, filename):
    destination = cache / filename
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() == info['sha256']:
        return destination
    with urllib.request.urlopen(info['url'], timeout=120) as response:
        data = response.read(350 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != info['sha256']:
        raise RuntimeError('Licensed media changed. Review the new file before using it.')
    destination.write_bytes(data)
    return destination

video = checked_asset(plan['video'], plan['category'] + '.mp4')
music = checked_asset(plan['music'], plan['music']['filename'])

def font(family, size, weight):
    result = ImageFont.truetype(str(ROOT / 'assets/fonts' / (family + '.ttf')), size)
    try:
        axes = result.get_variation_axes()
        values = [weight if b'Weight' in a['name'] else a['default'] for a in axes]
        result.set_variation_by_axes(values)
    except (OSError, AttributeError):
        pass
    return result

def wrap(text, face, width):
    lines, line = [], ''
    for word in text.split():
        candidate = (line + ' ' + word).strip()
        if face.getlength(candidate) > width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines

def overlay(text, action=False):
    canvas = Image.new('RGBA', (W, H))
    draw = ImageDraw.Draw(canvas)
    # The footage remains visible. Darkening keeps the text readable across frames.
    for y in range(H):
        alpha = int(42 + 85 * math.exp(-((y - 870) / 570) ** 2))
        draw.line((0, y, W, y), fill=(4, 16, 35, alpha))
    brand = font('dmsans', 31, 700)
    draw.text((W / 2, 265), 'POSITIVITY JUICE', font=brand, anchor='mm', fill='#FFF9ED', stroke_width=1, stroke_fill='#0F2E63')
    label = 'ONE SMALL THING' if action else plan['categoryName'].upper()
    label_font = font('dmsans', 29, 700)
    lw = label_font.getlength(label) + 66
    draw.rounded_rectangle((W/2-lw/2, 366, W/2+lw/2, 426), radius=30, fill='#2BA6FA')
    draw.text((W/2, 396), label, font=label_font, anchor='mm', fill='#0F2E63')
    for size in range(86 if not action else 73, 53, -2):
        face = font('fredoka' if not action else 'dmsans', size, 600 if not action else 700)
        lines = wrap(text, face, 850)
        line_height = round(size * 1.22)
        if len(lines) * line_height <= 660:
            break
    else:
        raise RuntimeError('Text is too long for the safe reading area.')
    start_y = 880 - ((len(lines) - 1) * line_height) / 2
    for index, line in enumerate(lines):
        draw.text((W/2, start_y + index * line_height), line, font=face, anchor='mm', fill='#FFF9ED', stroke_width=2, stroke_fill=(5, 21, 46, 160))
    draw.rounded_rectangle((484, 1405, 596, 1413), radius=4, fill='#2BA6FA')
    draw.text((W/2, 1472), 'A little good for your day.', font=font('dmsans', 30, 400), anchor='mm', fill='#FFF9ED', stroke_width=1, stroke_fill='#0F2E63')
    return canvas

overlay(plan['message']).save(out / 'message.png')
overlay(plan['action'], True).save(out / 'action.png')
probe = subprocess.run([ffmpeg, '-hide_banner', '-i', str(video)], capture_output=True, text=True)
match = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe.stderr)
if not match:
    raise RuntimeError('Source video duration unavailable.')
length = int(match[1]) * 3600 + int(match[2]) * 60 + float(match[3])
duration = plan['duration']
stretch = max(1, duration / max(1, length - 0.1))
filters = (
    f'[0:v]setpts={stretch:.5f}*PTS,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[bg];'
    '[bg][1:v]overlay=0:0:enable=lt(t\\,9)[first];'
    '[first][2:v]overlay=0:0:enable=gte(t\\,9)[final]'
)
output = out / 'reel.mp4'
subprocess.run([
    ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(video),
    '-loop', '1', '-i', str(out / 'message.png'), '-loop', '1', '-i', str(out / 'action.png'),
    '-ss', '12', '-i', str(music), '-filter_complex', filters, '-map', '[final]', '-map', '3:a:0',
    '-af', f'loudnorm=I=-18:TP=-2:LRA=7,afade=t=in:st=0:d=0.4,afade=t=out:st={duration-1}:d=1',
    '-t', str(duration), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', str(output)
], check=True)
frames = []
for moment in [2, 7, 12]:
    frame = out / f'frame-{moment}.jpg'
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(moment), '-i', str(output), '-frames:v', '1', str(frame)], check=True)
    frames.append(Image.open(frame).convert('RGB'))
if frames[0].tobytes() == frames[1].tobytes():
    raise RuntimeError('The background is not moving.')
sheet = Image.new('RGB', (810, 480))
for index, frame in enumerate(frames):
    sheet.paste(frame.resize((270, 480)), (270 * index, 0))
sheet.save(out / 'storyboard.jpg')
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(output), '-f', 'null', '-'], check=True)
(out / 'render.json').write_text(json.dumps({'width': W, 'height': H, 'seconds': duration, 'audio': True, 'movingFootage': True, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}, indent=2))
print(f"Rendered {plan['categoryName']}: {output}")
