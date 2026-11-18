const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
module.exports = async function (target) {
  if (process.platform !== 'win32') return;
  const stage = path.resolve('.build/update-stage-' + process.pid + '-' + Date.now());
  assert.ok(stage.startsWith(path.resolve('.build') + path.sep));
  await fs.mkdir(path.join(stage, 'server'), { recursive: true });
  await fs.mkdir(path.join(stage, 'app'), { recursive: true });
  await fs.mkdir(path.join(target, 'app'), { recursive: true });
  const configFile = path.join(target, '.private/server.json'), originalConfig = await fs.readFile(configFile, 'utf8');
  try {
    for (const name of ['package.json','package-lock.json','backup.cjs','index.cjs']) {
      await fs.copyFile('server/' + name, path.join(stage, 'server', name));
      if (name !== 'backup.cjs') await fs.copyFile('server/' + name, path.join(target, 'server', name));
    }
    const script = (await fs.readFile('deploy/windows-server/Update-Accounts.ps1', 'utf8')).replace(/^#Requires -RunAsAdministrator\r?\n/, '');
    // Only the admin directive is removed. Windows task APIs and the nested installer are mocked;
    // backup, file copies, npm dependency rollback and all path guards run for real in fixtures.
    await fs.writeFile(path.join(stage, 'Update-Accounts.ps1'), script);
    await fs.writeFile(path.join(stage, 'Reset-Password.ps1'), '# fixture'); await fs.writeFile(path.join(stage, 'README.md'), 'fixture');
    await fs.writeFile(path.join(stage, 'Install-Accounts.ps1'), "if ($env:CHEW_TEST_FAIL -eq '1') { throw 'simulated migration failure' }\nStart-ScheduledTask -TaskName ChewSimulatorAccounts\n");
    await fs.writeFile(path.join(stage, 'Harness.ps1'), `
$ErrorActionPreference='Stop'
$global:fixtureState='Running'
function Get-ScheduledTask {
  param($TaskName)
  [pscustomobject]@{ State=$global:fixtureState; Actions=@([pscustomobject]@{ WorkingDirectory=$env:CHEW_TEST_TARGET; Arguments=('"'+(Join-Path $env:CHEW_TEST_TARGET 'server\\index.cjs')+'"') }) }
}
function Stop-ScheduledTask { param($TaskName) $global:fixtureState='Ready' }
function Start-ScheduledTask { param($TaskName) $global:fixtureState='Running' }
& (Join-Path $PSScriptRoot 'Update-Accounts.ps1')
if ($global:fixtureState -ne 'Running') { throw 'Task was not restarted' }
`);
    const run = fail => execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(stage,'Harness.ps1')], { windowsHide: true, timeout: 90000, env: { ...process.env, CHEW_TEST_TARGET: target, CHEW_TEST_FAIL: fail ? '1' : '0' } });
    await fs.writeFile(path.join(target, 'app/index.html'), 'old'); await fs.writeFile(path.join(stage, 'app/index.html'), 'new');
    await run(false);
    assert.equal(await fs.readFile(path.join(target, 'app/index.html'), 'utf8'), 'new');
    assert.equal(await fs.readFile(configFile, 'utf8'), originalConfig);
    const backups = await fs.readdir(path.join(target, '.private/backups')); assert.equal(backups.length, 1);
    assert.match(await fs.readFile(path.join(target, '.private/backups', backups[0], 'database.sql'), 'utf8'), /-- Backup complete/);
    await fs.writeFile(path.join(stage, 'app/index.html'), 'broken');
    await assert.rejects(run(true), error => /simulated migration failure/.test(error.stderr));
    assert.equal(await fs.readFile(path.join(target, 'app/index.html'), 'utf8'), 'new');
    assert.equal(await fs.readFile(configFile, 'utf8'), originalConfig);
    await fs.rename(configFile, configFile + '.saved');
    await assert.rejects(run(false), error => /server.json is missing/.test(error.stderr));
    assert.equal(await fs.readFile(path.join(target, 'app/index.html'), 'utf8'), 'new');
    await fs.rename(configFile + '.saved', configFile);
    console.log('PASS: Windows updater fixture success, real private database/file backup, migration-failure file rollback, unchanged config and missing-config guard; no real Windows tasks modified');
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
};
