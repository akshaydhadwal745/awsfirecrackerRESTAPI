const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function startFirecracker() {
  const vmId = uuidv4(); // Generate unique ID for each VM
  const apiSocket = `/tmp/firecracker-${vmId}.socket`;
  const firecrackerBinary = path.resolve(__dirname, './firecracker_cli/firecracker');
  const logFile = path.resolve(__dirname, `firecracker-${vmId}.log`);

  try {
    console.log(`🧹 Removing existing socket at ${apiSocket}...`);
    execSync(`sudo rm -f ${apiSocket}`);

    console.log(`🚀 Starting Firecracker in background...`);

    const out = fs.openSync(logFile, 'a');
    const err = fs.openSync(logFile, 'a');

    const firecracker = spawn('sudo', [firecrackerBinary, '--api-sock', apiSocket], {
      detached: true,
      stdio: ['ignore', out, err]
    });

    firecracker.unref();

    console.log(`✅ Firecracker started in background (PID: ${firecracker.pid})`);
    console.log(`📄 Logs: ${logFile}`);

    return { apiSocket, vmId, logFile }; // 👈 Return info for use elsewhere
  } catch (error) {
    console.error('❌ Error running Firecracker:', error.message);
    return null;
  }
}

module.exports = { startFirecracker };
