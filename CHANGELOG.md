# Changelog

## Unreleased

Sky learns your name — optionally, and going no further than the device in your hand. Home greets
you with "Hi, {name}" instead of the app title, a small profile pill sits beside the settings gear
to show or change it in one tap, and Settings gains a Profile section for the same thing. The name
is capped at 24 characters, lives inside the ordinary state snapshot (so JSON exports carry it and
older backups pick it up through the default merge), and stays null until you set it — nobody is
asked who they are.

### Profile display name

- 👋 **Home greets you by name.** The header swaps "Sky" for "Hi, {name}", falling back to
  "Hi there" while no name is set.
- 💊 **Profile pill.** A tappable avatar-and-name pill next to the gear opens the editor; before a
  name exists it offers "Set name" instead.
- ⚙️ **Settings → Profile → Display name.** The same sheet, reachable from Settings, with clear
  and save actions.
