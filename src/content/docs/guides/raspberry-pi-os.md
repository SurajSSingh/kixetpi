---
title: 1. Start with Raspberry Pi OS Lite
description: Choose the base image, establish recoverable access, update it, and record an unchanged Raspberry Pi OS baseline.
---

Start with the official Raspberry Pi OS Lite image. Lite has no desktop environment, so there is no desktop stack to remove before you begin. Keep its kernel, firmware, hardware integration, and package repositories throughout the guide.

:::caution[Untested walkthrough]
This is a proposed procedure for a separate test Pi. No hardware has completed it yet. Commands below run on the Pi unless their title explicitly names the administration computer. Do not apply them to the computer hosting this documentation site.
:::

## 1. Choose the hardware and image

The initial target is Raspberry Pi OS Lite based on Debian 13, Trixie. The official documentation identifies Bookworm as the previous release. Check what Raspberry Pi Imager actually offers when you run the guide; do not replace release names in APT files to make an older installation match.

A Pi 4 with at least 2 GB of RAM and the 64-bit Lite image is the proposed first test target, not an upstream minimum requirement. Earlier or smaller boards are still relevant, but need their own results. Use a reliable power supply, adequate cooling, and a healthy card. Resource tuning will not fix undervoltage or failing storage.

| Hardware or installation | Route through this guide |
| --- | --- |
| Pi 1 or original Pi Zero / Zero W | Use the compatible 32-bit Lite image offered by Imager. Test stages 1 to 3. Skip this guide's Nix path. |
| Pi 2 | Select the exact model in Imager and use its compatible image. Revisions differ; do not infer OS support from the family name alone. |
| Pi Zero 2 W or another small-memory 64-bit-capable Pi | Select a compatible image. A 64-bit CPU does not remove the RAM and storage costs of Nix. Begin with the APT-only path. |
| Compatible Pi with a 64-bit Lite installation | Test stages 1 to 3 first. Stage 4 is optional and requires a 64-bit userspace as well as a suitable kernel. |
| 32-bit userspace on a 64-bit kernel | Treat it as the 32-bit path. `uname -m` alone does not establish Nix compatibility. |

Raspberry Pi OS's 32-bit and 64-bit editions do not have interchangeable package archives. The 32-bit edition uses Raspbian packages; the 64-bit edition uses Debian packages. Both retain Raspberry Pi's own packages. Do not add generic Debian ARM repositories to the 32-bit image to obtain missing software.

Use [Raspberry Pi OS downloads](https://www.raspberrypi.com/software/operating-systems/) and [the official getting-started guide](https://www.raspberrypi.com/documentation/computers/getting-started.html). Record the chosen image's name, architecture, release date, and published checksum if you download an image manually. Use the upstream checksum verification instructions rather than a checksum from an unrelated mirror.

## 2. Prepare recovery before first boot

Have these ready:

- A test microSD card or other supported boot medium that can be erased. Keep valuable data elsewhere.
- Another computer for imaging and SSH, with access to the same trusted local network.
- A keyboard and display, or an already working serial console, for recovery when networking fails.
- A spare known-good boot card and a place outside the Pi to keep a full-card backup and your walkthrough notes.

Do not forward SSH from the internet or expose a fresh test installation publicly. An ordinary home-network trial is the scope of this guide.

For a concrete recovery route in this first walkthrough, prepare two cards. Complete this base guide on the first, confirm it boots and accepts SSH, then shut down, remove it, and label it as the known-good baseline. Keep that card unchanged. Repeat the base setup on the second card and use that one for the later experiments. If the test system stops booting, power off and boot the preserved card. Verify each card's SSH host fingerprint when switching; do not run two devices with the same hostname at once.

That spare restores a working base, not later application data or configuration. Keep walkthrough notes and important files outside the test card so you can rebuild deliberately. Raspberry Pi Imager's cited procedure writes and verifies images; it is not a card-backup procedure. If you need an exact snapshot of a later stage, choose a whole-device backup and restore tool documented for your administration computer, image the card while the Pi is shut down, and test restoration onto a spare before relying on it. This guide does not prescribe a universal disk-copy command or claim that backup capture has been tested.

## 3. Flash Lite with Raspberry Pi Imager

Perform this step on the administration computer, following [Raspberry Pi's installation documentation](https://www.raspberrypi.com/documentation/computers/getting-started.html#install).

1. Select the actual Pi model, then the compatible Raspberry Pi OS Lite edition. Do not select the desktop, DietPi, or Kicksecure image.
2. Select the intended removable storage. Imaging erases it. Confirm the device and capacity before writing.
3. Set a unique hostname and create your own username. This guide does not assume a default `pi` user or password.
4. Set a strong local account password for console and sudo recovery. Configure the locale, time zone, and correct wireless country if using Wi-Fi.
5. For a headless Pi, enable SSH and select public-key authentication. Provide only your public key. Keep the private key on the administration computer.
6. Configure Wi-Fi if needed, or use Ethernet for the first boot. Check your model's supported Wi-Fi bands.
7. Write the image, allow verification to complete, and eject the card safely.

If you do not yet have an SSH key, create one on the administration computer:

```sh title="Administration computer: create a separate SSH key if needed"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/kixetpi_ed25519
```

Use a passphrase and do not overwrite an existing key. Give Imager the contents of `~/.ssh/kixetpi_ed25519.pub`, not the private file without `.pub`. A local password remains useful even when SSH accepts only keys.

Use Imager's current customization interface rather than older tutorials that copy `wpa_supplicant.conf` into the boot partition. Image releases differ in how they configure networking and first-boot users.

## 4. Boot and prove access

Insert the card and power on the Pi. Allow first-boot setup to finish. Find its address in your router's client list or at the local console. A hostname such as `kixetpi.local` may work when your network supports multicast DNS, but it is not guaranteed.

Replace `YOUR_USER` and `YOUR_PI` with the account you created and the Pi's hostname or IP address:

```sh title="Administration computer: connect with your key"
ssh -S none -i ~/.ssh/kixetpi_ed25519 YOUR_USER@YOUR_PI
```

If you used an existing key, give its actual path instead. On the first connection, compare the server's displayed host-key fingerprint with the Pi's local console before accepting it. For its Ed25519 host key, the console command is:

```sh title="Pi local console: show the server host-key fingerprint"
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Do not bypass a changed-host-key warning automatically. A deliberate re-image changes host keys, but a different device or interception can also cause that warning. Verify the new fingerprint before removing an old known-hosts entry.

In the SSH session, check the account, network, clock, and administrator access:

```sh title="Pi: check the first login"
whoami
hostnamectl
ip -br address
ip route
timedatectl status
sudo -v
```

Correct a wrong clock, missing network route, or failed sudo access before continuing. Keep time synchronization enabled because package verification, TLS, and useful logs depend on a sensible clock. If SSH fails, use the console to check the username, address, and `systemctl status ssh`; do not weaken authentication to guess at a fix.

## 5. Confirm the release and update normally

Record the actual installation, including the difference between kernel and userspace architecture:

```sh title="Pi: identify the installed base"
cat /etc/os-release
cat /proc/device-tree/model
uname -m
uname -r
dpkg --print-architecture
getconf LONG_BIT
apt-cache policy
```

For the proposed 64-bit path, expect `arm64` from `dpkg`, `64` from `getconf`, and `aarch64` from `uname -m`. A 32-bit installation commonly reports `armhf` from `dpkg`. Record its actual kernel result rather than assuming it is also 32-bit. If the release is not Trixie, stop and reconcile version-specific instructions before making changes.

Review the image's files in `/etc/apt/sources.list.d/` and any `/etc/apt/sources.list`. Current Raspberry Pi documentation describes `debian.sources` for 64-bit or `raspbian.sources` for 32-bit, plus `raspi.sources`. Older images may use `.list` files. Record what is present; do not rename files or rewrite origins to match an example.

Follow Raspberry Pi's normal update procedure:

```sh title="Pi: refresh package metadata"
sudo apt update
```

Resolve any signature, repository, clock, or network errors before continuing. Do not add `trusted=yes`, disable signature checks, or change distributions to work around an error.

```sh title="Pi: review the upgrade before applying it"
apt list --upgradable
sudo apt-get -s full-upgrade
```

Review removals as well as new packages. Stop if an unexpected plan removes boot, networking, or remote-access components. Then apply the normal upgrade interactively:

```sh title="Pi: apply the reviewed update"
sudo apt full-upgrade
```

Wait for successful completion. Reboot separately, not while APT is still running:

```sh title="Pi: reboot after a successful update"
sudo reboot
```

Reconnect, confirm `uname -r`, and check `systemctl --failed`. Raspberry Pi's APT updates include its kernel and stable firmware. Do not use `rpi-update` as a routine updater. For a major OS release change, prefer a fresh image and restore your data rather than editing release names in repository files.

## 6. Record an unchanged baseline

Before any DietPi-inspired changes, collect the following output and keep a copy with your [walkthrough record](/#record-the-first-hardware-walkthrough) outside the card:

```sh title="Pi: capture the baseline"
free -h
swapon --show
df -h / /boot/firmware
systemd-analyze
systemctl --failed
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service --state=enabled
systemctl list-timers --all
sudo ss -lntup
sudo journalctl --disk-usage
sudo journalctl -b -p warning --no-pager
apt-mark showmanual
dpkg-query -W -f='${binary:Package}\t${Version}\n'
```

The current image normally mounts boot files at `/boot/firmware`. If that path is absent, record the actual mount layout and investigate the image version rather than creating the directory. A missing swap device is an observation, not a command to add one immediately.

Some warnings can be expected for unused hardware. Read them and record explanations instead of requiring an empty journal. In the port list, identify every listening service and whether it binds only to loopback or to a network interface.

Run the workload you intend to keep, and note its memory use and responsiveness. If you do not have an application yet, record that this is only an idle baseline. Do not compare an idle measurement with a later loaded system.

## Checkpoint and troubleshooting

Before the next stage, confirm all of the following:

- The Pi boots and accepts a new SSH key login after a reboot.
- The normal account has working sudo and local-console access.
- APT updates complete without repository or signature errors.
- Networking, DNS, and time synchronization work.
- The baseline identifies the image, architecture, running services, and listening ports.
- You have a known-good recovery card or a full backup whose restore you have checked.

| Symptom | What to check first |
| --- | --- |
| No boot or repeated resets. | Power supply, card integrity, model/image compatibility, and console messages. Do not start removing services. |
| `.local` cannot be resolved. | Use the router's recorded IP address, then investigate multicast DNS support. |
| SSH refuses the key. | Username, selected public key, private key path, and `sudo journalctl -u ssh -b` from the console. |
| Package downloads fail. | Clock, route, DNS, free space, and the original image's repository configuration. |
| Unexpected release or architecture. | Re-image with the intended compatible Lite image. Do not convert the running userspace in place. |
| An upgrade no longer boots. | Boot the known-good card and preserve logs or data from the failed card before re-imaging. |

Preserve the verified baseline card or a restore-tested full-card image after these checks. Continue on the separate test card to [DietPi-inspired reduction](/guides/dietpi/).

## Sources and review status

Reviewed on 26 September 2026. Upstream documents the individual operations; the combined KixetPi walkthrough remains untested.

- [Official Raspberry Pi OS images](https://www.raspberrypi.com/software/operating-systems/).
- [Raspberry Pi installation and first boot](https://www.raspberrypi.com/documentation/computers/getting-started.html).
- [Raspberry Pi OS documentation and updates](https://www.raspberrypi.com/documentation/computers/os.html).
- [Raspberry Pi SSH and public-key access](https://www.raspberrypi.com/documentation/computers/remote-access.html#ssh).
- [Upstream OS introduction source](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/os/rpi-os-introduction.adoc), [package source definitions](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/software-sources.adoc), and [update instructions](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/os/updating.adoc).
