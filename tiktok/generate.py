"""Daily Georgian TikTok video generator.

Steps: pick experiment -> Claude writes script -> Azure voice per scene ->
AI image per scene -> ffmpeg builds a 1080x1920 MP4 -> Telegram delivery.

Every external service is optional so the pipeline never fully fails:
  no ANTHROPIC_API_KEY  -> built-in demo script
  no AZURE_SPEECH_KEY   -> silent video (add a trending sound in TikTok)
  no OPENAI_API_KEY     -> gradient backgrounds instead of AI images
  no TELEGRAM_*         -> video is only saved to output/ (and the GitHub run)

Usage: python generate.py [--niche facts] [--style photo] [--no-send]
"""

import argparse
import base64
import datetime as dt
import json
import os
import random
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import experiments as ex

ROOT = Path(__file__).parent
FONT = str(ROOT / "assets/fonts/NotoSansGeorgian-ExtraBold.ttf")
HISTORY = ROOT / "data/history.json"
OUT = ROOT / "output"
W, H, FPS = 1080, 1920, 30
TBILISI = dt.timezone(dt.timedelta(hours=4))


def log(msg):
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


# ---------------------------------------------------------------- experiment

def pick_experiment(history, niche=None, style=None):
    niche = niche or os.getenv("LOCK_NICHE") or ex.LOCK_NICHE
    style = style or os.getenv("LOCK_STYLE") or ex.LOCK_STYLE
    counts = {}
    for h in history:
        counts[(h["niche"], h["style"])] = counts.get((h["niche"], h["style"]), 0) + 1
    styles = ex.STYLES if os.getenv("OPENAI_API_KEY") else ["text"]  # no image key -> text only
    combos = [(n, s) for n in ex.NICHES for s in styles
              if (not niche or n == niche) and (not style or s == style)]
    if not combos:
        sys.exit(f"Unknown niche/style: {niche}/{style}")
    least = min(counts.get(c, 0) for c in combos)
    n, s = random.choice([c for c in combos if counts.get(c, 0) == least])
    # balance voices too
    vcount = {v: sum(1 for h in history if h.get("voice") == v) for v in ex.VOICES}
    voice = min(ex.VOICES, key=lambda v: (vcount[v], random.random()))
    return n, s, voice


# -------------------------------------------------------------------- script

SYSTEM = """შენ ხარ ქართული TikTok-ის ვირუსული კონტენტის სცენარისტი.
You write short vertical-video scripts in natural, modern, spoken Georgian (never sounds translated).

Rules for a script that gets watched to the end:
- Total voiceover 35-65 words, so the video is 15-30 seconds.
- 5-7 scenes. Scene 1 is the HOOK: a shocking claim, question or "you're doing X wrong" in under 10 words that stops the scroll.
- Every scene must add a new surprising detail; no filler, no greetings, no "ამ ვიდეოში".
- Last scene: a punchy payoff plus a call to action that drives comments (a question to the viewer) or follows/saves.
- on_screen: 2-6 word Georgian caption shown big on screen (the key words of that scene). No emoji.
- image_prompt: English prompt for an image generator describing the scene visually; no text, letters or logos in the image; a concrete subject, not abstract.
- Facts must be true and checkable. Do not invent statistics.
- caption: TikTok caption in Georgian, max 120 characters, curiosity-driven.
- hashtags: 4-6 hashtags mixing Georgian and broad ones (e.g. #საქართველო #fyp).
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "narration": {"type": "string"},
                    "on_screen": {"type": "string"},
                    "image_prompt": {"type": "string"},
                },
                "required": ["narration", "on_screen", "image_prompt"],
                "additionalProperties": False,
            },
        },
        "caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "scenes", "caption", "hashtags"],
    "additionalProperties": False,
}

DEMO_SCRIPT = {
    "title": "თაფლი არასდროს ფუჭდება",
    "scenes": [
        {"narration": "იცოდი, რომ არსებობს საკვები, რომელიც არასდროს ფუჭდება?", "on_screen": "არასდროს ფუჭდება", "image_prompt": "a glowing jar of golden honey on a dark wooden table"},
        {"narration": "ეგვიპტის პირამიდებში არქეოლოგებმა ათასობით წლის თაფლი იპოვეს.", "on_screen": "3000 წლის თაფლი", "image_prompt": "archaeologists discovering ancient clay jars inside an Egyptian tomb"},
        {"narration": "და ის დღესაც ჭამის ვარგისი იყო!", "on_screen": "დღესაც ვარგისია!", "image_prompt": "a spoon dripping golden honey in warm light"},
        {"narration": "საიდუმლო ისაა, რომ თაფლში თითქმის არ არის წყალი და ბაქტერიები ვერ ცოცხლობენ.", "on_screen": "ბაქტერიები ვერ ძლებენ", "image_prompt": "macro shot of honey texture with tiny air bubbles"},
        {"narration": "ქართული თაფლი კი მსოფლიოში ერთ-ერთ უძველესად ითვლება. შენ რომელი თაფლი გიყვარს? დაწერე კომენტარში!", "on_screen": "შენ რომელი გიყვარს?", "image_prompt": "Georgian mountain village with beehives on a green slope at sunset"},
    ],
    "caption": "ეს საკვები 3000 წელიც კი ძლებს 🍯 გამოიცანი რომელი?",
    "hashtags": ["#ფაქტები", "#საქართველო", "#თაფლი", "#fyp", "#იცოდით"],
}


def write_script(niche, style, history):
    if not os.getenv("ANTHROPIC_API_KEY"):
        log("No ANTHROPIC_API_KEY - using demo script")
        return DEMO_SCRIPT
    import anthropic

    recent = [h["title"] for h in history[-60:]]
    user = (
        f"თემა/ნიშა: {ex.NICHES[niche]}\n"
        f"Visual style of the video: {style}"
        + (" (text-only video: on_screen captions carry the story, make them extra punchy)" if style == "text" else "")
        + f"\nToday is {dt.date.today():%Y-%m-%d}.\n"
        f"Do NOT repeat any of these previous topics: {json.dumps(recent, ensure_ascii=False)}\n"
        "Write one new video script."
    )
    client = anthropic.Anthropic()
    resp = client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError(f"Claude declined the script request: {resp.stop_details}")
    text = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text)


# --------------------------------------------------------------------- voice

def tts(text, voice, path):
    key, region = os.getenv("AZURE_SPEECH_KEY"), os.getenv("AZURE_SPEECH_REGION", "westeurope")
    if not key:
        return False
    ssml = (
        "<speak version='1.0' xml:lang='ka-GE'>"
        f"<voice name='{voice}'><prosody rate='+12%'>{escape_xml(text)}</prosody></voice></speak>"
    )
    r = requests.post(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
            "User-Agent": "tiktok-generator",
        },
        data=ssml.encode("utf-8"),
        timeout=60,
    )
    r.raise_for_status()
    path.write_bytes(r.content)
    return True


def escape_xml(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip())


# -------------------------------------------------------------------- images

PALETTES = [
    ((255, 61, 104), (255, 179, 71)), ((58, 123, 213), (0, 210, 255)),
    ((131, 58, 180), (253, 29, 29)), ((17, 153, 142), (56, 239, 125)),
    ((252, 70, 107), (63, 94, 251)), ((15, 32, 39), (44, 83, 100)),
]


def gradient(path, seed):
    a, b = PALETTES[seed % len(PALETTES)]
    small = Image.new("RGB", (8, 64))
    small.putdata([tuple(int(a[i] + (b[i] - a[i]) * (y / 63 * 0.75 + x / 7 * 0.25)) for i in range(3))
                   for y in range(64) for x in range(8)])
    small.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30)).save(path)


def ai_image(prompt, style_desc, path):
    key = os.getenv("OPENAI_API_KEY")
    if not key or style_desc is None:
        return False
    r = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1"),
            "prompt": f"{prompt}. Style: {style_desc}. No text, no letters, no watermark.",
            "size": "1024x1536",
            "quality": os.getenv("OPENAI_IMAGE_QUALITY", "medium"),
            "n": 1,
        },
        timeout=300,
    )
    r.raise_for_status()
    path.write_bytes(base64.b64decode(r.json()["data"][0]["b64_json"]))
    return True


# ------------------------------------------------------------------ captions

NOT_DRAWABLE = re.compile(r"[^\u0020-\u024F\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F\u2000-\u206F\u20BE]")


def caption_png(text, path, style, first):
    """Big bold TikTok-style caption on a transparent 1080x1920 layer."""
    text = " ".join(NOT_DRAWABLE.sub("", text).split())  # font has no emoji glyphs
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    size = 120 if style == "text" else (92 if first else 80)
    max_w = W - 160
    while True:
        font = ImageFont.truetype(FONT, size)
        lines = wrap(text, font, max_w, d)
        if len(lines) <= (5 if style == "text" else 3) or size < 50:
            break
        size -= 6
    lh = int(size * 1.3)
    total = lh * len(lines)
    # text style: centered; image styles: upper-middle, clear of TikTok UI at the bottom
    top = (H - total) // 2 if style == "text" else int(H * 0.58)
    color = (255, 230, 0) if first else (255, 255, 255)
    if style != "text":
        box = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(box).rounded_rectangle(
            (50, top - 30, W - 50, top + total + 20), radius=40, fill=(0, 0, 0, 130))
        img = Image.alpha_composite(img, box)
        d = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        w = d.textlength(line, font=font)
        d.text(((W - w) / 2, top + i * lh), line, font=font, fill=color,
               stroke_width=max(4, size // 14), stroke_fill=(0, 0, 0))
    img.save(path)


def wrap(text, font, max_w, d):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# --------------------------------------------------------------------- video

def scene_clip(i, bg, cap, audio, dur, out, style):
    frames = int(dur * FPS)
    zoom_in = i % 2 == 0
    z = f"min(1+{0.15 / frames:.6f}*on,1.15)" if zoom_in else f"max(1.15-{0.15 / frames:.6f}*on,1)"
    # cover-crop to 9:16 at 2x for smooth zoom, then Ken Burns zoom
    vf = (
        f"[0:v]scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},"
        f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}[bg];"
        f"[1:v]format=rgba,fade=in:st=0:d=0.25:alpha=1[cap];"
        f"[bg][cap]overlay=0:0:format=auto,format=yuv420p[v]"
    )
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(bg), "-loop", "1", "-t", f"{dur:.3f}", "-i", str(cap)]
    if audio:
        cmd += ["-i", str(audio)]
    else:
        cmd += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=24000:cl=mono"]
    cmd += ["-filter_complex", vf, "-map", "[v]", "-map", "2:a", "-t", f"{dur:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", str(FPS),
            "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", str(out)]
    subprocess.run(cmd, check=True)


def concat(clips, out, work):
    lst = work / "list.txt"
    lst.write_text("".join(f"file '{c.resolve()}'\n" for c in clips))
    raw = work / "joined.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-c", "copy", str(raw)], check=True)
    music = sorted((ROOT / "assets/music").glob("*.mp3"))
    if music:
        track = random.choice(music)
        log(f"Adding background music: {track.name}")
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-stream_loop", "-1", "-i", str(track),
            "-filter_complex", "[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]",
            "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", str(out)], check=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-c", "copy",
                        "-movflags", "+faststart", str(out)], check=True)


# ------------------------------------------------------------------ telegram

def send_telegram(video, info_text, caption):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat):
        log("No Telegram credentials - skipping delivery")
        return False
    base = f"https://api.telegram.org/bot{token}"
    requests.post(f"{base}/sendMessage", data={"chat_id": chat, "text": info_text}, timeout=60).raise_for_status()
    with open(video, "rb") as f:
        r = requests.post(f"{base}/sendVideo", data={
            "chat_id": chat, "caption": caption[:1024], "supports_streaming": "true",
            "width": W, "height": H,
        }, files={"video": f}, timeout=300)
    r.raise_for_status()
    # caption again as plain message so it is one tap to copy
    requests.post(f"{base}/sendMessage", data={"chat_id": chat, "text": caption}, timeout=60).raise_for_status()
    return True


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--niche", choices=list(ex.NICHES))
    ap.add_argument("--style", choices=list(ex.STYLES))
    ap.add_argument("--no-send", action="store_true")
    args = ap.parse_args()

    history = json.loads(HISTORY.read_text())
    niche, style, voice = pick_experiment(history, args.niche, args.style)
    vid = f"V{len(history) + 1:03d}"
    today = dt.datetime.now(TBILISI).date().isoformat()
    log(f"{vid}: niche={niche} style={style} voice={voice}")

    work = OUT / f"{today}_{vid}"
    work.mkdir(parents=True, exist_ok=True)

    script = write_script(niche, style, history)
    (work / "script.json").write_text(json.dumps(script, ensure_ascii=False, indent=2))
    log(f"Script: {script['title']} ({len(script['scenes'])} scenes)")

    clips, has_voice, has_images = [], False, False
    for i, sc in enumerate(script["scenes"]):
        audio = work / f"a{i}.mp3"
        if tts(sc["narration"], voice, audio):
            has_voice = True
            dur = duration(audio) + 0.25
        else:
            audio = None
            dur = max(2.2, min(4.5, len(sc["on_screen"]) * 0.18 + 1.5))
        bg = work / f"bg{i}.png"
        try:
            got = ai_image(sc["image_prompt"], ex.STYLES[style], bg)
        except requests.RequestException as e:
            log(f"Image generation failed for scene {i}: {e} - using gradient")
            got = False
        if got:
            has_images = True
        else:
            gradient(bg, i + len(history))
        cap = work / f"cap{i}.png"
        caption_png(sc["on_screen"], cap, style if got or style == "text" else "text", i == 0)
        clip = work / f"clip{i}.mp4"
        scene_clip(i, bg, cap, audio, dur, clip, style)
        clips.append(clip)
        log(f"  scene {i + 1}: {dur:.1f}s  {sc['on_screen']}")

    final = OUT / f"{today}_{vid}.mp4"
    concat(clips, final, work)
    total = duration(final)
    log(f"Video ready: {final} ({total:.1f}s)")

    tags = " ".join(script["hashtags"])
    caption = f"{script['caption']}\n\n{tags}"
    info = (
        f"🎬 {vid} | {today}\n"
        f"თემა: {niche} | სტილი: {style} | ხმა: {voice.split('-')[2].replace('Neural', '')}\n"
        f"სათაური: {script['title']}\n"
        f"ხანგრძლივობა: {total:.0f} წმ"
        + ("" if has_voice else "\n🔇 ხმის გარეშე - დაამატე ტრენდული მუსიკა TikTok-ში")
        + "\n\n📊 24 საათის შემდეგ ჩაწერე ნახვები data/results.csv-ში (ID: " + vid + ")"
    )
    sent = False if args.no_send else send_telegram(final, info, caption)

    history.append({
        "id": vid, "date": today, "niche": niche, "style": style if has_images or style == "text" else "text", "voice": voice if has_voice else None,
        "title": script["title"], "caption": script["caption"], "hashtags": script["hashtags"],
        "ai_images": has_images, "seconds": round(total, 1), "sent": sent,
    })
    HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n")
    log("Done")


if __name__ == "__main__":
    main()
