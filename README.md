# Emotion labeling task — GitHub Pages + Google Apps Script

A five-tweet annotation task over the [dair-ai/emotion](https://huggingface.co/datasets/dair-ai/emotion) dataset (Saravia et al., 2018). The interface is a static site on GitHub Pages; the backend is an Apps Script web app that writes every label into a Google Sheet and a JSON backup file in your Google Drive.

## Folder structure

```
emotion-labeling/              ← the GitHub repo
├── docs/                      ← GitHub Pages serves this folder
│   ├── index.html             the participant interface
│   ├── config.js              your Apps Script URL (edit this)
│   └── tweets.js              the tweet pool (generated)
├── apps-script/
│   └── Code.gs                backend — paste into the Apps Script editor
├── build_dataset.py           samples tweets from dair-ai/emotion
├── task_dataset.json          the same pool as JSON, for your write-up
├── .gitignore
└── README.md
```

Only `docs/` is published. `apps-script/Code.gs` lives in the repo for version control — it doesn't run from GitHub, you paste it into Apps Script.

## Why not call the Drive API straight from the page?

A static site has no server to hold a secret. Calling the Drive REST API from the browser would mean either shipping a credential in public JavaScript, or making every participant sign in to Google and grant access to *their* Drive — which is not where you want the data. The Apps Script web app solves both: it executes under your account with your Drive permissions, and participants just POST to a URL anonymously. It's Google's supported path for exactly this.

---

## Step 1 — Put the real dataset in

`docs/tweets.js` ships with 60 stand-in tweets so the page works immediately. They are **not** from the dataset. Replace them:

```bash
pip install datasets
python build_dataset.py        # 10 tweets per emotion = 60 total
```

Flags: `--per-class`, `--seed`, `--min-words`, `--max-words`. The seed makes the draw reproducible — worth a line in the write-up.

## Step 2 — Create the Sheet and the Drive backup folder

1. In Google Drive, create a new **Google Sheet** and name it something like `emotion-labels`.
2. Create a **folder** in Drive named `emotion-labeling-raw`. Open it and copy the id out of the URL: `drive.google.com/drive/folders/`**`THIS_PART`**.

## Step 3 — Deploy the backend

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the starter code, paste in everything from `apps-script/Code.gs`.
3. Set `BACKUP_FOLDER_ID` at the top to the folder id from step 2 (or leave `""` to skip backups).
4. Save, then run `testSetup` once from the editor. Google will ask you to authorize the script — approve it. Check the log says the sheet and folder are reachable.
5. **Deploy → New deployment → Web app**:
   - Description: anything
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the URL it gives you. It ends in `/exec`.

Re-deploying after a code change: **Deploy → Manage deployments → edit → Version: New version**. If you create a whole new deployment instead, the URL changes and you have to update `config.js`.

## Step 4 — Point the site at it

Open `docs/config.js` and paste the `/exec` URL into `ENDPOINT`:

```js
const CONFIG = {
  ENDPOINT: "https://script.google.com/macros/s/AKfy.../exec",
  TWEETS_PER_PARTICIPANT: 5,
  STUDY_NAME: "Emotion labeling study"
};
```

## Step 5 — Publish on GitHub Pages

```bash
git init
git add .
git commit -m "Emotion labeling task"
git branch -M main
git remote add origin https://github.com/YOURUSER/emotion-labeling.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder: `/docs`** → Save. A minute later your task is live at:

```
https://YOURUSER.github.io/emotion-labeling/
```

## Step 6 — Test as a participant and screenshot

Open the live link in a private window, finish all five tweets, and check the confirmation screen says the labels were saved. Then open your Google Sheet — five new rows, one per tweet, with your participant ID, the tweet, your label, the dataset's own label, response time, and timestamps. **That Sheet view is your data-collection screenshot.** The Drive folder will also hold `session-XXXX.json` with the raw submission.

## Step 7 — Submit

Hand in the GitHub Pages link. Nothing needs to stay running on your machine; Pages and Apps Script are both hosted. Don't delete or re-deploy the script before grading.

---

## What gets recorded

One row per (participant, tweet, label):

| column | meaning |
| --- | --- |
| `received_at` | when the backend wrote the row |
| `session_id` | one visit to the task |
| `participant_id` | the code or name the participant entered |
| `position` | 1–5, order the tweet was shown in |
| `tweet_id`, `tweet_text` | which tweet |
| `dataset_label` | the dataset's own label (never shown to participants) |
| `chosen_label` | what the participant picked |
| `agrees_with_dataset` | convenience column for analysis |
| `response_ms` | time from showing the tweet to the click |
| `submitted_at` | participant's clock |

## Design decisions worth writing up

- **Random assignment per session.** A shuffle seeded from participant ID + session ID picks the five tweets, so different people see different tweets, while a mid-task reload keeps the same five instead of silently reassigning them.
- **Balanced pool.** Equal sampling per emotion avoids the dataset's skew toward joy and sadness, which would otherwise dominate a five-tweet draw.
- **One tweet per screen, forced choice, no skip.** Isolates each judgment and makes per-item response time a usable quality signal. The six options carry short glosses because love/joy and anger/sadness are the pairs annotators most often split on.
- **Ground truth is carried but never displayed**, so the interface can't anchor the participant, and agreement with the dataset can be computed afterwards.
- **The backend validates labels** against the six allowed values and truncates fields, so a malformed POST can't pollute the sheet. Every write is wrapped in a script lock, so simultaneous participants can't overwrite each other's rows.
- **Two copies of every submission** — Sheet rows for analysis, a raw JSON file in Drive as a backup — because the Sheet is the one people accidentally edit.
- **Instructions state what is recorded** before the participant starts, and participation is described as voluntary.

### A known limitation to be honest about in your write-up

Because the site is static, the tweet pool and the dataset labels are visible to anyone who opens `tweets.js` in devtools, and a determined person could POST fabricated rows to the endpoint. For a class assignment that's acceptable; a real deployment would move sampling and validation server-side (and the `session_id` would be issued by the backend rather than the browser).

## Analysis starter

```python
import pandas as pd
df = pd.read_csv("responses.csv")          # File > Download > CSV from the Sheet
print(df.groupby("participant_id").size())
print(df["agrees_with_dataset"].mean())    # agreement with the dataset's labels
print(pd.crosstab(df["dataset_label"], df["chosen_label"]))
```

That confusion matrix is usually the most interesting thing in the write-up, and a good entry point for the bonus essay: where annotators disagree with the dataset's "ground truth" is exactly where the premise that a tweet carries one recoverable emotion starts to break down.
