---
title: 3. Adapt Kicksecure's hardening practices
description: Harden access and reduce exposure on Raspberry Pi OS without adding Kicksecure repositories or claiming its full security model.
---

Keep the Raspberry Pi OS base from [stage 1](/guides/raspberry-pi-os/) and the reviewed reductions from [stage 2](/guides/dietpi/). This stage applies a small set of access controls, then checks which confinement mechanisms the actual Pi supports.

:::caution[Untested integration, local recovery required]
Use a test Pi with a known-good card backup and working local console access. SSH and firewall changes can lock you out. Keep your first SSH session open, but do not treat it as a substitute for a console. No hardening or recovery procedure here has passed a hardware test.
:::

## This is not a Kicksecure conversion

Kicksecure's [Raspberry Pi](https://www.kicksecure.com/wiki/Raspberry_Pi) and [ARM64](https://www.kicksecure.com/wiki/ARM64) pages describe source builds and distro morphing as testers-only, without a downloadable image. Its [Debian conversion instructions](https://www.kicksecure.com/wiki/Debian) target Debian Trixie. Matching the Debian release does not establish Raspberry Pi OS compatibility.

Do not add Kicksecure repositories or install its metapackages, `security-misc`, replacement kernels, or boot-management packages on this base. Do not copy GRUB commands, x86-specific settings, or large sysctl lists. Those changes can conflict with Pi boot, networking, devices, or package management.

The transferable ideas are least privilege, fewer exposed services, maintained software, and confinement where it actually applies. We use Raspberry Pi OS and Debian tools for the procedures below. This is a project adaptation, not an upstream-supported Kicksecure-on-Pi installation.

## 1. Check updates and administrative privileges

On the Pi, confirm the expected base and inspect its state:

```sh title="Pi: inspect the system before hardening"
cat /etc/os-release
dpkg --print-architecture
uname -r
apt-cache policy
systemctl --failed
sudo ss -lntup
sudo -l
```

Keep the image's Raspberry Pi and Debian or Raspbian package sources. Do not replace them with sources from another distribution. Follow the [Raspberry Pi update procedure](https://www.raspberrypi.com/documentation/computers/os.html#update-software): run `sudo apt update`, review `sudo apt full-upgrade`, and reboot after kernel or firmware updates. Do not use `rpi-update` for routine maintenance.

Review whether `sudo -l` grants `NOPASSWD: ALL`. If it does, code running as that user can normally obtain root without knowing a password. Even password-protected sudo is not a sandbox for malicious code in your own account.

If you choose to require a sudo password, first confirm that your account has a known, working local password and that you can log in at the console. Before editing, run `sudo -i` in your original session and check that `id -u` reports `0`. Keep that root shell open for recovery. A normal SSH session or local login does not retain root privileges when a sudo policy becomes invalid.

Inspect `/etc/sudoers` and its included files. From the retained root shell, use `visudo` or `visudo -f PATH` on the actual file that grants your user passwordless access. Change only the relevant grant from `NOPASSWD` to `PASSWD`; do not delete the user's administrative access or overwrite the entire sudoers configuration. File names and rule order vary by image. Never force `visudo` to save a configuration it reports as invalid.

Validate with `visudo -c` from that root shell. In a second normal-user session, run `sudo -k` followed by `sudo -v`. Require an actual password prompt and successful authentication, then run `sudo /usr/bin/id -u` and expect `0`. Success without a prompt does not establish that passwordless access was removed. If a different rule still grants it, investigate that rule rather than assuming the change worked. If validation or access fails, restore the original rule with `visudo` in the retained root shell. After successful testing, leave the root shell with `exit` and continue as your normal user.

For a network-facing application, use its package's dedicated service account rather than your administrator account. This page does not define a safe environment for arbitrary hostile software.

## 2. Verify key-only SSH before disabling passwords

Use the key configured in Raspberry Pi Imager. If you initially used password authentication, follow the official [SSH key instructions](https://www.raspberrypi.com/documentation/computers/remote-access.html#configure-ssh-without-a-password) first. Never copy the private key to the Pi.

From a second terminal on your administration computer, replace the example username and hostname. Use the key path from stage 1, or the path to your existing key:

```sh title="Administration computer: prove public-key login works"
ssh -S none -i ~/.ssh/kixetpi_ed25519 -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no YOUR_USER@YOUR_PI
```

The `-S none` option disables connection sharing. Without it, an existing SSH master connection could bypass a fresh authentication test. Inside this new session, run `sudo -v`. Do not continue unless both login and administrative access work. A key passphrase prompt is local to the private key and is different from an SSH account-password prompt.

Inspect `/etc/ssh/sshd_config` and `/etc/ssh/sshd_config.d/`. Debian normally includes the drop-ins near the start of the main configuration. OpenSSH generally uses the first obtained value for a setting, so a later file does not necessarily override an earlier one. Existing `Match` blocks can change settings for individual connections.

Create the following file only if it does not already exist, the standard drop-in include is present, and no earlier or conditional rules conflict. Otherwise stop and reconcile the actual configuration before reloading anything.

```sh title="Pi: create a dedicated SSH policy file"
sudoedit /etc/ssh/sshd_config.d/00-kixetpi.conf
```

```text title="/etc/ssh/sshd_config.d/00-kixetpi.conf"
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
```

Keep your normal account's password for sudo and local recovery. Do not lock the account with `passwd -l`. Disabling SSH password authentication and locking an account are different operations.

Check syntax and effective settings before applying the change:

```sh title="Pi: validate SSH configuration"
sudo /usr/sbin/sshd -t
sudo /usr/sbin/sshd -T | grep -E '^(pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
```

Expect `pubkeyauthentication yes` and `no` for the other three settings. If the configuration has `Match` rules, also inspect `sshd -T -C` with the real connection details. For example, replace all values in this command:

```sh title="Pi: inspect settings for your actual SSH connection"
sudo /usr/sbin/sshd -T -C user=YOUR_USER,addr=ADMIN_IP,host=ADMIN_HOSTNAME
```

Only when syntax and effective policy are correct:

```sh title="Pi: reload SSH without closing the current session"
sudo systemctl reload ssh
systemctl status ssh --no-pager
```

Repeat the exact key-only command above, including `-S none`, to open a new connection, and run `sudo -v` again. Also verify that password-only SSH is refused from your administration computer:

```sh title="Administration computer: expect permission denied"
ssh -S none -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive YOUR_USER@YOUR_PI
```

If it still accepts an account password, the effective policy is not what this guide expects. Investigate includes and conditional rules before continuing.

### Recover SSH access

From the retained session or local console, remove only the new file, then validate and reload:

```sh title="Pi: undo this guide's SSH policy"
sudo rm /etc/ssh/sshd_config.d/00-kixetpi.conf
sudo /usr/sbin/sshd -t
sudo systemctl reload ssh
```

Run the reload only if validation succeeds. If you edited any existing configuration instead, restore that file from its pre-change copy. Do not delete other SSH drop-ins. Test a fresh connection before closing recovery access.

## 3. Add a firewall for a simple headless Pi

This example is only for a fresh, non-routing Pi whose sole intentional inbound application is SSH on TCP port 22. It is not a router, access point, VPN gateway, container host, or public-server policy. If your workload needs other inbound ports, document and allow them deliberately before enabling a firewall.

Use UFW from the existing APT repositories as a simpler interface than a hand-written nftables ruleset. This is a project choice, not a copy of Kicksecure's firewall.

First inspect listening ports and existing firewall ownership:

```sh title="Pi: inspect before installing another firewall manager"
sudo ss -lntup
systemctl is-active nftables firewalld ufw
```

If `nft` is installed, also run `sudo nft list ruleset`. If legacy iptables tools are in use, inspect their saved rules too. An inactive service does not prove that no firewall rules exist. Do not proceed if you find a configured firewall, containers, a VPN, or rules you cannot explain. Do not flush or reset them to make the example fit.

With a working local console and a confirmed fresh configuration:

```sh title="Pi: install the firewall from the existing repositories"
sudo apt install ufw
sudo ufw status verbose
sudo ufw show added
```

Stop if UFW is already active or has existing rules. Inspect `/etc/default/ufw` and keep `IPV6=yes` so the policy covers IPv6 too. Do not disable IPv6 across the operating system as a shortcut.

Stage the default policy and SSH exception while the firewall is still inactive:

```sh title="Pi: stage the policy before enabling it"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw logging low
sudo ufw show added
sudo ufw --dry-run enable
```

The SSH exception permits any source that can reach the Pi, on IPv4 and IPv6. It is not a LAN-only rule. Keep router port-forwarding disabled and check the router's IPv6 exposure policy. Restricting SSH to a known management address or subnet is a useful later change, but it needs a stable address and separate lockout testing.

UFW includes rules for established traffic and selected network functions such as DHCP, ICMP, and discovery. "Deny incoming" does not mean every packet except SSH is rejected. Review `sudo ufw show raw` after activation for the complete rules; `ufw status` shows only part of the policy. Do not remove IPv6 neighbor-discovery or other default network rules blindly.

Read the warning, then enable from the local console:

```sh title="Pi local console: enable and inspect"
sudo ufw enable
sudo ufw status verbose
sudo ufw show raw
```

Do not use `--force`. Enabling can interrupt existing SSH connections. From the administration computer, establish a new key-only SSH connection immediately, test the workload, and confirm that `sudo apt update` and name resolution still work. Check IPv4 and IPv6 access separately if both are used. A dry run checks proposed rules, not network reachability.

If access fails, return to the local console:

```sh title="Pi local console: disable the new firewall"
sudo ufw disable
```

This restores the pre-example inactive state but keeps the staged rules for inspection. Do not use `ufw reset` as generic recovery. Reboot only after the new policy works, then test access again. An incoming firewall with outgoing traffic allowed does not stop an allowed program from sending your data out.

## 4. Check AppArmor rather than assume confinement

Kicksecure uses AppArmor, but copying that name into a package list does not reproduce its policies. A kernel must support and enable the security module, and the actual program needs a loaded, enforcing profile.

Inspect the Pi:

```sh title="Pi: discover kernel security modules"
cat /sys/kernel/security/lsm
```

If AppArmor's tools are installed, also run:

```sh title="Pi: inspect loaded AppArmor policy"
sudo aa-status
```

A missing file, missing command, or absent `apparmor` entry is a reason to investigate, not evidence that protection exists. An enabled module without a profile for your application does not confine that application. A profile in complain mode records events rather than enforcing its restrictions.

Record which applications have enforcing profiles. Do not install experimental Kicksecure profiles, change the Pi's boot parameters, or force every profile into enforce mode here. If AppArmor is unavailable, mark this check as unavailable and leave policy enablement for a separate kernel-specific experiment. The previous SSH and firewall steps do not depend on AppArmor, but they do not replace it either.

Nix store paths also differ from ordinary `/usr/bin` paths. Do not assume a profile for an APT-installed executable automatically covers a Nix-installed equivalent.

## 5. Trial isolation for a service you understand

Skip this section if you have not installed a custom application service. Do not experiment on SSH, networking, login, or Raspberry Pi hardware-management units.

For one nonessential service, replace `YOUR_APP.service` with its real unit name:

```sh title="Pi: inspect an application service"
systemctl cat YOUR_APP.service
systemd-analyze security YOUR_APP.service
```

Read the unit, especially its user, writable paths, and privilege requirements. The security score is a checklist, not an audit or proof of safety. A root-running service does not lose its existing privileges just because `NoNewPrivileges` is set.

If the application does not need privilege-gaining executables or temporary files shared with other services, create a dedicated drop-in using a new filename:

```sh title="Pi: create an isolated trial drop-in"
sudo mkdir -p /etc/systemd/system/YOUR_APP.service.d
sudoedit /etc/systemd/system/YOUR_APP.service.d/60-kixetpi-hardening.conf
```

```ini title="60-kixetpi-hardening.conf"
[Service]
NoNewPrivileges=yes
PrivateTmp=yes
```

`NoNewPrivileges` prevents the service and its descendants from gaining privileges through mechanisms such as setuid execution. `PrivateTmp` gives the service private temporary directories. Neither prevents all filesystem or network access.

```sh title="Pi: apply only to the selected application"
sudo systemctl daemon-reload
sudo systemctl restart YOUR_APP.service
systemctl status YOUR_APP.service --no-pager
sudo journalctl -u YOUR_APP.service --since today --no-pager
```

Test the application, including its writes, network requests, and restart behavior. If it fails, remove only the new drop-in, run `sudo systemctl daemon-reload`, and restart that service. Do not use `systemctl revert` as a blanket rollback; it can remove other overrides. Keep more restrictive filesystem and network controls for an application-specific guide.

## 6. Keep an update routine

APT update timers and unattended security updates are not the same thing. This draft requires a deliberate update routine, such as a weekly review and prompt action on relevant security advisories. Use the base guide's update and reboot checks. Do not regard a completed initial install as permanently hardened.

If you already use `unattended-upgrades`, inspect its configuration and run `sudo unattended-upgrade --dry-run --debug`. Confirm which actual repository origins it allows. A Debian-only example may omit Raspberry Pi or Raspbian packages. Do not claim automatic coverage until its output shows the required origins and you have tested the process on this image.

Do not copy origin patterns from another release, enable unattended major-version upgrades, or schedule automatic reboots without a recovery plan. Optional Nix packages need their own reviewed updates; APT does not update them.

## Checkpoint

Before rebooting, verify a new key-only SSH login, working sudo access, firewall recovery from the console, and the real application. After rebooting, repeat the login and application tests, then record:

```sh title="Pi: collect the hardening checkpoint"
systemctl --failed
sudo ss -lntup
sudo ufw status verbose
sudo journalctl -u ssh -b --no-pager
sudo journalctl -b -p warning --no-pager
sudo apt update
```

Run the UFW check only if you completed that section. Explain every remaining listening service. Record AppArmor coverage honestly, including unavailable or unconfined applications. Back up this working state before adding more software.

You can stop here and keep an APT-only system. If the hardware has enough resources and you want declarative user packages, continue to the [optional Nix guide](/guides/nix/).

## Sources and review status

Reviewed on 26 September 2026. No claim here establishes Kicksecure equivalence or tested Pi support.

- [Kicksecure on Raspberry Pi](https://www.kicksecure.com/wiki/Raspberry_Pi), [ARM64 status](https://www.kicksecure.com/wiki/ARM64), and [Debian conversion](https://www.kicksecure.com/wiki/Debian).
- [Kicksecure security-misc](https://www.kicksecure.com/wiki/Security-misc) and [bootloader-related packages](https://www.kicksecure.com/wiki/Dev/boot#Bootloader-related_Kicksecure_and_Whonix_packages).
- [Raspberry Pi SSH access](https://www.raspberrypi.com/documentation/computers/remote-access.html#ssh) and [software updates](https://www.raspberrypi.com/documentation/computers/os.html#update-software).
- [Debian OpenSSH configuration](https://manpages.debian.org/trixie/openssh-server/sshd_config.5.en.html) and [configuration validation](https://manpages.debian.org/trixie/openssh-server/sshd.8.en.html).
- [Debian visudo validation and recovery precautions](https://manpages.debian.org/trixie/sudo/visudo.8.en.html) and [unattended-upgrade dry-run behavior](https://manpages.debian.org/trixie/unattended-upgrades/unattended-upgrade.8.en.html).
- [Debian UFW manual](https://manpages.debian.org/trixie/ufw/ufw.8.en.html), including remote-management warnings and default network allowances.
- [Linux AppArmor requirements](https://www.kernel.org/doc/html/latest/admin-guide/LSM/apparmor.html) and [Kicksecure AppArmor guidance](https://www.kicksecure.com/wiki/AppArmor).
- [Debian systemd execution controls](https://manpages.debian.org/trixie/systemd/systemd.exec.5.en.html), [security analysis](https://manpages.debian.org/trixie/systemd/systemd-analyze.1.en.html), and [targeted drop-in management](https://manpages.debian.org/trixie/systemd/systemctl.1.en.html).
