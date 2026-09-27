---
title: 2. Adapt DietPi's lean-system practices
description: Audit and reduce Raspberry Pi OS Lite without converting it to DietPi or sacrificing updates and useful logs.
---

Keep Raspberry Pi OS Lite and make only the reductions your workload supports. DietPi provides the model of a small base with deliberately selected services. Its management tools assume a DietPi installation and are not an add-on for Raspberry Pi OS.

:::caution[Untested integration]
Complete the [base setup](/guides/raspberry-pi-os/) and its backup checkpoint first. All commands here run on the test Pi. No savings have been measured, and there is no target package count or RAM figure.
:::

## What transfers and what does not

| DietPi practice | Adaptation in this guide |
| --- | --- |
| Select software for the machine's purpose. | Review installed packages and removal plans with APT. |
| Control optional background services. | Use Raspberry Pi OS's own systemd units, one at a time. |
| Reduce storage writes and log size. | Keep persistent journals with a reviewed storage budget. Do not copy RAMlog. |
| Tune swap and memory for small boards. | Measure the stock setup first. Defer changes until there is evidence of a problem. |
| DietPi installers and `dietpi-*` tools. | Do not install or run them on this base. |

The [DietPi installer documentation](https://dietpi.com/docs/hardware/#make-your-own-distribution) warns that its conversion deletes existing APT software and user data. Do not run `dietpi-installer`, add DietPi repositories, or copy `/boot/dietpi.txt` and its scripts into Raspberry Pi OS. We are borrowing operating practices, not performing that conversion.

## 1. Define the workload and measure

Write down what this Pi must do. Include SSH, Wi-Fi or Ethernet, name resolution, time synchronization, storage mounts, attached devices, and the actual application. A service is not unnecessary just because its name is unfamiliar.

On the Pi, record the output before changing anything:

```sh title="Pi: inspect resource use and active services"
free -h
swapon --show
df -h /
systemd-analyze
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service --state=enabled
systemctl list-sockets --all
systemctl list-timers --all
sudo ss -lntup
sudo journalctl --disk-usage
apt-mark showmanual
```

Use `available` memory rather than treating all filesystem cache as wasted RAM. Repeat measurements after a reboot, after the same idle interval, and during the same workload. A long boot-time service is not necessarily a large idle-memory consumer.

Keep these parts unless a separate, tested replacement exists:

- The active network manager, DHCP client, DNS resolver, Wi-Fi components, and remote-access service.
- APT update timers, certificate authorities, and time synchronization.
- Logging, `systemd-logind`, D-Bus, device management, and required storage services.
- Raspberry Pi kernel, firmware, boot, and hardware-support packages.

Do not disable security mitigations, logging, or updates to improve an idle-memory number.

## 2. Trial one unused service

[DietPi-Services](https://dietpi.com/docs/dietpi_tools/system_configuration/#dietpi-services) manages services selectively. Use the same restraint with systemd on Raspberry Pi OS.

This example applies only if `bluetooth.service` exists and the Pi does not use Bluetooth peripherals, networking, or its recovery keyboard. If it is absent or needed, skip the example. Do not replace it with an arbitrary core service.

```sh title="Pi: inspect the example service"
systemctl status bluetooth.service --no-pager
systemctl is-enabled bluetooth.service
systemctl is-active bluetooth.service
systemctl cat bluetooth.service
systemctl list-dependencies --reverse bluetooth.service
```

Record whether it was enabled and active. A nonzero result from `is-enabled` or `is-active` can mean disabled or inactive rather than a broken system. Inspect any associated sockets and timers in the inventory. Dependencies alone do not describe every application that might need Bluetooth.

If it is running and unused, stop it for this boot:

```sh title="Pi: temporary trial"
sudo systemctl stop bluetooth.service
```

Test the workload and recovery input devices. If something breaks, restore the prior running state:

```sh title="Pi: undo the temporary stop"
sudo systemctl start bluetooth.service
```

Only after a successful trial, and only if it was enabled before, disable its automatic start:

```sh title="Pi: keep the successful change across boots"
sudo systemctl disable bluetooth.service
sudo reboot
```

Reconnect and inspect its state and the workload again. Disabling a unit is not the same as masking it; dependencies or activation can still start it. Investigate rather than adding a blanket mask. To restore a service that was originally enabled and running:

```sh title="Pi: restore the recorded original state"
sudo systemctl enable --now bluetooth.service
```

Do not disable Avahi casually. It may provide the `.local` hostname you use for SSH and service discovery. An IP-based login and a deliberate replacement for discovery would be prerequisites to removing it.

## 3. Review package removal without a bulk purge

Stopping a service and removing its package are separate decisions. Removing a package may save disk space without changing RAM use. APT can remove dependent packages too.

Review candidates and the automatic-removal proposal without applying it:

```sh title="Pi: inspect packages and simulate cleanup"
apt list --installed
sudo apt-get -s autoremove
```

For one known, unused package, replace `PACKAGE_NAME` in the following commands with its actual APT name:

```sh title="Pi: inspect one removal candidate"
apt-cache policy PACKAGE_NAME
apt-cache depends PACKAGE_NAME
apt-cache rdepends --installed PACKAGE_NAME
sudo apt-get -s remove PACKAGE_NAME
```

Read the entire removal list. Stop if it includes a kernel, boot, networking, SSH, security-update, hardware-support, or Raspberry Pi OS metapackage. Stop if you do not understand a dependency. Record the installed versions and preserve the card backup before proceeding.

Only after reviewing the simulation:

```sh title="Pi: remove the reviewed package"
sudo apt-get remove PACKAGE_NAME
```

Do not add `-y`, `purge`, or an unreviewed `autoremove` command. `remove` normally retains package configuration files, but it is not a backup of application data. Package hooks can still change system state.

To undo the removal while the package remains in your configured repositories:

```sh title="Pi: reinstall the removed package"
sudo apt-get install PACKAGE_NAME
```

APT may install a newer version. Restore configuration and data from the backup as needed, then check the service's recorded enablement state. If the base no longer boots or networking fails, use the known-good card rather than attempting a broad reinstall over SSH.

## 4. Bound logs without discarding them at reboot

[DietPi RAMlog](https://dietpi.com/docs/software/log_system/#dietpi-ramlog) reduces writes with volatile logging modes. That trades away recent or all log history when power fails. Do not put `/var/log` on a RAM disk, routinely truncate logs, or disable the journal for this security-focused guide.

First inspect the current journal and any existing configuration:

```sh title="Pi: inspect current logging"
systemd-analyze cat-config systemd/journald.conf
sudo journalctl --disk-usage
sudo journalctl --list-boots
```

The following is a project starting budget, not a DietPi default or a tested recommendation for every card. It limits the persistent journal to roughly 64 MiB and its temporary runtime storage to 16 MiB. Active files, free-space rules, and other log writers affect actual usage. A busy service may exhaust the budget before enough history has accumulated.

Export logs you need to storage outside the Pi before applying a smaller limit. Applying it can rotate out archived history immediately; removing the configuration later cannot recover that history.

Create a new, dedicated drop-in. If that file already exists, stop and review it rather than overwriting it.

```sh title="Pi: edit only this guide's journal drop-in"
sudo mkdir -p /etc/systemd/journald.conf.d
sudoedit /etc/systemd/journald.conf.d/60-kixetpi-limits.conf
```

```ini title="/etc/systemd/journald.conf.d/60-kixetpi-limits.conf"
[Journal]
Storage=persistent
SystemMaxUse=64M
RuntimeMaxUse=16M
```

Apply the change and flush temporary logs into persistent storage:

```sh title="Pi: apply and inspect logging"
sudo systemctl restart systemd-journald
sudo journalctl --flush
systemd-analyze cat-config systemd/journald.conf
sudo journalctl --disk-usage
sudo journalctl -u ssh --since today --no-pager
```

Verify that another drop-in does not override these settings. After the next reboot, `sudo journalctl -b -1` should show the prior boot. On the first persistent boot there may be no older journal yet. Investigate a missing journal after subsequent boots before continuing.

Do not remove `rsyslog` just because the journal exists. An application, log-rotation rule, or remote log collector may rely on it. These limits do not cap application log files outside the journal. Review their own rotation separately.

To undo only this guide's drop-in:

```sh title="Pi: restore the previous journal configuration"
sudo rm /etc/systemd/journald.conf.d/60-kixetpi-limits.conf
sudo systemctl restart systemd-journald
```

Restore any earlier configuration you intentionally changed. Removing the drop-in cannot recover logs already rotated out, and it does not delete existing journal files.

## 5. Keep the stock swap setup for now

Inspect the actual image instead of assuming it uses a swap file, zram, or a particular swap manager:

```sh title="Pi: observe memory pressure under the real workload"
free -h
swapon --show
zramctl
vmstat 1 10
sudo journalctl -k -b --no-pager
```

If `zramctl` is unavailable, record that and skip it. Empty output can mean no zram devices exist. In `vmstat`, ignore the first row when comparing current activity; it summarizes time since boot. Look for sustained swap traffic, poor response times, or out-of-memory messages during the workload.

Zram compresses data in RAM at a CPU cost. It is not free memory, and it may not help much with incompressible data. Disk-backed swap uses storage and writes but can prevent an out-of-memory failure. A small Pi may need it more, not less.

Do not copy DietPi's swap scripts, run `swapoff -a`, force a swappiness value, or install a second swap manager here. Leave the image's configuration intact for the first walkthrough. If pressure is a problem, first reduce the workload and skip the optional Nix layer. Record a separate experiment before proposing memory tuning.

## Checkpoint and recovery

Reboot, reconnect over SSH, and test the actual application, hardware, name resolution, and updates. Repeat the baseline measurements and check:

```sh title="Pi: verify the reduced system"
systemctl --failed
sudo ss -lntup
sudo journalctl -b -p warning --no-pager
sudo journalctl -b -1 --no-pager
sudo apt update
```

Record each intentionally disabled unit, removed package, and changed file. Keep the results even if savings are negligible. Lite may already be close to the smallest useful setup for your workload.

| Symptom | First response |
| --- | --- |
| SSH works by IP but not `.local`. | Restore the discovery service if you changed it. Check the address and hostname. |
| A peripheral or application stopped working. | Restore the last stopped service, or reinstall the last removed package and its configuration. |
| The Pi becomes unresponsive under load. | Inspect memory and kernel logs. Restore the previous workload and swap configuration if you changed it outside this guide. |
| Previous-boot logs disappear. | Check persistent journal configuration and storage space. Do not continue by disabling logging. |
| APT cannot resolve repositories. | Restore networking, DNS, or time services if changed. Never bypass signature or TLS checks. |

If checks pass, record the result and make a new known-good backup. Continue to [Kicksecure-inspired hardening](/guides/kicksecure/).

## Sources and review status

Reviewed on 26 September 2026. The procedures above are an untested adaptation, not a DietPi-supported installation method.

- [DietPi installation and conversion warning](https://dietpi.com/docs/hardware/#make-your-own-distribution).
- [DietPi-Services](https://dietpi.com/docs/dietpi_tools/system_configuration/#dietpi-services).
- [DietPi logging modes](https://dietpi.com/docs/software/log_system/#dietpi-ramlog).
- [Debian Trixie systemctl manual](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html) and [APT simulation and removal semantics](https://manpages.debian.org/trixie/apt/apt-get.8.en.html).
- [Debian Trixie journal configuration](https://manpages.debian.org/trixie/systemd/journald.conf.5.en.html). Consult `man journald.conf` for the version on your Pi.
- [Linux zram documentation](https://docs.kernel.org/admin-guide/blockdev/zram.html) and [virtual-memory controls](https://docs.kernel.org/admin-guide/sysctl/vm.html).
