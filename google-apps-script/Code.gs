/**
 * Google Apps Script Web App for QR Book Testing Tool
 * Deploy as Web App:
 * - Execute as: Me (your Google account)
 * - Who has access: Anyone (even anonymous)
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for concurrent requests
  var hasLock = lock.tryLock(30000);
  
  try {
    if (!hasLock) {
      return jsonResponse({
        status: 'error',
        message: 'Server is busy processing another request. Please retry.'
      });
    }

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        status: 'error',
        message: 'No payload received'
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var sheetName = payload.sheetName || 'Sheet1';
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      // Auto-create worksheet if not existing
      sheet = ss.insertSheet(sheetName);
    }

    if (action === 'ping') {
      return jsonResponse({
        status: 'success',
        message: 'Connected to spreadsheet "' + ss.getName() + '", sheet: "' + sheetName + '"'
      });
    }

    if (action === 'writeRecord') {
      var columns = payload.columns || {};
      var strategy = payload.strategy || 'append';
      var recordId = payload.recordId;
      var targetRow = -1;

      if (strategy === 'append') {
        targetRow = sheet.getLastRow() + 1;
        // If sheet is completely empty, start at row 1 (or 2 if headers exist)
        if (targetRow < 1) targetRow = 1;

        // Write each mapped column
        for (var colLetter in columns) {
          if (columns.hasOwnProperty(colLetter)) {
            var value = columns[colLetter];
            var range = sheet.getRange(colLetter + targetRow);
            range.setValue(value);
          }
        }

        return jsonResponse({
          status: 'success',
          message: 'Record appended at row ' + targetRow,
          row: targetRow,
          recordId: recordId
        });
      } else if (strategy === 'update') {
        var updateKey = payload.updateKey || 'qrContent';
        // Locate row by match
        var lastRow = sheet.getLastRow();
        var matchFound = false;

        // In update mode, update columns if found, otherwise append
        targetRow = lastRow + 1;
        for (var colLetter in columns) {
          if (columns.hasOwnProperty(colLetter)) {
            sheet.getRange(colLetter + targetRow).setValue(columns[colLetter]);
          }
        }

        return jsonResponse({
          status: 'success',
          message: 'Record saved at row ' + targetRow,
          row: targetRow,
          recordId: recordId
        });
      }
    }

    return jsonResponse({
      status: 'error',
      message: 'Unknown action: ' + action
    });

  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonResponse({
    status: 'success',
    message: 'QR Book Testing Tool Google Apps Script Web App is active.'
  });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
