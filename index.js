const express = require('express');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const axios = require('axios');
const { setupNetworking } = require('./firecracker');
const { startFirecracker } = require('./start-firecracker'); 
const { shutdown } = require( './microvmkiller' )
// const { Client } = require('ssh2');
const { NodeSSH } = require('node-ssh');
const unixDgram = require('unix-dgram');
const { generateTAPandIP } = require('./networkAllocator');
const { runCommand } = require('./utils');


const app = express();
const PORT = 8000;
app.use(express.json());



app.post('/start-vm', async (req, res) => {
  try {
    console.log('🔥 Starting a new MicroVM instance...');

    const { tapName: TAP_DEV, hostIP: TAP_IP, guestIP: GUEST_IP } = generateTAPandIP();
    console.log(GUEST_IP,TAP_IP)
    // Use the TAP_IP and GUEST_IP variables in the command
    runCommand(`bash setup.bash ${GUEST_IP}/24 ${TAP_IP}`);
    
    const firecrackerInfo = startFirecracker();

    if (!firecrackerInfo) {
      return res.status(500).json({ error: 'Failed to start Firecracker' });
    }

    const { apiSocket, vmId, logFile } = firecrackerInfo;
 
    // Wait briefly for socket to become available
    await new Promise(resolve => setTimeout(resolve, 1000));

    const {  setupResult } = setupNetworking( TAP_DEV, TAP_IP ,GUEST_IP, apiSocket ); // 👈 Pass the socket path
    
    runCommand(`bash cleanup.bash`);
    res.json({
      message: 'MicroVM started successfully!',
      vmId,
      apiSocket,
      logFile,
      TAP_DEV,
      TAP_IP,
      GUEST_IP,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Error starting MicroVM'
    });
  }
});

// Define the socket path
const unixSocketPath = '/tmp/firecracker.socket';

app.post('/pause-vm', (req, res) => {
  const { apiSocket } = req.body;

  if (!apiSocket) {
    return res.status(400).send('❌ Missing apiSocket in request body');
  }

  try {
    const pauseCmd = `sudo curl --unix-socket ${apiSocket} -i -X PATCH http://localhost/vm -d '{ "state": "Paused" }'`;
    execSync(pauseCmd);
    console.log('⏸️ VM paused successfully');
    res.send('✅ VM paused successfully');
  } catch (err) {
    console.error('❌ Failed to pause VM:', err.message);
    res.status(500).send('Error pausing VM');
  }
});

app.post('/resume-vm', (req, res) => {
  const { apiSocket } = req.body;

  if (!apiSocket) {
    return res.status(400).send('❌ Missing apiSocket in request body');
  }

  try {
    const resumeCmd = `sudo curl --unix-socket ${apiSocket} -i -X PATCH http://localhost/vm -d '{ "state": "Resumed" }'`;
    execSync(resumeCmd);
    console.log('▶️ VM resumed successfully');
    res.send('✅ VM resumed successfully');
  } catch (err) {
    console.error('❌ Failed to resume VM:', err.message);
    res.status(500).send('Error resuming VM');
  }
});

app.post('/delete-vm', (req, res) => {
  try {
    const { dev_inf,apiSocket } = req.body;

    if (!apiSocket) {
      return res.status(400).send('❌ Missing apiSocket in request body');
    }

    shutdown(dev_inf,apiSocket); // 👈 Pass the socket path to shutdown function

    res.send(`🧹 VM using socket ${apiSocket} deleted successfully`);
  } catch (err) {
    console.error('❌ Failed to delete VM:', err.message);
    res.status(500).send('Error deleting VM');
  }
});


async function runCommandOnVM(guest_ip, command) {

    const VM_SSH_HOST = guest_ip;
    console.log(guest_ip)
    const VM_SSH_PORT = 22;
    const VM_SSH_USER = 'root';
    const PRIVATE_KEY_PATH = "/home/sandeep/.ssh/id_rsa"
    const ssh = new NodeSSH();
  
    try {
      const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
      console.log('🔐 Private key loaded successfully');
  
      await ssh.connect({
        host: VM_SSH_HOST,
        port: VM_SSH_PORT,
        username: VM_SSH_USER,
        privateKey,
      });
  
      console.log(`✅ Connected to ${VM_SSH_HOST}, running: ${command}`);
  
      const result = await ssh.execCommand(command);
      ssh.dispose();
  
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      console.error('❌ SSH connection error:', error);
      return {
        success: false,
        error: `Unable to connect to the VM. Reason: ${error.message}`,
      };
    }
  }

  app.post('/run-command', async (req, res) => {
    let { command, type, guest_ip  } = req.body;
  
    if (!command) {
      return res.status(400).json({ success: false, error: 'Command is required' });
    }
  
    if (!type || (type !== 'shell' && type !== 'nodejs')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Type must be either "shell" or "nodejs"' 
      });
    }
  
    // Properly escape and wrap nodejs commands
    if (type === 'nodejs' && !command.trim().startsWith('node -e')) {
      // Escape backslashes, double quotes, and other characters for safe shell execution
      const escaped = command
        .replace(/\\/g, '\\\\')   // Escape backslashes
        .replace(/"/g, '\\"');     // Escape double quotes
    
      // Wrap command in bash -c with double quotes and escaped inner quotes
      command = `bash -c "node -e \\"${escaped}\\""`
    }
  
    console.log(`🧾 Final command to run: "${command}"`);
  
    const result = await runCommandOnVM(guest_ip, command);
    res.json(result);
  });

app.listen(PORT, () => {
  console.log(`🔥 VM API running at http://localhost:${PORT}`);
});
