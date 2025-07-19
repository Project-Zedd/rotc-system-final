/**
 * Google Apps Script for batch processing ROTC cadet registrations from Google Form.
 * Stores submissions in "PendingSubmissions" sheet and sends batches to backend server every 5 minutes.
 */

const BATCH_SIZE = 100;
const BACKEND_URL = 'https://your-backend-url/api/import';
const BEARER_TOKEN = 'rotc-secret-123';

function onFormSubmit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PendingSubmissions');
  if (!sheet) {
    SpreadsheetApp.getActiveSpreadsheet().insertSheet('PendingSubmissions');
  }
  const row = e.values;
  sheet.appendRow(row);
}

function batchProcessSubmissions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PendingSubmissions');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // No data

  // Skip header row
  const submissions = data.slice(1);

  const batch = submissions.slice(0, BATCH_SIZE);
  if (batch.length === 0) return;

  const payload = batch.map(row => {
    return {
      last_name: row[0],
      first_name: row[1],
      mi: row[2],
      course: row[3],
      dob: row[4],
      contact_number: row[5].startsWith('0') ? row[5] : '0' + row[5],
      address: row[6],
      gender: row[7],
      photo_url: row[8] // Assuming photo URL is in column 9
    };
  });

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + BEARER_TOKEN
    },
    payload: JSON.stringify({ cadets: payload }),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(BACKEND_URL, options);
    if (response.getResponseCode() === 200) {
      // Remove processed rows
      sheet.deleteRows(2, batch.length);
    } else {
      Logger.log('Batch processing failed: ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('Batch processing error: ' + error);
  }
}

// Set up time-driven trigger to run batchProcessSubmissions every 5 minutes
function createTimeDrivenTrigger() {
  ScriptApp.newTrigger('batchProcessSubmissions')
    .timeBased()
    .everyMinutes(5)
    .create();
}
