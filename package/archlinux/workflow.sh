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

# archlinuxarm 没有 electron43 包，手动安装 AUR 的 electron43-bin
if ! pacman -Si electron43 >/dev/null 2>&1; then
    $sudo git clone https://aur.archlinux.org/electron43-bin.git electron43-bin
    cd electron43-bin || { echo "Failed to enter directory"; exit 1; }
    $sudo env PACKAGER="$PACKAGER" makepkg --syncdeps --install --noconfirm
    cd - || { echo "Failed to return to previous directory"; exit 1; }
fi

echo ::endgroup::

$sudo env PACKAGER="$PACKAGER" makepkg --syncdeps --noconfirm
