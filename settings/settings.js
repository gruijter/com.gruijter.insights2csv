/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

function loadSettings() {
	Homey.get('smbSettings', (err, storedData) => {
		if (err) {
			Homey.alert(err);
			return;
		}
		$('#useSmb').prop('checked', false);
		if (storedData) {
			$('#useSmb').prop('checked', storedData.useSmb);
			$('#smbShare').val(storedData.smbShare);
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
			$('#FTPHost').val(storedData.FTPHost);
			$('#FTPPort').val(storedData.FTPPort);
			$('#FTPFolder').val(storedData.FTPFolder);
			$('#useSFTP').prop('checked', storedData.useSFTP);
			$('#FTPUsername').val(storedData.FTPUsername);
			$('#FTPPassword').val(storedData.FTPPassword);
		}
	});
}

function testSmb() {
	const testData = {
		useSmb: $('#useSmb').prop('checked'),
		smbShare: $('#smbShare').val(),
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

function testWebdav() {
	const testData = {
		useWebdav: $('#useWebdav').prop('checked'),
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

function testFTP() {
	const testData = {
		useFTP: $('#useFTP').prop('checked'),
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

function saveSmb() {
	const saveData = {
		useSmb: $('#useSmb').prop('checked'),
		smbShare: $('#smbShare').val(),
		smbDomain: $('#smbDomain').val(),
		smbUsername: $('#smbUsername').val(),
		smbPassword: $('#smbPassword').val(),
	};
	if (error) {
		return Homey.alert(error, 'error');
	}
	return Homey.alert(`${Homey.__('settings.tab1.settingsSaved')}`, 'info');
}

function saveWebdav() {
	const saveData = {
		useWebdav: $('#useWebdav').prop('checked'),
		webdavUrl: $('#webdavUrl').val(),
		webdavUsername: $('#webdavUsername').val(),
		webdavPassword: $('#webdavPassword').val(),
	};
	Homey.set('webdavSettings', saveData, (error) => {
		if (error) {
			return Homey.alert(error, 'error');
		}
		return Homey.alert(`${Homey.__('settings.tab2.settingsSaved')}`, 'info');
	});
}

function saveFTP() {
	const saveData = {
		useFTP: $('#useFTP').prop('checked'),
		FTPHost: $('#FTPHost').val(),
		FTPPort: Number($('#FTPPort').val()),
		FTPFolder: $('#FTPFolder').val(),
		useSFTP: $('#useSFTP').prop('checked'),
		FTPUsername: $('#FTPUsername').val(),
		FTPPassword: $('#FTPPassword').val(),
	};
	Homey.set('FTPSettings', saveData, (error) => {
		if (error) {
			return Homey.alert(error, 'error');
		}
		return Homey.alert(`${Homey.__('settings.tab3.settingsSaved')}`, 'info');
	});
}

// function exportAll() {
// 	Homey.confirm(Homey.__('settings.confirmExport'), 'warning', (err, result) => {
// 		if (!result) { return; }
// 		Homey.api('GET', '/archiveAll', (error, res) => {
// 			if (error) {
// 				Homey.alert(error, 'error');
// 			} else {
// 				HomeyAPI.alert(Homey.__('settings.backupInitiated'), 'info');
// 			}
// 		});
// 	});
// }

function displayLogs(lines) {
	$('#loglines').html(lines);
}

function updateLogs() {
	try {
		Homey.api('GET', 'getlogs/', null, (err, result) => {
			if (!err) {
				let lines = '';
				for (let i = (result.length - 1); i >= 0; i -= 1) {
					lines += `${result[i]}<br />`;
				}
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
	Homey.confirm(Homey.__('settings.tab3.deleteWarning'), 'warning', (error, result) => {
		if (result) {
			Homey.api('GET', 'deletelogs/', null, (err) => {
				if (err) {
					Homey.alert(err.message, 'error'); // [, String icon], Function callback )
				} else {
					Homey.alert(Homey.__('settings.tab3.deleted'), 'info');
					updateLogs();
				}
			});
		}
	});
}

function showTab(tab) {
	$('.tab').removeClass('tab-active');
	$('.tab').addClass('tab-inactive');
	$(`#tabb${tab}`).removeClass('tab-inactive');
	$(`#tabb${tab}`).addClass('active');
	$('.panel').hide();
	$(`#tab${tab}`).show();
	updateLogs();
	loadSettings();
}

function onHomeyReady(homeyReady) {
	Homey = homeyReady;
	showTab(1);
	Homey.ready();
}
