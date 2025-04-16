
# TAP_DEV="tap0"
# TAP_IP="172.16.0.1"
# MASK_SHORT="/30"

# # # Setup network interface
# # sudo ip link del "$TAP_DEV" 2> /dev/null || true
# # sudo ip tuntap add dev "$TAP_DEV" mode tap
# # sudo ip addr add "${TAP_IP}${MASK_SHORT}" dev "$TAP_DEV"
# # sudo ip link set dev "$TAP_DEV" up

# # Enable ip forwarding
# # sudo sh -c "echo 1 > /proc/sys/net/ipv4/ip_forward"
# # sudo iptables -P FORWARD ACCEPT

# # Get host interface
# # HOST_IFACE=$(ip -j route list default | jq -r '.[0].dev')

# # Setup outbound internet
# # sudo iptables -t nat -D POSTROUTING -o "$HOST_IFACE" -j MASQUERADE || true
# # sudo iptables -t nat -A POSTROUTING -o "$HOST_IFACE" -j MASQUERADE

# API_SOCKET="/tmp/firecracker.socket"
# # LOGFILE="./firecracker.log"

# # Create log file
# touch $LOGFILE

# Set Firecracker logger
# sudo curl -X PUT --unix-socket "${API_SOCKET}" \
#     --data "{
#         \"log_path\": \"${LOGFILE}\",
#         \"level\": \"Debug\",
#         \"show_level\": true,
#         \"show_log_origin\": true
#     }" \
#     "http://localhost/logger"

# KERNEL="./$(ls vmlinux* | tail -1)"
# KERNEL_BOOT_ARGS="console=ttyS0 reboot=k panic=1 pci=off"

# ARCH=$(uname -m)
# if [ ${ARCH} = "aarch64" ]; then
#     KERNEL_BOOT_ARGS="keep_bootcon ${KERNEL_BOOT_ARGS}"
# fi

# # Set boot source
# sudo curl -X PUT --unix-socket "${API_SOCKET}" \
#     --data "{
#         \"kernel_image_path\": \"${KERNEL}\",
#         \"boot_args\": \"${KERNEL_BOOT_ARGS}\"
#     }" \
#     "http://localhost/boot-source"

# ROOTFS="./$(ls *.ext4 | tail -1)"

# # Set rootfs
# sudo curl -X PUT --unix-socket "${API_SOCKET}" \
#     --data "{
#         \"drive_id\": \"rootfs\",
#         \"path_on_host\": \"${ROOTFS}\",
#         \"is_root_device\": true,
#         \"is_read_only\": false
#     }" \
#     "http://localhost/drives/rootfs"

# ✅ Set machine config: 2 vCPUs and 1GB RAM
# sudo curl -X PUT --unix-socket "${API_SOCKET}" \
#     -H "Content-Type: application/json" \
#     -d '{
#         "vcpu_count": 2,
#         "mem_size_mib": 1024,
#         "smt": false
#     }' \
#     "http://localhost/machine-config"

# FC_MAC="06:00:AC:10:00:02"

#If we want to create a random mac we can use below
#FC_MAC="06:00:AC:10:00:$(printf '%02x' $((RANDOM%256))):$(printf '%02x' $((RANDOM%256)))"


# Set network interface
# sudo curl -X PUT --unix-socket "${API_SOCKET}" \
#     --data "{
#         \"iface_id\": \"net1\",
#         \"guest_mac\": \"$FC_MAC\",
#         \"host_dev_name\": \"$TAP_DEV\"
#     }" \
#     "http://localhost/network-interfaces/net1"

# Small wait to ensure configs are written
# sleep 0.015s

# 🚀 Start microVM
# sudo curl -X PUT --unix-socket "${API_SOCKET}" \
#     --data "{
#         \"action_type\": \"InstanceStart\"
#     }" \
#     "http://localhost/actions"


#Pause current running vm
# sudo curl --unix-socket ${API_SOCKET} -i \
#     -X PATCH 'http://localhost/vm' \
#     -d '{
#             "state": "Paused"
#     }'

# #Resume paused VM
# sudo curl --unix-socket ${API_SOCKET} -i \
#     -X PATCH 'http://localhost/vm' \
#     -d '{
#             "state": "Resumed"
#     }'

# Wait for VM to boot
# sleep 2s

# KEY_NAME=./$(ls *.id_rsa | tail -1)

# Setup networking inside VM
# ssh -i $KEY_NAME root@172.16.0.2  "ip route add default via 172.16.0.1 dev eth0"
# ssh -i $KEY_NAME root@172.16.0.2  "echo 'nameserver 8.8.8.8' > /etc/resolv.conf"
#We can run command like below if we want to install this something
#ssh -i $KEY_NAME root@172.16.0.2  "apt-get update && apt-get install -y npm nodejs"

# # 🖥️ SSH into the microVM
# ssh -i $KEY_NAME root@172.16.0.2
