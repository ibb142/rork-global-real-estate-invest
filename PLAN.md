# Fix remaining double-deploy and false log entry bugs

**What's still broken:**

Three leftover bugs from the original deploy fix that still cause double deploys and false "0 files" log entries.

**Fixes:**

- [x] **Fix 1:** When syncing a single deal, prevent it from triggering the deploy twice (once inside sync, once after sync)
- [x] **Fix 2:** When auto-deploying after publishing a deal, prevent the same double-deploy pattern
- [x] **Fix 3:** Stop saving empty failed deploy entries to the history log — currently the code says "skipping" but still saves it, which creates the misleading "0 files / 0 deals / FAILED" entries you've been seeing
- [x] **Fix 4:** Disable expo-updates automatic update checking to remove "Checking for new update..." banner

**Result after fix:**
- Deploy runs exactly once per trigger (no more doubled work)
- Deploy history only shows real results, not ghost failures from auth errors
- Session refresh + retry continues working as already fixed
- No more "Checking for new update..." banner at the bottom of the screen
