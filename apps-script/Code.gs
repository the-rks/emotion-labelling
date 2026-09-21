/**
 * Backend for the emotion-labeling task hosted on GitHub Pages.
 *
 * Runs as a Google Apps Script web app under your own Google account, so the
 * page can save data into your Drive without any participant signing in and
 * without a credential living in the public site.
 *
 * It writes each submission twice:
 *   1. rows appended to a Google Sheet   (SpreadsheetApp)  — for analysis
 *   2. one JSON file per session in a Drive folder (DriveApp) — raw backup
 *
 * Setup is in the README. Short version:
 *   Sheet > Extensions > Apps Script > paste this in > set BACKUP_FOLDER_ID
 *   > Deploy > New deployment > Web app > execute as Me, access Anyone
 *   > copy the /exec URL into docs/config.js
 */

// Optional. Create a folder in your Drive, open it, and copy the id from the
// URL (drive.google.com/drive/folders/THIS_PART). Leave "" to skip backups.
var BACKUP_FOLDER_ID = "1yJIKqBUBQV-1mpKnGcnrYwvGZVvpA662";

var SHEET_NAME = "responses";

var HEADERS = [
  "received_at", "session_id", "participant_id", "position", "tweet_id",
  "tweet_text", "dataset_label", "chosen_label", "agrees_with_dataset",
  "response_ms", "submitted_at"
];

var EMOTIONS = ["anger", "fear", "joy", "love", "sadness", "surprise"];


/* ------------------------------------------------------------------ */
/* POST: save a participant's labels                                    */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);          // serialize concurrent participants
  try {
    var rows = parseRows_(e);
    if (!rows.length) return json_({ status: "error", message: "empty submission" });

    var sheet = getSheet_();
    var received = new Date();
    var values = rows.map(function (r) {
      return [
        received, r.session_id, r.participant_id, r.position, r.tweet_id,
        r.tweet_text, r.dataset_label, r.chosen_label, r.agrees_with_dataset,
        r.response_ms, r.submitted_at
      ];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, HEADERS.length)
         .setValues(values);

    backupToDrive_(rows, received);

    return json_({
      status: "ok",
      saved: values.length,
      received_at: received.toISOString()
    });
  } catch (err) {
    return json_({ status: "error", message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Accepts either a text/plain JSON body or a form-encoded `payload` field. */
function parseRows_(e) {
  var raw = null;
  if (e && e.postData && e.postData.contents) {
    raw = JSON.parse(e.postData.contents);
    if (raw && raw.payload) raw = raw.payload;
  } else if (e && e.parameter && e.parameter.payload) {
    raw = JSON.parse(e.parameter.payload);
  }
  if (!Array.isArray(raw)) throw new Error("payload must be an array of responses");

  return raw.map(function (r) {
    if (EMOTIONS.indexOf(String(r.chosen_label)) === -1) {
      throw new Error("unknown label: " + r.chosen_label);
    }
    return {
      session_id:          String(r.session_id || "").slice(0, 64),
      participant_id:      String(r.participant_id || "").slice(0, 64),
      position:            Number(r.position) || 0,
      tweet_id:            String(r.tweet_id || "").slice(0, 32),
      tweet_text:          String(r.tweet_text || "").slice(0, 500),
      dataset_label:       String(r.dataset_label || ""),
      chosen_label:        String(r.chosen_label),
      agrees_with_dataset: r.agrees_with_dataset === true,
      response_ms:         Number(r.response_ms) || 0,
      submitted_at:        String(r.submitted_at || "").slice(0, 40)
    };
  });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Raw backup: one JSON file per session, in a Drive folder you own. */
function backupToDrive_(rows, received) {
  if (!BACKUP_FOLDER_ID) return;
  try {
    var folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    var name = "session-" + (rows[0].session_id || "unknown") + ".json";
    var body = JSON.stringify({ received_at: received.toISOString(), responses: rows }, null, 2);
    folder.createFile(name, body, MimeType.PLAIN_TEXT);
  } catch (err) {
    // A failed backup must never lose the submission that already reached
    // the sheet, so swallow it and leave a trace in the execution log.
    console.error("Drive backup failed: " + err);
  }
}


/* ------------------------------------------------------------------ */
/* GET: health check and submission verification                        */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var check = e && e.parameter && e.parameter.check;
  if (!check) {
    return json_({ status: "ok", message: "emotion labeling collector is running" });
  }
  var sheet = getSheet_();
  if (sheet.getLastRow() < 2) return json_({ status: "ok", found: 0 });

  var col = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();  // session_id
  var found = col.filter(function (r) { return String(r[0]) === String(check); }).length;
  return json_({ status: "ok", found: found });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}


/* ------------------------------------------------------------------ */
/* Run once from the editor to check the sheet and folder are reachable */
/* ------------------------------------------------------------------ */

function testSetup() {
  var sheet = getSheet_();
  Logger.log("sheet ok: " + sheet.getName() + ", rows: " + sheet.getLastRow());
  if (BACKUP_FOLDER_ID) {
    Logger.log("drive folder ok: " + DriveApp.getFolderById(BACKUP_FOLDER_ID).getName());
  } else {
    Logger.log("no BACKUP_FOLDER_ID set — Drive backup disabled");
  }
}
