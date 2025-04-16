const { execSync, spawnSync } = require('child_process');

const BASE_TAP = "tap";
const BASE_NET_PREFIX = "172.";
const BASE_SUFFIX = ".0.1";
const MASK = "/24";
const START_OCTET = 16;
const MAX_OCTET = 255;

// Relaunch as sudo if needed
if (process.getuid && process.getuid() !== 0) {
  const nodePath = spawnSync('which', ['node']).stdout.toString().trim();
  console.log("🔐 Not running as root. Re-running with sudo...");
  const result = spawnSync('sudo', [nodePath, ...process.argv.slice(1)], {
    stdio: 'inherit'
  });
  process.exit(result.status);
}

// Get existing TAPs
function getExistingTAPs() {
  try {
    const output = execSync(`ip link show`).toString();
    const regex = new RegExp(`${BASE_TAP}(\\d+)`, 'g');
    const matches = [...output.matchAll(regex)].map(match => match[0]);
    return new Set(matches);
  } catch (error) {
    console.error("❌ Failed to list TAP interfaces:", error);
    return new Set();
  }
}

// Get used IPs
function getUsedIPs() {
  try {
    const output = execSync(`ip addr show`).toString();
    const regex = /inet (\d+\.\d+\.\d+\.\d+)\/\d+/g;
    const matches = [...output.matchAll(regex)].map(match => match[1]);
    return new Set(matches);
  } catch (error) {
    console.error("❌ Failed to list IPs:", error);
    return new Set();
  }
}

// Generate next TAP + IP using third octet
function generateTAPandIP(existingTAPs, usedIPs) {
  for (let i = START_OCTET; i <= MAX_OCTET; i++) {
    const tapName = `${BASE_TAP}${i}`;
    const ip = `${BASE_NET_PREFIX}${i}${BASE_SUFFIX}`; // 172.X.0.1
    if (!existingTAPs.has(tapName) && !usedIPs.has(ip)) {
      return { tapName, ip };
    }
  }
  throw new Error("❌ No available TAP devices or subnets left.");
}

// Create the TAP interface
function createTAP(tapName, ip) {
  try {
    console.log(`🛠️ Creating TAP: ${tapName} with IP: ${ip}`);
    execSync(`ip tuntap add dev ${tapName} mode tap`);
    execSync(`ip addr add ${ip}${MASK} dev ${tapName}`);
    execSync(`ip link set ${tapName} up`);
    console.log(`✅ ${tapName} created and configured with ${ip}${MASK}`);
  } catch (error) {
    console.error("❌ Failed to create TAP device:", error.message);
  }
}

// Main
function main() {
  const existingTAPs = getExistingTAPs();
  const usedIPs = getUsedIPs();
  const { tapName, ip } = generateTAPandIP(existingTAPs, usedIPs);
  createTAP(tapName, ip);
}

main();
