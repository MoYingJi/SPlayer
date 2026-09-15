#!/usr/bin/env bash

echo ::group:: Init

useradd builder -m
echo "builder ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

chmod -R a+rw .
chown -R builder:builder .

sudo="sudo --set-home --user builder"

pacman -Syu --noconfirm --color=always git

PACKAGER=${PACKAGER:-"MoYingJi <moyingjiaw@outlook.com>"}

echo ::endgroup::

echo ::group:: Dependency Handling

electron_ver=44

# archlinuxarm 没有 electronXX 包，手动安装 AUR 的 electronXX-bin
if ! pacman -Si electron$electron_ver >/dev/null 2>&1; then
    $sudo git clone https://aur.archlinux.org/electron$electron_ver-bin.git electron$electron_ver-bin
    cd electron$electron_ver-bin || { echo "Failed to enter directory"; exit 1; }
    $sudo env PACKAGER="$PACKAGER" makepkg --syncdeps --install --noconfirm
    cd - || { echo "Failed to return to previous directory"; exit 1; }
fi

echo ::endgroup::

$sudo env PACKAGER="$PACKAGER" makepkg --syncdeps --noconfirm
