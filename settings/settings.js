/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

let resolution = 'lastHour';
let appId = '';

// tab 1

function testSmb() {
	const testData = {
		useSmb: $('#useSmb').prop('checked'),
		smbUseSeperateFolders: $('#smbUseSeperateFolders').prop('checked'),
		smbShare: $('#smbShare').val(),
		smbPath: $('#smbPath').val() || '',
		smbDomain: $('#smbDomain').val(),
		smbUsername: $('#smbUsername').val(),
		smbPassword: $('#smbPassword').val(),
	};
	Homey.api('POST', 'testSmb/', testData, (err, result) => {
		if (err) {
			return Homey.alert(err, 'error');
		}
		return Homey.alert(`${Homey.__('settings.tab1.testOk')}`, 'info');
	});
}

function saveSmb() {
	const saveData = {
		useSmb: $('#useSmb').prop('checked'),
		smbUseSeperateFolders: $('#smbUseSeperateFolders').prop('checked'),
		smbShare: $('#smbShare').val(),
		smbPath: $('#smbPath').val() || '',
		smbDomain: $('#smbDomain').val(),
		smbUsername: $('#smbUsername').val(),
		smbPassword: $('#smbPassword').val(),
	};
	Homey.set('smbSettings', saveData, (error) => {
		if (error) {
			Homey.alert(error, 'error');
		}
	});
	Homey.alert(`${Homey.__('settings.tab1.settingsSaved')}`, 'info');
}

// tab 2

function testWebdav() {
	const testData = {
		useWebdav: $('#useWebdav').prop('checked'),
		webdavUseSeperateFolders: $('#webdavUseSeperateFolders').prop('checked'),
		webdavUrl: $('#webdavUrl').val(),
		webdavUsername: $('#webdavUsername').val(),
		webdavPassword: $('#webdavPassword').val(),
	};
	Homey.api('POST', 'testWebdav/', testData, (err, result) => {
		if (err) {
			return Homey.alert(err, 'error');
		}
		return Homey.alert(`${Homey.__('settings.tab2.testOk')}`, 'info');
	});
}

function saveWebdav() {
	const saveData = {
		useWebdav: $('#useWebdav').prop('checked'),
		webdavUseSeperateFolders: $('#webdavUseSeperateFolders').prop('checked'),
		webdavUrl: $('#webdavUrl').val(),
		webdavUsername: $('#webdavUsername').val(),
		webdavPassword: $('#webdavPassword').val(),
	};
	Homey.set('webdavSettings', saveData, (error) => {
		if (error) {
			Homey.alert(error, 'error');
		}
	});
	Homey.alert(`${Homey.__('settings.tab2.settingsSaved')}`, 'info');
}

// tab 3

function testFTP() {
	const testData = {
		useFTP: $('#useFTP').prop('checked'),
		FTPUseSeperateFolders: $('#FTPUseSeperateFolders').prop('checked'),
		FTPHost: $('#FTPHost').val(),
		FTPPort: Number($('#FTPPort').val()),
		FTPFolder: $('#FTPFolder').val(),
		useSFTP: $('#useSFTP').prop('checked'),
		FTPUsername: $('#FTPUsername').val(),
		FTPPassword: $('#FTPPassword').val(),
	};
	Homey.api('POST', 'testFTP/', testData, (err, result) => {
		if (err) {
			return Homey.alert(err, 'error');
		}
		return Homey.alert(`${Homey.__('settings.tab3.testOk')}`, 'info');
	});
}

function saveFTP() {
	const saveData = {
		useFTP: $('#useFTP').prop('checked'),
		FTPUseSeperateFolders: $('#FTPUseSeperateFolders').prop('checked'),
		FTPHost: $('#FTPHost').val(),
		FTPPort: Number($('#FTPPort').val()),
		FTPFolder: $('#FTPFolder').val(),
		useSFTP: $('#useSFTP').prop('checked'),
		FTPUsername: $('#FTPUsername').val(),
		FTPPassword: $('#FTPPassword').val(),
	};
	Homey.set('FTPSettings', saveData, (error) => {
		if (error) {
			Homey.alert(error, 'error');
		}
	});
	Homey.alert(`${Homey.__('settings.tab3.settingsSaved')}`, 'info');
}

// tab 4

function resolutionSelected() {
	resolution = $('#resolutionList').val();
}

function appSelected() {
	appId = $('#appList').val();
}

// function to populate the dropdown list
function fillDropdown() {
	// first empty the dropdownlist
	const dropDown = document.getElementById('resolutionList');
	while (dropDown.length > 0) {
		dropDown.remove(dropDown.length - 1);
	}
	Homey.api('get', '/getResolutions', (error, res) => {
		if (error) {
			Homey.alert(error, 'error');
		} else {
			res.forEach((resol) => {
				const resOption = document.createElement('option');
				resOption.text = resol;
				resOption.value = resol;
				dropDown.add(resOption);
			});
		}
	});
	// first empty the dropdownlist
	const dropDown2 = document.getElementById('appList');
	while (dropDown2.length > 0) {
		dropDown2.remove(dropDown2.length - 1);
	}
	// add the 'all apps' option
	const resOpt = document.createElement('option');
	resOpt.text = Homey.__('settings.tab4.allApps');
	resOpt.value = '';
	dropDown2.add(resOpt);
	appId = '';
	// add the app list
	Homey.api('get', '/getAppList', (error, res) => {
		if (error) {
			Homey.alert(error, 'error');
		} else {
			res.forEach((app) => {
				const resOption2 = document.createElement('option');
				resOption2.text = app.name;
				resOption2.value = app.id;
				dropDown2.add(resOption2);
			});
		}
	});
}

function stopExportNoConfirm() {
	Homey.api('GET', '/stopExport', (error, res) => {
		if (error) {
			Homey.alert(error, 'error');
		}
	});
}

function stopExport() {
	Homey.confirm(Homey.__('settings.tab4.confirmStopExport'), 'warning', (err, result) => {
		if (!result) { return; }
		stopExportNoConfirm();
		Homey.alert(Homey.__('settings.tab4.exportStopped'), 'info');
	});
}

function exportNow() {
	Homey.confirm(Homey.__('settings.tab4.confirmExport'), 'warning', (e, r) => {
		if (!r) { return; }
		stopExportNoConfirm();
		if (appId === '') {
			Homey.api('POST', '/archiveAll', { resolution }, (error, res) => {
				if (error) {
					Homey.alert(error, 'error');
				} else {
					Homey.alert(Homey.__('settings.tab4.backupInitiated'), 'info');
				}
			});
		} else {
			Homey.confirm(Homey.__('settings.tab4.confirmExport'), 'warning', (err, result) => {
				if (!result) { return; }
				Homey.api('POST', '/archiveApp', { appId, resolution }, (error, res) => {
					if (error) {
						Homey.alert(error, 'error');
					} else {
						Homey.alert(Homey.__('settings.tab4.backupInitiated'), 'info');
					}
				});
			});
		}
	});
}

// tab 5

function displayLogs(lines) {
	$('#loglines').html(lines);
}

function updateLogs() {
	try {
		displayLogs('');
		Homey.api('GET', 'getlogs/', null, (err, result) => {
			if (!err) {
				let lines = '';
				result
					.reverse()
					.forEach((line) => {
						const logLine = line
							.replace(' [App]', '');
						lines += `${logLine}<br />`;
					});
				displayLogs(lines);
			} else {
				displayLogs(err);
			}
		});
	} catch (e) {
		displayLogs(e);
	}
}

function deleteLogs() {
	Homey.confirm(Homey.__('settings.tab5.deleteWarning'), 'warning', (error, result) => {
		if (result) {
			Homey.api('GET', 'deletelogs/', null, (err) => {
				if (err) {
					Homey.alert(err.message, 'error'); // [, String icon], Function callback )
				} else {
					Homey.alert(Homey.__('settings.tab5.deleted'), 'info');
					updateLogs();
				}
			});
		}
	});
}

// generic

function loadSettings() {
	Homey.get('smbSettings', (err, storedData) => {
		if (err) {
			Homey.alert(err);
			return;
		}
		$('#useSmb').prop('checked', false);
		if (storedData) {
			$('#useSmb').prop('checked', storedData.useSmb);
			$('#smbUseSeperateFolderse').prop('checked', storedData.smbUseSeperateFolders);
			$('#smbShare').val(storedData.smbShare);
			$('#smbPath').val(storedData.smbPath);
			$('#smbDomain').val(storedData.smbDomain);
			$('#smbUsername').val(storedData.smbUsername);
			$('#smbPassword').val(storedData.smbPassword);
		}
	});
	Homey.get('webdavSettings', (err, storedData) => {
		if (err) {
			Homey.alert(err);
			return;
		}
		$('#useWebdav').prop('checked', false);
		if (storedData) {
			$('#useWebdav').prop('checked', storedData.useWebdav);
			$('#webdavUseSeperateFolders').prop('checked', storedData.webdavUseSeperateFolders);
			$('#webdavUrl').val(storedData.webdavUrl);
			$('#webdavUsername').val(storedData.webdavUsername);
			$('#webdavPassword').val(storedData.webdavPassword);
		}
	});
	Homey.get('FTPSettings', (err, storedData) => {
		if (err) {
			Homey.alert(err);
			return;
		}
		$('#useFTP').prop('checked', false);
		$('#useSFTP').prop('checked', false);
		if (storedData) {
			$('#useFTP').prop('checked', storedData.useFTP);
			$('#FTPUseSeperateFolders').prop('checked', storedData.FTPUseSeperateFolders);
			$('#FTPHost').val(storedData.FTPHost);
			$('#FTPPort').val(storedData.FTPPort);
			$('#FTPFolder').val(storedData.FTPFolder);
			$('#useSFTP').prop('checked', storedData.useSFTP);
			$('#FTPUsername').val(storedData.FTPUsername);
			$('#FTPPassword').val(storedData.FTPPassword);
		}
	});
	fillDropdown();
}

function showTab(tab) {
	$('.tab').removeClass('tab-active');
	$('.tab').addClass('tab-inactive');
	$(`#tabb${tab}`).removeClass('tab-inactive');
	$(`#tabb${tab}`).addClass('active');
	$('.panel').hide();
	$(`#tab${tab}`).show();
	if (tab === 5) updateLogs();
	if (tab !== 5) loadSettings();
}

function onHomeyReady(homeyReady) {
	Homey = homeyReady;
	showTab(1);
	Homey.ready();
}
