#!/bin/bash
set -e
# Remove .rork/history from all commits to unblock GitHub push protection
git filter-branch --force --index-filter 'git rm -rf --cached --ignore-unmatch .rork/history' --prune-empty --tag-name-filter cat -- --all
echo 'History cleaned'
