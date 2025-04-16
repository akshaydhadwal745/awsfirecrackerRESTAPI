const { runCommand } = require('./utils');
const { Client } = require('ssh2');
const fs = require('fs');
const { execSync } = require('child_process');


const LOGFILE = "./firecracker.log";
const TAP_DEV = "tap0";

function shutdown(dev_inf,apiSocket) {
  const API_SOCKET = apiSocket
  const DEV_INTERFACE = dev_inf
  try {
    console.log("🛑 Shutting down MicroVM...");

    // Stop networking and VM processes
    // const KEY_NAME = "/home/sandeep/.ssh/id_rsa";
    // // Create a new SSH client
    // const conn = new Client();

    // // Connect to the remote machine and reboot
    // conn.on('ready', () => {
    //   console.log('SSH Connection established');
    
    //   // Execute the reboot command
    //   conn.exec('reboot', (err, stream) => {
    //     if (err) {
    //       console.error('Error executing reboot command:', err);
    //       return;
    //     }
      
    //     stream.on('close', (code, signal) => {
    //       if (code === 0) {
    //         console.log('Reboot command executed successfully');
    //       }
    //       conn.end(); // End the SSH connection
    //     });
    //   });
    // }).on('error', (err) => {
    //   // console.error('SSH connection error:', err);
    // }).connect({
    //   host: '172.16.0.2',
    //   port: 22,
    //   username: 'root',
    //   privateKey: fs.readFileSync(KEY_NAME), // Path to the SSH private key
    // });

    runCommand(`sudo ip link del ${ DEV_INTERFACE } 2>/dev/null`)
    runCommand(`sudo pkill  -9 firecracker 2>/dev/null`)
    // Remove Firecracker socket if it exists (use sudo)
    if (fs.existsSync(API_SOCKET)) {
      execSync(`sudo rm -f ${API_SOCKET}`);
      console.log("🧹 Deleted Firecracker API socket");
    }

    console.log("✅ MicroVM shutdown complete.");
  } catch (err) {
    console.error("❌ Failed to shutdown MicroVM:", err.message);
  }
}

module.exports = { shutdown };
