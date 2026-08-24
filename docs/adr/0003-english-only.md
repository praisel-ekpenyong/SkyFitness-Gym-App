# English-only

Sky deletes the 11 non-English locale packs and simplifies the i18n loader, keeping English source strings as the keys. Translations rot without a community to maintain them — this is a single-user fork with no translators, and every new user-visible string currently costs 11 coordinated edits plus two check scripts just to keep the packs in sync. The `t()` indirection stays so re-introducing a language later remains a one-file change. Consequence: locale-completeness checks and the multi-language test assertions go away with ticket 05.
