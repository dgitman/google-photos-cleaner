# Google Photos Cleaner

A tool for deleting all Google Photos images and videos that aren't in any album. It parses a Google Takeout export to determine which files belong to albums and which don't, then uses a Chrome extension to archive album photos — leaving only unalbummed photos visible in Google Photos so they can be mass-selected and deleted.

## How it works

1. **Export from Google Takeout** — Request a Takeout export of your Google Photos library. Each photo and video in the export includes a JSON metadata file that records which album (if any) it belongs to.

2. **Parse the export** — `find_unalbummed_takeout.py` scans the Takeout `.tgz` archives and reads the metadata to determine which files are in albums and which aren't. It produces two CSVs in `data/`:
   - `albummed_takeout.csv` — photos/videos in at least one album
   - `unalbummed_takeout.csv` — photos/videos not in any album

3. **Archive album photos** — Load `albummed_takeout.csv` into the Chrome extension (`chrome-extension/`) and click **Archive All**. This hides all your album photos from the main Google Photos view, leaving only unalbummed photos visible.

4. **Mass delete** — In Google Photos main view, select all visible photos and delete them. Since only unalbummed photos are visible, nothing in an album is touched.

5. **Unarchive** — Load `albummed_takeout.csv` into the extension again and click **Unarchive All** to restore your album photos to the main view.

## Setup

### 1. Restore credentials

`credentials.json` is stored in 1Password. Retrieve it with:

```bash
op document get "Google Photos Cleaner - credentials.json" --out-file credentials.json
```

### 2. Install dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install google-auth google-auth-oauthlib google-api-python-client
```

### 3. Run the parser

Place your Takeout `.tgz` files in `~/Downloads`, then:

```bash
python find_unalbummed_takeout.py
```

CSVs are written to `data/`.

### 4. Load the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-extension/` folder

## Notes

- `credentials.json` and `data/` are excluded from git (personal data)
- Photos deleted via the bulk-delete step go to Trash and are recoverable for 60 days

---

Built with ❤️ for Emalie
