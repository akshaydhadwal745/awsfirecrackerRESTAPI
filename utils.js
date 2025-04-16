const { execSync } = require('child_process');

function runCommand(command) {
  try {
    return execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${command}`, error.message);
  }
}

module.exports = { runCommand };
