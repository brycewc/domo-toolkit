# Domo Toolkit v1.1.3 Release Notes

- **Fixed user rights detection** on Domo instances where `USER_RIGHTS` on the bootstrap user object is an integer instead of an array, causing the extension to not load and show blank
- **Silent release notifications** — releases can now use `notify: 'silent'` to skip all user-facing notifications (no full page, no badge, no toast)
