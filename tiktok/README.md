# Daily Georgian TikTok videos

Every morning at **~07:20 Tbilisi time**, GitHub Actions makes one vertical video (15-30 s, Georgian voice plus big Georgian captions) and sends it to your **Telegram** before 08:00. You post it in TikTok yourself (about 30 seconds).

```
Claude writes the script -> Azure Georgian voice -> AI image per scene -> ffmpeg 1080x1920 MP4 -> Telegram
```

## Experiment: find what works
Each day the pipeline tests a different **niche x visual style** combination. The least-tested combination goes first, and the voice alternates between Eka and Giorgi.

| Niches | Styles |
|---|---|
| business, facts, georgia, psychology, money, motivation | photo (realistic AI images), illustration (3D cartoon), text (bold text on gradients) |

That makes 18 combinations, so every one has been tried after about 3 weeks. To measure the results:
1. Each video has an ID such as `V007`, shown in the Telegram message.
2. About 48 hours after posting, add a line to `data/results.csv`:
   `V007,2026-11-20,1520,130,12,4,9` (id, date, views, likes, comments, shares, saves)
3. Run `python analyze.py` to see the averages per niche, style and voice.
4. When there's a winner, set the repo variables `LOCK_NICHE` and/or `LOCK_STYLE` (Settings, then Secrets and variables, then Actions, then **Variables**). From then on every video uses that niche and style.

## One-time setup
Go to GitHub repo **Settings, then Secrets and variables, then Actions, then New repository secret**:

| Secret | Where to get it | Needed? |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | In Telegram, message **@BotFather**, send `/newbot`, and copy the token | yes |
| `TELEGRAM_CHAT_ID` | Send any message to your new bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": ...}` | yes |
| `ANTHROPIC_API_KEY` | console.anthropic.com, then API keys | yes (otherwise the same demo video every day) |
| `AZURE_SPEECH_KEY` | portal.azure.com, then create a **Speech** resource (free F0 tier), then Keys | recommended (without it the video has no voice) |
| `OPENAI_API_KEY` | platform.openai.com, then API keys | optional (without it photo and illustration fall back to text style) |

Variable (not secret): `AZURE_SPEECH_REGION`, the region of your Speech resource (default `westeurope`).

**Test it:** open the Actions tab, then **Daily TikTok video**, then **Run workflow**. A video arrives in Telegram within about 10 minutes.

## Tips when posting
- Add a **trending sound** in TikTok at low volume. This usually gives a big reach boost.
- Post at the same time every day. In Georgia, 12:00-14:00 or 19:00-22:00 usually work best.
- Copy the caption from the last Telegram message.

## Run locally
```bash
pip install -r requirements.txt   # needs ffmpeg installed
python generate.py --niche facts --style text --no-send
```

Font: Noto Sans Georgian and Noto Sans (SIL Open Font License, `assets/fonts/OFL.txt`).
Background music: put royalty-free `.mp3` files in `assets/music/` and they are mixed in quietly.
