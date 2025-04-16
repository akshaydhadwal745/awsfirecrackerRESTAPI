ARCH="$(uname -m)"
release_url="https://github.com/firecracker-microvm/firecracker/releases"
latest_version=$(basename $(curl -fsSLI -o /dev/null -w  %{url_effective} ${release_url}/latest))
CI_VERSION=${latest_version%.*}
latest_kernel_key=$(curl "http://spec.ccfc.min.s3.amazonaws.com/?prefix=firecracker-ci/$CI_VERSION/$ARCH/vmlinux-&list-type=2" \
    | grep -oP "(?<=<Key>)(firecracker-ci/$CI_VERSION/$ARCH/vmlinux-[0-9]+\.[0-9]+\.[0-9]{1,3})(?=</Key>)" \
    | sort -V | tail -1)

# # Download a linux kernel binary
wget "https://s3.amazonaws.com/spec.ccfc.min/${latest_kernel_key}"

latest_ubuntu_key=$(curl "http://spec.ccfc.min.s3.amazonaws.com/?prefix=firecracker-ci/$CI_VERSION/$ARCH/ubuntu-&list-type=2" \
    | grep -oP "(?<=<Key>)(firecracker-ci/$CI_VERSION/$ARCH/ubuntu-[0-9]+\.[0-9]+\.squashfs)(?=</Key>)" \
    | sort -V | tail -1)
ubuntu_version=$(basename $latest_ubuntu_key .sqashfs | grep -oE '[0-9]+\.[0-9]+')

# # Download a rootfs
wget -O ubuntu-$ubuntu_version.squashfs.upstream "https://s3.amazonaws.com/spec.ccfc.min/$latest_ubuntu_key"

# cp firecracker_cli/vmlinux-6.1.102 .
# cp firecracker_cli/ubuntu-24.04.squashfs.upstream .


# Create an ssh key for the rootfs
unsquashfs ubuntu-$ubuntu_version.squashfs.upstream
cp -v /home/sandeep/.ssh/id_rsa.pub squashfs-root/root/.ssh/authorized_keys
cp -v /home/sandeep/.nvm/versions/node/v22.14.0/bin/node squashfs-root/bin
mkdir -p squashfs-root/etc/systemd/network

# Read from command-line args
ADDRESS=${1:-"172.16.0.2/24"}
GATEWAY=${2:-"172.16.0.1"}

cat <<EOF > squashfs-root/etc/systemd/network/eth0.network
[Match]
Name=eth0

[Network]
Address=$ADDRESS
Gateway=$GATEWAY
DNS=8.8.8.8
EOF

# Enable systemd-networkd
ln -sf /lib/systemd/system/systemd-networkd.service squashfs-root/etc/systemd/system/multi-user.target.wants/systemd-networkd.service
# create ext4 filesystem image
sudo chown -R root:root squashfs-root
vm_size="2G"
truncate -s $vm_size ubuntu-$ubuntu_version.ext4
sudo mkfs.ext4 -d squashfs-root -F ubuntu-$ubuntu_version.ext4

# Verify everything was correctly set up and print versions
echo "Kernel: $(ls vmlinux-* | tail -1)"
echo "Rootfs: $(ls *.ext4 | tail -1)"
echo "SSH Key: $(ls *.id_rsa | tail -1)"
echo "SSH Key: /home/sandeep/.ssh/id_rsa"