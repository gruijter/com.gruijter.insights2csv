/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

'use strict';

let resolution = 'lastHour';
let appId = '';

// tab 1

async function testSmb() {
  const testData = {
    useSmb: document.getElementById('useSmb').checked,
    smbUseSeperateFolders: document.getElementById('smbUseSeperateFolders').checked,
    smbShare: document.getElementById('smbShare').value,
    smbPath: document.getElementById('smbPath').value || '',
    smbDomain: document.getElementById('smbDomain').value,
    smbUsername: document.getElementById('smbUsername').value,
    smbPassword: document.getElementById('smbPassword').value,
    smbPort: Number(document.getElementById('smbPort').value) || 445,
  };
  try {
    await Homey.api('POST', '/testSmb', testData);
    Homey.alert(Homey.__('settings.tab1.testOk'), 'info');
  } catch (err) {
    Homey.alert(err.message || err, 'error');
  }
}

async function saveSmb() {
  const saveData = {
    useSmb: document.getElementById('useSmb').checked,
    smbUseSeperateFolders: document.getElementById('smbUseSeperateFolders').checked,
    smbShare: document.getElementById('smbShare').value,
    smbPath: document.getElementById('smbPath').value || '',
    smbDomain: document.getElementById('smbDomain').value,
    smbUsername: document.getElementById('smbUsername').value,
    smbPassword: document.getElementById('smbPassword').value,
    smbPort: Number(document.getElementById('smbPort').value) || 445,
  };
  try {
    await Homey.set('smbSettings', saveData);
    Homey.alert(Homey.__('settings.tab1.settingsSaved'), 'info');
  } catch (err) {
    Homey.alert(err.message || err, 'error');
  }
}

// tab 2

async function testWebdav() {
  const testData = {
    useWebdav: document.getElementById('useWebdav').checked,
    webdavUseSeperateFolders: document.getElementById('webdavUseSeperateFolders').checked,
    webdavUrl: document.getElementById('webdavUrl').value,
    webdavUsername: document.getElementById('webdavUsername').value,
    webdavPassword: document.getElementById('webdavPassword').value,
  };
  try {
    await Homey.api('POST', '/testWebdav', testData);
    Homey.alert(Homey.__('settings.tab2.testOk'), 'info');
  } catch (err) {
    Homey.alert(err.message || err, 'error');
  }
}

async function saveWebdav() {
  const saveData = {
    useWebdav: document.getElementById('useWebdav').checked,
    webdavUseSeperateFolders: document.getElementById('webdavUseSeperateFolders').checked,
    webdavUrl: document.getElementById('webdavUrl').value,
    webdavUsername: document.getElementById('webdavUsername').value,
    webdavPassword: document.getElementById('webdavPassword').value,
  };
  try {
    await Homey.set('webdavSettings', saveData);
    Homey.alert(Homey.__('settings.tab2.settingsSaved'), 'info');
  } catch (err) {
    Homey.alert(err.message || err, 'error');
  }
}

// tab 3

async function testFTP() {
  const testData = {
    useFTP: document.getElementById('useFTP').checked,
    FTPUseSeperateFolders: document.getElementById('FTPUseSeperateFolders').checked,
    FTPHost: document.getElementById('FTPHost').value,
    FTPPort: Number(document.getElementById('FTPPort').value),
    FTPFolder: document.getElementById('FTPFolder').value,
    FTPProtocol: document.getElementById('FTPProtocol').value,
    FTPUsername: document.getElementById('FTPUsername').value,
    FTPPassword: document.getElementById('FTPPassword').value,
  };
  try {
    await Homey.api('POST', '/testFTP', testData);
    Homey.alert(Homey.__('settings.tab3.testOk'), 'info');
  } catch (err) {
    Homey.alert(err.message || err, 'error');
  }
}

async function saveFTP() {
  const saveData = {
    useFTP: document.getElementById('useFTP').checked,
    FTPUseSeperateFolders: document.getElementById('FTPUseSeperateFolders').checked,
    FTPHost: document.getElementById('FTPHost').value,
    FTPPort: Number(document.getElementById('FTPPort').value),
    FTPFolder: document.getElementById('FTPFolder').value,
    FTPProtocol: document.getElementById('FTPProtocol').value,
    FTPUsername: document.getElementById('FTPUsername').value,
    FTPPassword: document.getElementById('FTPPassword').value,
  };
  try {
    await Homey.set('FTPSettings', saveData);
    Homey.alert(Homey.__('settings.tab3.settingsSaved'), 'info');
  } catch (err) {
    Homey.alert(err.message || err, 'error');
  }
}

function ftpProtocolChanged() {
  const protocol = document.getElementById('FTPProtocol').value;
  const portInput = document.getElementById('FTPPort');
  if (protocol === 'sftp') {
    portInput.value = 22;
  } else {
    portInput.value = 21;
  }
}

// tab 4

function resolutionSelected() {
  resolution = document.getElementById('resolutionList').value;
}

function appSelected() {
  appId = document.getElementById('appList').value;
}

// function to populate the dropdown list
async function fillDropdown() {
  const dropDown = document.getElementById('resolutionList');
  while (dropDown.length > 0) {
    dropDown.remove(dropDown.length - 1);
  }

  try {
    const res = await Homey.api('GET', '/getResolutions');
    res.forEach((resol) => {
      const resOption = document.createElement('option');
      resOption.text = resol;
      resOption.value = resol;
      dropDown.add(resOption);
    });
  } catch (error) {
    console.error('Error fetching resolutions:', error);
  }

  const dropDown2 = document.getElementById('appList');
  while (dropDown2.length > 0) {
    dropDown2.remove(dropDown2.length - 1);
  }

  const resOpt = document.createElement('option');
  resOpt.text = Homey.__('settings.tab4.allApps');
  resOpt.value = '';
  dropDown2.add(resOpt);
  appId = '';

  try {
    const res = await Homey.api('GET', '/getAppList');
    res.forEach((app) => {
      const resOption2 = document.createElement('option');
      resOption2.text = app.name;
      resOption2.value = app.id;
      dropDown2.add(resOption2);
    });
  } catch (error) {
    console.error('Error fetching app list:', error);
  }
}

async function stopExportNoConfirm() {
  try {
    await Homey.api('GET', '/stopExport');
  } catch (error) {
    Homey.alert(error.message || error, 'error');
  }
}

function stopExport() {
  Homey.confirm(Homey.__('settings.tab4.confirmStopExport'), 'warning', (err, result) => {
    if (!result) {
      return;
    }
    stopExportNoConfirm();
    Homey.alert(Homey.__('settings.tab4.exportStopped'), 'info');
  });
}

async function saveCPU() {
  const saveData = {
    lowCPU: document.getElementById('lowCPU').checked,
  };
  try {
    await Homey.set('CPUSettings', saveData);
  } catch (error) {
    Homey.alert(error.message || error, 'error');
  }
}

async function saveIncludeLocalDateTime() {
  const saveData = {
    includeLocalDateTime: document.getElementById('includeLocalDateTime').checked,
  };
  try {
    await Homey.set('IncludeLocalDateTime', saveData);
  } catch (error) {
    Homey.alert(error.message || error, 'error');
  }
}

async function saveOnlyZipWithLogs() {
  const saveData = {
    onlyZipWithLogs: document.getElementById('onlyZipWithLogs').checked,
  };
  try {
    await Homey.set('OnlyZipWithLogs', saveData);
  } catch (error) {
    Homey.alert(error.message || error, 'error');
  }
}

function exportNow() {
  Homey.confirm(Homey.__('settings.tab4.confirmExport'), 'warning', async (e, r) => {
    if (!r) {
      return;
    }
    stopExportNoConfirm();
    try {
      if (appId === '') {
        await Homey.api('POST', '/exportAll', { resolution });
      } else {
        await Homey.api('POST', '/exportApp', { appId, resolution });
      }
      Homey.alert(Homey.__('settings.tab4.backupInitiated'), 'info');
    } catch (error) {
      Homey.alert(error.message || error, 'error');
    }
  });
}

// tab 5

function displayLogs(lines) {
  document.getElementById('loglines').innerHTML = lines;
}

async function updateLogs() {
  try {
    displayLogs('');
    const result = await Homey.api('GET', '/getlogs');
    let lines = '';
    result.reverse().forEach((line) => {
      const logLine = line.replace(' [App]', '');
      lines += `${logLine}<br />`;
    });
    displayLogs(lines);
  } catch (err) {
    displayLogs(err.message || err);
  }
}

function deleteLogs() {
  Homey.confirm(Homey.__('settings.tab5.deleteWarning'), 'warning', async (error, result) => {
    if (result) {
      try {
        await Homey.api('GET', '/deletelogs');
        Homey.alert(Homey.__('settings.tab5.deleted'), 'info');
        updateLogs();
      } catch (err) {
        Homey.alert(err.message || err, 'error');
      }
    }
  });
}

// generic

async function loadSettings() {
  try {
    const smbData = await Homey.get('smbSettings');
    document.getElementById('useSmb').checked = false;
    if (smbData) {
      document.getElementById('useSmb').checked = !!smbData.useSmb;
      document.getElementById('smbUseSeperateFolders').checked = !!smbData.smbUseSeperateFolders;
      document.getElementById('smbShare').value = smbData.smbShare || '';
      document.getElementById('smbPath').value = smbData.smbPath || '';
      document.getElementById('smbDomain').value = smbData.smbDomain || '';
      document.getElementById('smbUsername').value = smbData.smbUsername || '';
      document.getElementById('smbPassword').value = smbData.smbPassword || '';
      document.getElementById('smbPort').value = smbData.smbPort || 445;
    }
  } catch (err) {
    console.error('Failed to load SMB settings:', err);
    Homey.alert(`Could not load SMB settings: ${err.message || err}`, 'error');
  }

  try {
    const webdavData = await Homey.get('webdavSettings');
    document.getElementById('useWebdav').checked = false;
    if (webdavData) {
      document.getElementById('useWebdav').checked = !!webdavData.useWebdav;
      document.getElementById('webdavUseSeperateFolders').checked = !!webdavData.webdavUseSeperateFolders;
      document.getElementById('webdavUrl').value = webdavData.webdavUrl || '';
      document.getElementById('webdavUsername').value = webdavData.webdavUsername || '';
      document.getElementById('webdavPassword').value = webdavData.webdavPassword || '';
    }
  } catch (err) {
    console.error('Failed to load WebDAV settings:', err);
    Homey.alert(`Could not load WebDAV settings: ${err.message || err}`, 'error');
  }

  try {
    const ftpData = await Homey.get('FTPSettings');
    document.getElementById('useFTP').checked = false;
    if (ftpData) {
      document.getElementById('useFTP').checked = !!ftpData.useFTP;
      document.getElementById('FTPUseSeperateFolders').checked = !!ftpData.FTPUseSeperateFolders;
      document.getElementById('FTPHost').value = ftpData.FTPHost || '';
      document.getElementById('FTPPort').value = ftpData.FTPPort || '';
      document.getElementById('FTPFolder').value = ftpData.FTPFolder || '';
      if (ftpData.FTPProtocol) {
        document.getElementById('FTPProtocol').value = ftpData.FTPProtocol;
      } else {
        // Backwards compatibility for older configurations
        document.getElementById('FTPProtocol').value = ftpData.useSFTP ? 'ftps' : 'ftp';
      }
      document.getElementById('FTPUsername').value = ftpData.FTPUsername || '';
      document.getElementById('FTPPassword').value = ftpData.FTPPassword || '';
    }
  } catch (err) {
    console.error('Failed to load FTP settings:', err);
    Homey.alert(`Could not load FTP settings: ${err.message || err}`, 'error');
  }

  try {
    const cpuData = await Homey.get('CPUSettings');
    document.getElementById('lowCPU').checked = false;
    if (cpuData) {
      document.getElementById('lowCPU').checked = !!cpuData.lowCPU;
    }
  } catch (err) {
    console.error('Failed to load CPU settings:', err);
    Homey.alert(`Could not load CPU settings: ${err.message || err}`, 'error');
  }

  try {
    const zipData = await Homey.get('OnlyZipWithLogs');
    document.getElementById('onlyZipWithLogs').checked = false;
    if (zipData) {
      document.getElementById('onlyZipWithLogs').checked = !!zipData.onlyZipWithLogs;
    }
  } catch (err) {
    console.error('Failed to load OnlyZipWithLogs settings:', err);
    Homey.alert(`Could not load OnlyZipWithLogs settings: ${err.message || err}`, 'error');
  }

  try {
    const dtData = await Homey.get('IncludeLocalDateTime');
    document.getElementById('includeLocalDateTime').checked = false;
    if (dtData) {
      document.getElementById('includeLocalDateTime').checked = !!dtData.includeLocalDateTime;
    }
  } catch (err) {
    console.error('Failed to load IncludeLocalDateTime settings:', err);
    Homey.alert(`Could not load IncludeLocalDateTime settings: ${err.message || err}`, 'error');
  }

  fillDropdown();
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.remove('tab-active');
    el.classList.add('tab-inactive');
  });
  const activeTab = document.getElementById(`tabb${tab}`);
  if (activeTab) {
    activeTab.classList.remove('tab-inactive');
    activeTab.classList.add('tab-active');
  }
  document.querySelectorAll('.panel').forEach((el) => {
    el.style.display = 'none';
  });
  const activePanel = document.getElementById(`tab${tab}`);
  if (activePanel) {
    activePanel.style.display = 'block';
  }
  if (tab === 5) updateLogs();
  if (tab !== 5) loadSettings();
}

function onHomeyReady(homey) {
  // The 'homey' object is passed by /homey.js and is ready to use.
  // We assign it to the global Homey variable so all other functions can access it.
  Homey = homey;
  Homey.ready(); // Signal that the settings page is ready.
  setTimeout(() => {
    showTab(1);
  }, 50);
}
