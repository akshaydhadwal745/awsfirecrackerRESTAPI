const { runCommand } = require('./utils');
const { execSync } = require('child_process');
const fs = require('fs');
const { homedir } = require('os');
const axios = require('axios');
const os = require('os');
const { Client } = require('ssh2');




function setupNetworking(TAP_DEV, TAP_IP ,GUEST_IP, apiSocket) {
  console.log(TAP_DEV,TAP_IP,GUEST_IP)
  const MASK_SHORT = "/30";
  const LOGFILE = "./firecracker.log";
  const API_SOCKET = apiSocket;
  runCommand(`sudo ip link del "${TAP_DEV}" 2> /dev/null || true`)
  runCommand(`sudo ip tuntap add dev "${TAP_DEV}" mode tap`)
  runCommand(`sudo ip addr add "${TAP_IP}${MASK_SHORT}" dev "${TAP_DEV}"`)
  runCommand(`sudo ip link set dev "${TAP_DEV}" up`);
  runCommand(`sudo sh -c "echo 1 > /proc/sys/net/ipv4/ip_forward"`)
  runCommand(`sudo iptables -P FORWARD ACCEPT`)
  const HOST_IFACE = execSync(`ip -j route list default | jq -r '.[0].dev'`).toString().trim();
  runCommand(`sudo iptables -t nat -D POSTROUTING -o "${HOST_IFACE}" -j MASQUERADE || true`)
  runCommand(`sudo iptables -t nat -A POSTROUTING -o "${HOST_IFACE}" -j MASQUERADE`)
  console.log("Done from iptables")


  fs.closeSync(fs.openSync(LOGFILE, 'a')); 
  console.log("File Created");

  const curlCommand = `sudo curl -X PUT --unix-socket ${API_SOCKET} \
      --data "{
          \\"log_path\\": \\"${LOGFILE}\\",
          \\"level\\": \\"Debug\\",
          \\"show_level\\": true,
          \\"show_log_origin\\": true
      }" \
      "http://localhost/logger"`;

  try {
    execSync(curlCommand, { stdio: 'inherit' }); // Run the curl command
    console.log("Logger configuration updated successfully");
  } catch (error) {
    console.error("Error configuring logger:", error);
  }


  // ###################################################
  const KERNEL = execSync('ls vmlinux* | tail -1').toString().trim();
  const KERNEL_BOOT_ARGS = 'console=ttyS0 reboot=k panic=1 pci=off';
  const curlCommandkernel = `sudo curl -X PUT --unix-socket ${API_SOCKET} \
      --data '{
          "kernel_image_path": "${KERNEL}",
          "boot_args": "${KERNEL_BOOT_ARGS}"
      }' \
      "http://localhost/boot-source"`;

  try {
    execSync(curlCommandkernel, { stdio: 'inherit' }); // Run the curl command
    console.log("Boot source configured successfully");
  } catch (error) {
    console.error("Error configuring boot source:", error);
  }


  const ROOTFS = execSync('sudo ls *.ext4 | tail -1').toString().trim();
  console.log(ROOTFS);  // This should give you the ext4 file path

  const curlCommandRootFS = `sudo curl -X PUT --unix-socket ${API_SOCKET} \
      --data '{
          "drive_id": "rootfs",
          "path_on_host": "${ROOTFS}",
          "is_root_device": true,
          "is_read_only": false
      }' \
      "http://localhost/drives/rootfs"`;

  try {
    // Execute the curl command
    execSync(curlCommandRootFS, { stdio: 'inherit' }); // Run the curl command
    console.log("Root filesystem set successfully");
  } catch (error) {
    console.error("Error setting root filesystem:", error);
  }


  const curlCommandMachineConfig = `sudo curl -X PUT --unix-socket ${API_SOCKET} \
      -H "Content-Type: application/json" \
      -d '{
          "vcpu_count": 2,
          "mem_size_mib": 1024,
          "smt": false
      }' \
      "http://localhost/machine-config"`;

  try {
    // Execute the curl command
    execSync(curlCommandMachineConfig, { stdio: 'inherit' }); // Run the curl command
    console.log("Machine configuration set successfully");
  } catch (error) {
    console.error("Error setting machine configuration:", error);
  }

  const FC_MAC="06:00:AC:10:00:02"

  const curlCommandNetworkInterface = `sudo curl -X PUT --unix-socket ${API_SOCKET} \
      --data '{
          "iface_id": "net1",
          "guest_mac": "${FC_MAC}",
          "host_dev_name": "${TAP_DEV}"
      }' \
      "http://localhost/network-interfaces/net1"`;

  try {
    // Execute the curl command
    execSync(curlCommandNetworkInterface, { stdio: 'inherit' }); // Run the curl command
    console.log("Network interface configured successfully");
  } catch (error) {
    console.error("Error configuring network interface:", error);
  }

  runCommand(`sleep 0.015s`)

  const curlCommandInstanceStart = `sudo curl -X PUT --unix-socket ${API_SOCKET} \
      --data '{
          "action_type": "InstanceStart"
      }' \
      "http://localhost/actions"`;

  try {
    // Execute the curl command
    execSync(curlCommandInstanceStart, { stdio: 'inherit' }); // Run the curl command
    console.log("Instance start action executed successfully");
  } catch (error) {
    console.error("Error executing instance start action:", error);
  }

  runCommand(`sleep 5s`)


  // Get the SSH key file (assuming it's an id_rsa file)
  const KEY_NAME = "/home/sandeep/.ssh/id_rsa"

  // Create a new SSH client
  const conn = new Client();
  
  // Setup networking inside the VM using SSH
  conn.on('ready', () => {
    console.log('SSH Connection established');
  
    // Execute the first command
    conn.exec(`ip route add default via ${TAP_IP} dev eth0`, (err, stream) => {
      if (err) {
        console.error('Error executing route command:', err);
        return;
      }
    
      stream.on('close', (code, signal) => {
        if (code === 0) {
          console.log('Default route added inside VM');
        }
        // Now execute the second command
        conn.exec("echo 'nameserver 8.8.8.8' > /etc/resolv.conf", (err, stream) => {
          if (err) {
            console.error('Error executing DNS update command:', err);
            return;
          }
        
          stream.on('close', (code, signal) => {
            if (code === 0) {
              console.log("DNS nameserver updated inside VM");
            }
            conn.end(); // End the SSH connection
          });
        });
      });
    });
  }).on('error', (err) => {
    console.error('SSH connection error:', err);
  }).connect({
    host: GUEST_IP,
    port: 22,
    username: 'root',
    privateKey: fs.readFileSync(KEY_NAME), // Path to the SSH private key
  });
  
  return { TAP_DEV,TAP_IP,GUEST_IP }
}


module.exports = { setupNetworking  };
