const { execSync } = require('child_process');

const BASE_TAP = "tap";
const BASE_NET_PREFIX = "172.";
const BASE_SUFFIX = ".0.1";
const GUEST_SUFFIX = ".0.2";
const MASK = "/24";
const START_OCTET = 16;
const MAX_OCTET = 255;

// Get existing TAP devices
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

// Get used IP addresses
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

// Generate TAP device and IPs (host + guest)
function generateTAPandIP() {
  const existingTAPs = getExistingTAPs();
  const usedIPs = getUsedIPs();

  for (let i = START_OCTET; i <= MAX_OCTET; i++) {
    const tapName = `${BASE_TAP}${i}`;
    const hostIP = `${BASE_NET_PREFIX}${i}${BASE_SUFFIX}`; // 172.X.0.1
    const guestIP = `${BASE_NET_PREFIX}${i}${GUEST_SUFFIX}`; // 172.X.0.2
    if (!existingTAPs.has(tapName) && !usedIPs.has(hostIP)) {
      return { tapName, hostIP, guestIP, mask: MASK };
    }
  }

  throw new Error("❌ No available TAP devices or subnets left.");
}

// Optionally create the TAP device on host
function createTAP(tapName, hostIP) {
  try {
    console.log(`🛠️ Creating TAP: ${tapName} with IP: ${hostIP}`);
    execSync(`sudo ip tuntap add dev ${tapName} mode tap`);
    execSync(`sudo ip addr add ${hostIP}${MASK} dev ${tapName}`);
    execSync(`sudo ip link set ${tapName} up`);
    console.log(`✅ ${tapName} created and configured with ${hostIP}${MASK}`);
  } catch (error) {
    console.error("❌ Failed to create TAP device:", error.message);
    throw error;
  }
}

module.exports = {
  generateTAPandIP,
  createTAP
};
