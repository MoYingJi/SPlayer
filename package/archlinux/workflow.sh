#!/usr/bin/env bash

echo ::group:: Init

useradd builder -m
echo "builder ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

chmod -R a+rw .
chown -R builder:builder .

sudo="sudo --set-home --user builder"

pacman -Syu

# 查找 /etc/makepkg.conf 并去除 debug 选项
# https://github.com/Neboer/archlinuxus/blob/main/prepare-arch-env/prepare-makepkg.sh
(
    set +H
    file="/etc/makepkg.conf"
    eval "$(grep '^OPTIONS=' "$file")"
    has_debug=0
    has_negated_debug=0
    for i in "${!OPTIONS[@]}"; do case "${OPTIONS[i]}" in
        "debug") OPTIONS[i]="!debug"; has_debug=1;;
        "!debug") has_negated_debug=1;;
    esac done
    [[ $has_debug -eq 0 && $has_negated_debug -eq 0 ]] && OPTIONS+=("!debug")
    printf -v options_str '%q ' "${OPTIONS[@]}"
    new_line="OPTIONS=(${options_str})"
    sed -i.bak "/^OPTIONS=/c$new_line" "$file"
)

echo ::endgroup::

$sudo makepkg --syncdeps --noconfirm
