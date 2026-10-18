---
title: 2. Adapt DietPi's lean-system practices
description: Audit and reduce Raspberry Pi OS Lite without converting it to DietPi or sacrificing updates and useful logs.
---

Keep Raspberry Pi OS Lite and make only the reductions your workload supports. DietPi provides the model of a small base with deliberately selected services. Its management tools assume a DietPi installation and are not an add-on for Raspberry Pi OS.

:::caution[Untested integration]
Complete the [base setup](/kixetpi/guides/raspberry-pi-os/) and its backup checkpoint first. All commands here run on the test Pi. No savings have been measured, and there is no target package count or RAM figure.
:::

## What changes and how to recover

| Action | Recovery limit |
| --- | --- |
| Stop or disable an unused service | Restore its recorded running and enablement states. Keep the known-good card available if access fails. |
| Remove a package | Reinstall if it remains available; configuration and data may need a backup. |
| Limit the journal | Remove the new settings to restore the old policy. Discarded logs are lost unless exported beforehand. |
| Inspect resources and swap | No configuration changes; leave stock swap intact. |

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

```sh title="Pi: inspect resource use"
free -h
swapon --show
df -h /
systemd-analyze
sudo journalctl --disk-usage
```

```sh title="Pi: inventory services and packages"
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service --state=enabled
systemctl list-sockets --all
systemctl list-timers --all
sudo ss -lntup
apt-mark showmanual
```

Use the `available` memory value rather than treating all filesystem cache as wasted RAM. Repeat measurements after a reboot, after the same idle interval, and during the same workload. A service that takes a long time to start does not necessarily use much memory while idle.

**Reference:** the Pi's installed manuals `man free`, `man swapon`, `man df`, `man systemd-analyze`, `man systemctl`, `man ss`, `man journalctl`, and `man apt-mark`; also available in the [Debian manual index](https://manpages.debian.org/trixie/index.html).

Keep these parts unless a separate, tested replacement exists:

- The active network manager, DHCP client, DNS resolver, Wi-Fi components, and remote-access service.
- APT update timers, certificate authorities, and time synchronization.
- Logging, `systemd-logind`, D-Bus, device management, and required storage services.
- Raspberry Pi kernel, firmware, boot, and hardware-support packages.

Do not disable security mitigations, logging, or updates to improve an idle-memory number.

## 2. Trial one unused service

[DietPi-Services](https://dietpi.com/docs/dietpi_tools/system_configuration/#dietpi-services) manages services selectively. Use the same restraint with systemd on Raspberry Pi OS.

This example applies only if `bluetooth.service` exists and the Pi does not use Bluetooth peripherals, networking, or its recovery keyboard. If it is absent or needed, skip the example. Do not replace it with an arbitrary core service.

An inactive or disabled service can produce a nonzero exit status in these checks; that is expected, not a reason to repair or enable it. Record the printed states:

```sh title="Pi: inspect the example service"
systemctl status bluetooth.service --no-pager
systemctl is-enabled bluetooth.service
systemctl is-active bluetooth.service
systemctl cat bluetooth.service
systemctl list-dependencies --reverse bluetooth.service
```

Record the printed enablement and activity states, not just exit codes. The `is-enabled` command can return success for `static` or `indirect` as well as `enabled`. The `is-active` command returns nonzero for inactive units.

Inspect associated sockets and timers. Reverse dependencies list only units currently loaded, not every application that might need Bluetooth.

If it is running and unused, stop it for this boot. Keep another recovery input or the known-good card available. To undo the trial, start the service again as shown below:

```sh title="Pi: temporary trial"
sudo systemctl stop bluetooth.service
```

Test the workload and recovery input devices. If something breaks, restore the prior running state:

```sh title="Pi: undo the temporary stop"
sudo systemctl start bluetooth.service
```

**Reference:** [systemctl inspection, enablement states, stop and start](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).

### Make the service change persistent

Disable automatic startup only after a successful trial and only if the recorded state was `enabled`. Review the unit's `Also=` setting first. The `disable` command can also change whether the units listed there start automatically. Record their states for recovery too.

Disable the reviewed service:

```sh title="Pi: keep the successful change across boots"
sudo systemctl disable bluetooth.service
```

Only if disabling succeeded, save other work and reboot with the known-good card available. This disconnects SSH:

```sh title="Pi: test the next boot"
sudo reboot
```

Reconnect and inspect its state and the workload again. Disabling automatic startup does not block every way a service can start. Dependencies or activation may still start it. Do not mask the unit to force the result. A mask blocks the unit from starting at all.

To restore Bluetooth if it was originally enabled and running, use the command below. Also restore any other recorded enablement changed by `Also=`:

```sh title="Pi: restore the recorded original state"
sudo systemctl enable --now bluetooth.service
```

**Reference:** [systemctl enable, disable, and mask](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html) and [reboot](https://manpages.debian.org/trixie/systemd-sysv/reboot.8.en.html).

Do not disable Avahi casually. It may provide the `.local` hostname you use for SSH and service discovery. An IP-based login and a deliberate replacement for discovery would be prerequisites to removing it.

## 3. Review package removal without a bulk purge

APT can remove dependent packages too. Preserve the card backup and recorded installed versions before removal. Use `remove`, not `purge`, to retain package configuration files; neither operation backs up application data.

Review candidates and the automatic-removal proposal without applying it:

```sh title="Pi: inspect packages and simulate cleanup"
apt list --installed
sudo apt-get -s autoremove
```

**Reference:** [APT installed list](https://manpages.debian.org/trixie/apt/apt.8.en.html) and [apt-get simulation and autoremove](https://manpages.debian.org/trixie/apt/apt-get.8.en.html).

The `-s` option simulates the proposal without removing anything. Stopping a service and removing its package are separate decisions. Removing an inactive package may save disk space without changing RAM use.

For one known, unused package, replace `PACKAGE_NAME` in the following commands with its actual APT name:

```sh title="Pi: inspect one removal candidate"
apt-cache policy PACKAGE_NAME
apt-cache depends PACKAGE_NAME
apt-cache rdepends --installed PACKAGE_NAME
sudo apt-get -s remove PACKAGE_NAME
```

**Reference:** [apt-cache dependency, reverse-dependency and policy queries](https://manpages.debian.org/trixie/apt/apt-cache.8.en.html) and [apt-get simulation](https://manpages.debian.org/trixie/apt/apt-get.8.en.html).

Read the entire removal list. Stop if it includes boot, networking, SSH, security-update, hardware-support, or Raspberry Pi OS metapackages. A metapackage keeps a related set of packages installed. Stop if you do not understand a dependency.

Only after reviewing the simulation, remove the package. Keep the known-good card ready if boot or networking fails. Do not add `-y`, `purge`, or an unreviewed `autoremove`; compare the actual APT prompt against the simulation before accepting it:

```sh title="Pi: remove the reviewed package"
sudo apt-get remove PACKAGE_NAME
```

Package hooks can still change system state. The simulation is a snapshot, not a guarantee if package indexes or installed packages change before removal.

To undo the removal while the package remains in your configured repositories:

```sh title="Pi: reinstall the removed package"
sudo apt-get install PACKAGE_NAME
```

APT may install a newer version. Restore configuration and data from the backup as needed, then check the service's recorded enablement state. If the base no longer boots or networking fails, use the known-good card rather than attempting a broad reinstall over SSH.

A simple, explicitly requested installation may complete without a confirmation question. Review the simulation before invoking it, inspect the actual output, and answer a prompt only when one is present; do not add `-y` to make interaction predictable.

**Reference:** [apt-get remove, purge, and install](https://manpages.debian.org/trixie/apt/apt-get.8.en.html).

## 4. Bound logs without discarding them at reboot

[DietPi RAMlog](https://dietpi.com/docs/software/log_system/#dietpi-ramlog) reduces disk writes. Its default mode does not save log files to disk. Its hourly-save mode risks losing up to an hour of logs on power failure. Do not put `/var/log` on a RAM disk, routinely truncate logs, or disable the journal in this guide.

First inspect the current journal and any existing configuration:

```sh title="Pi: inspect current logging"
systemd-analyze cat-config systemd/journald.conf
sudo journalctl --disk-usage
sudo journalctl --list-boots
```

**Reference:** [systemd-analyze cat-config](https://manpages.debian.org/trixie/systemd/systemd-analyze.1.en.html) and [journalctl usage and boot list](https://manpages.debian.org/trixie/systemd/journalctl.1.en.html).

This example allows 64 MiB for persistent logs and 16 MiB for temporary logs. These are project choices, not DietPi defaults or tested limits for every card. A busy service may fill the available space before enough history accumulates.

**Export needed logs outside the Pi before changing the limits.** Enforcing a smaller limit can permanently delete archived history.

Create a new drop-in, a small configuration file read alongside the main file. If its filename already exists, stop and review it rather than overwriting it.

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

The journal is systemd's central log store. `Storage=persistent` prefers disk storage and uses memory temporarily when disk storage is unavailable. `SystemMaxUse` limits persistent journal files, and `RuntimeMaxUse` limits temporary journal files. Active files can keep usage above these limits. The settings do not limit other application logs.

**Reference:** [journald.conf drop-ins, precedence, storage and size limits](https://manpages.debian.org/trixie/systemd/journald.conf.5.en.html) and [sudoedit](https://manpages.debian.org/trixie/sudo/sudo.8.en.html); see the Pi's installed `man mkdir` for directory creation.

Apply the change and inspect the result:

```sh title="Pi: apply and inspect logging"
sudo systemctl restart systemd-journald
sudo journalctl --flush
systemd-analyze cat-config systemd/journald.conf
sudo journalctl --disk-usage
sudo journalctl -u ssh --since today --no-pager
```

The `--flush` option transfers runtime logs to persistent storage. If they have already been flushed during this boot, it does nothing.

**Reference:** [journald restart semantics](https://manpages.debian.org/trixie/systemd/systemd-journald.service.8.en.html), [journalctl --flush and filters](https://manpages.debian.org/trixie/systemd/journalctl.1.en.html), and [systemd-analyze cat-config](https://manpages.debian.org/trixie/systemd/systemd-analyze.1.en.html).

Verify that another drop-in does not override these settings. After the next reboot, `sudo journalctl -b -1` can show the prior boot only if that history survived within the budget. On the first persistent boot there may be no older journal yet. If prior-boot logs are missing after subsequent boots, investigate configuration, available storage, and whether the budget is too small before continuing.

Do not remove `rsyslog` just because the journal exists. An application, log-rotation rule, or remote log collector may rely on it. These limits do not cap application log files outside the journal. Review their own rotation separately.

To undo only this guide's drop-in:

```sh title="Pi: restore the previous journal configuration"
sudo rm /etc/systemd/journald.conf.d/60-kixetpi-limits.conf
sudo systemctl restart systemd-journald
```

**Reference:** [journald configuration precedence](https://manpages.debian.org/trixie/systemd/journald.conf.5.en.html) and [safe service restart](https://manpages.debian.org/trixie/systemd/systemd-journald.service.8.en.html); see the Pi's installed `man rm` for file removal.

Restore any earlier configuration you intentionally changed. Removing the drop-in cannot recover logs already rotated out, and it does not delete existing journal files.

## 5. Keep the stock swap setup for now

Inspect the actual image instead of assuming a particular swap manager. Run `zramctl` only if installed; otherwise record that and skip that line:

```sh title="Pi: observe memory pressure under the real workload"
free -h
swapon --show
zramctl
vmstat 1 10
sudo journalctl -k -b --no-pager
```

**Reference:** [free](https://manpages.debian.org/trixie/procps/free.1.en.html), [swapon](https://manpages.debian.org/trixie/mount/swapon.8.en.html), [zramctl](https://manpages.debian.org/trixie/util-linux/zramctl.8.en.html), [vmstat](https://manpages.debian.org/trixie/procps/vmstat.8.en.html), and [journalctl kernel filter](https://manpages.debian.org/trixie/systemd/journalctl.1.en.html).

Empty `zramctl` output can mean no zram devices exist. In `vmstat`, ignore the first row when comparing current activity; it summarizes time since boot. Look for sustained swap traffic, poor response times, or out-of-memory messages during the workload.

Zram compresses data in RAM at a CPU cost. It is not free memory, and it may not help much with incompressible data. Disk-backed swap uses storage and writes but can prevent an out-of-memory failure. A small Pi may need it more, not less.

Do not copy DietPi's swap scripts, run `swapoff -a`, force a swappiness value, or install a second swap manager here. Leave the image's configuration intact for the first walkthrough. If pressure is a problem, first reduce the workload and skip the optional Nix layer. Record a separate experiment before proposing memory tuning.

## Checkpoint and recovery

Reboot, reconnect over SSH, and test the actual application, hardware, and name resolution. Repeat the baseline measurements and perform these read-only checks:

```sh title="Pi: verify the reduced system"
systemctl --failed
sudo ss -lntup
sudo journalctl -b -p warning --no-pager
sudo journalctl -b -1 --no-pager
```

**Reference:** [systemctl failed units](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html) and [journalctl boot and priority filters](https://manpages.debian.org/trixie/systemd/journalctl.1.en.html); see the Pi's installed `man ss` for socket inspection.

To check repository access, refresh APT indexes separately:

```sh title="Pi: refresh repository indexes"
sudo apt update
```

This writes package-list metadata but does not install upgrades.

**Reference:** [APT update](https://manpages.debian.org/trixie/apt/apt.8.en.html).

Record each intentionally disabled unit, removed package, and changed file. Keep the results even if savings are negligible. Lite may already be close to the smallest useful setup for your workload.

| Symptom | First response |
| --- | --- |
| SSH works by IP but not `.local`. | Restore the discovery service if you changed it. Check the address and hostname. |
| A peripheral or application stopped working. | Restore the last stopped service, or reinstall the last removed package and its configuration. |
| The Pi becomes unresponsive under load. | Inspect memory and kernel logs. Restore the previous workload and swap configuration if you changed it outside this guide. |
| Previous-boot logs disappear. | Check persistent journal configuration and storage space. Do not continue by disabling logging. |
| APT cannot resolve repositories. | Restore networking, DNS, or time services if changed. Never bypass signature or TLS checks. |

If checks pass, record the result and make a new known-good backup. Continue to [Kicksecure-inspired hardening](/kixetpi/guides/kicksecure/).

## Sources and review status

Reviewed on 28 September 2026. The procedures above are an untested adaptation, not a DietPi-supported installation method.

- [DietPi installation and conversion warning](https://dietpi.com/docs/hardware/#make-your-own-distribution).
- [DietPi-Services](https://dietpi.com/docs/dietpi_tools/system_configuration/#dietpi-services).
- [DietPi logging modes](https://dietpi.com/docs/software/log_system/#dietpi-ramlog).
- [Debian Trixie systemctl manual](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html) and [APT simulation and removal semantics](https://manpages.debian.org/trixie/apt/apt-get.8.en.html).
- [Debian Trixie journal configuration](https://manpages.debian.org/trixie/systemd/journald.conf.5.en.html). Consult `man journald.conf` for the version on your Pi.
- [Linux zram documentation](https://docs.kernel.org/admin-guide/blockdev/zram.html) and [virtual-memory controls](https://docs.kernel.org/admin-guide/sysctl/vm.html).
