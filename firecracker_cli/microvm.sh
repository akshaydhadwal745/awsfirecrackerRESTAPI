ARCH="$(uname -m)"
release_url="https://github.com/firecracker-microvm/firecracker/releases"
latest_version=$(basename $(curl -fsSLI -o /dev/null -w  %{url_effective} ${release_url}/latest))
CI_VERSION=${latest_version%.*}
latest_kernel_key=$(curl "http://spec.ccfc.min.s3.amazonaws.com/?prefix=firecracker-ci/$CI_VERSION/$ARCH/vmlinux-&list-type=2" \
    | grep -oP "(?<=<Key>)(firecracker-ci/$CI_VERSION/$ARCH/vmlinux-[0-9]+\.[0-9]+\.[0-9]{1,3})(?=</Key>)" \
    | sort -V | tail -1)

# Download a linux kernel binary
wget "https://s3.amazonaws.com/spec.ccfc.min/${latest_kernel_key}"

latest_ubuntu_key=$(curl "http://spec.ccfc.min.s3.amazonaws.com/?prefix=firecracker-ci/$CI_VERSION/$ARCH/ubuntu-&list-type=2" \
    | grep -oP "(?<=<Key>)(firecracker-ci/$CI_VERSION/$ARCH/ubuntu-[0-9]+\.[0-9]+\.squashfs)(?=</Key>)" \
    | sort -V | tail -1)
ubuntu_version=$(basename $latest_ubuntu_key .sqashfs | grep -oE '[0-9]+\.[0-9]+')

# Download a rootfs
wget -O ubuntu-$ubuntu_version.squashfs.upstream "https://s3.amazonaws.com/spec.ccfc.min/$latest_ubuntu_key"

# Create an ssh key for the rootfs
unsquashfs ubuntu-$ubuntu_version.squashfs.upstream
ssh-keygen -f id_rsa -N ""
cp -v id_rsa.pub squashfs-root/root/.ssh/authorized_keys
cp -v /home/sandeep/.nvm/versions/node/v22.14.0/bin/node squashfs-root/bin
mkdir -p squashfs-root/etc/systemd/network

cat <<EOF > squashfs-root/etc/systemd/network/eth0.network
[Match]
Name=eth0

[Network]
Address=172.16.0.6/24
Gateway=172.16.0.1
DNS=8.8.8.8
EOF

# Enable systemd-networkd
ln -sf /lib/systemd/system/systemd-networkd.service squashfs-root/etc/systemd/system/multi-user.target.wants/systemd-networkd.service
mv -v id_rsa ./ubuntu-$ubuntu_version.id_rsa
# create ext4 filesystem image
sudo chown -R root:root squashfs-root
vm_size="2G"
truncate -s $vm_size ubuntu-$ubuntu_version.ext4
sudo mkfs.ext4 -d squashfs-root -F ubuntu-$ubuntu_version.ext4

# Verify everything was correctly set up and print versions
echo "Kernel: $(ls vmlinux-* | tail -1)"
echo "Rootfs: $(ls *.ext4 | tail -1)"
echo "SSH Key: $(ls *.id_rsa | tail -1)"





=============================================================================================

#Install Firecracker Binary
ARCH="$(uname -m)"
release_url="https://github.com/firecracker-microvm/firecracker/releases"
latest=$(basename $(curl -fsSLI -o /dev/null -w  %{url_effective} ${release_url}/latest))
curl -L ${release_url}/download/${latest}/firecracker-${latest}-${ARCH}.tgz \
| tar -xz

# Rename the binary to "firecracker"
mv release-${latest}-$(uname -m)/firecracker-${latest}-${ARCH} firecracker


=============================================================================================


=============================================================================================

#Start Firecracker Socket
#we can setup multiple socket for differenct micro vm with different code executions
API_SOCKET="/tmp/firecracker.socket"

# Remove API unix socket
sudo rm -f $API_SOCKET

# Run firecracker
sudo ./firecracker_cli/firecracker --api-sock "${API_SOCKET}"

=============================================================================================





TAP_DEV="tap0"
#172.19.0.1/24 172.19.0.1
TAP_IP="172.19.0.1"
MASK_SHORT="/24"

# Setup network interface
sudo ip link del "$TAP_DEV" 2> /dev/null || true
sudo ip tuntap add dev "$TAP_DEV" mode tap
sudo ip addr add "${TAP_IP}${MASK_SHORT}" dev "$TAP_DEV"
sudo ip link set dev "$TAP_DEV" up

# Enable ip forwarding
sudo sh -c "echo 1 > /proc/sys/net/ipv4/ip_forward"
sudo iptables -P FORWARD ACCEPT

# Get host interface
HOST_IFACE=$(ip -j route list default | jq -r '.[0].dev')

# Setup outbound internet
sudo iptables -t nat -D POSTROUTING -o "$HOST_IFACE" -j MASQUERADE || true
sudo iptables -t nat -A POSTROUTING -o "$HOST_IFACE" -j MASQUERADE

API_SOCKET="/tmp/firecracker.socket"
LOGFILE="./firecracker.log"

# Create log file
touch $LOGFILE

# Set Firecracker logger
sudo curl -X PUT --unix-socket "${API_SOCKET}" \
    --data "{
        \"log_path\": \"${LOGFILE}\",
        \"level\": \"Debug\",
        \"show_level\": true,
        \"show_log_origin\": true
    }" \
    "http://localhost/logger"

KERNEL="./$(ls vmlinux* | tail -1)"
KERNEL_BOOT_ARGS="console=ttyS0 reboot=k panic=1 pci=off"

ARCH=$(uname -m)
if [ ${ARCH} = "aarch64" ]; then
    KERNEL_BOOT_ARGS="keep_bootcon ${KERNEL_BOOT_ARGS}"
fi

# Set boot source
sudo curl -X PUT --unix-socket "${API_SOCKET}" \
    --data "{
        \"kernel_image_path\": \"${KERNEL}\",
        \"boot_args\": \"${KERNEL_BOOT_ARGS}\"
    }" \
    "http://localhost/boot-source"

ROOTFS="./$(ls *.ext4 | tail -1)"

# Set rootfs
sudo curl -X PUT --unix-socket "${API_SOCKET}" \
    --data "{
        \"drive_id\": \"rootfs\",
        \"path_on_host\": \"${ROOTFS}\",
        \"is_root_device\": true,
        \"is_read_only\": false
    }" \
    "http://localhost/drives/rootfs"

# Set machine config: 2 vCPUs and 1GB RAM
sudo curl -X PUT --unix-socket "${API_SOCKET}" \
    -H "Content-Type: application/json" \
    -d '{
        "vcpu_count": 2,
        "mem_size_mib": 1024,
        "smt": false
    }' \
    "http://localhost/machine-config"

FC_MAC="06:00:AC:10:00:02"

#If we want to create a random mac we can use below
#FC_MAC="06:00:AC:10:00:$(printf '%02x' $((RANDOM%256))):$(printf '%02x' $((RANDOM%256)))"


# Set network interface
sudo curl -X PUT --unix-socket "${API_SOCKET}" \
    --data "{
        \"iface_id\": \"net1\",
        \"guest_mac\": \"$FC_MAC\",
        \"host_dev_name\": \"$TAP_DEV\"
    }" \
    "http://localhost/network-interfaces/net1"

# Small wait to ensure configs are written
sleep 0.015s

# 🚀 Start microVM
sudo curl -X PUT --unix-socket "${API_SOCKET}" \
    --data "{
        \"action_type\": \"InstanceStart\"
    }" \
    "http://localhost/actions"


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
sleep 2s

KEY_NAME=./$(ls *.id_rsa | tail -1)

# Setup networking inside VM
# ssh -i $KEY_NAME root@172.16.0.6  "ip route add default via 172.16.0.1 dev eth0"
# ssh -i $KEY_NAME root@172.19.0.2  "echo 'nameserver 8.8.8.8' > /etc/resolv.conf"
#We can run command like below if we want to install this something
#ssh -i $KEY_NAME root@172.16.0.2  