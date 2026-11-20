# Habit Builder Tracker v1.5.7 — Rich Text Notes

- Replaced the plain-text note field with a rich-text editor.
- Preserves headings, paragraphs, bold, italic, underline, lists, quotes, links and tables when pasted from compatible apps.
- Added a formatting toolbar for common editing actions.
- Sanitizes pasted HTML and saved note content; scripts, embedded objects, images and unsafe links are removed.
- The full note formatting is rendered in Read Note and included in workspace backups via `bodyHtml`, while plain text remains available for search and compact previews.
- Copy Note writes both HTML and plain-text clipboard formats when supported, with plain-text fallback.
- Older notes remain readable and editable; existing `body` text is migrated on edit without a database reset.
