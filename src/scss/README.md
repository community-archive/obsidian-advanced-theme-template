# App.css split into SCSS

This is the current release app.css, split into SCSS partials. This folder can be deleted locally if you do not wish to keep it.

## Features

Gentle nesting. These partials started as a straight split of app.css, with a few selectors manually nested on top. We want to make sure any nesting we do here doesn't end up compiling into a CSS file that fails to match the source app.css. As such, it is currently limited to `@media` and `rtl` selectors. You are encouraged to add more nesting yourself, if you prefer so.

An [_examples.scss](_examples.scss) to introduce you to some of the common things you can do with SASS and building your theme. It's left out of `theme.scss`'s `@forward` list on purpose. :) 

`@use` and `@forward` built in to the partials and compiled file.

## How to use this

> [!NOTE]
> If you use an IDE, your IDE may already contain a compiler. The instructions are for those editing by hand below.

Install [SASS](https://sass-lang.com) through the package manager of your choice, or compile direct from GitHub.

None of this is checked by `lint.yml` or `release.yml`. Compiling here is entirely up to you. Only `theme.css` matters for release.

In the terminal, point SASS at `src/scss/theme.scss`. SASS will the handle the `@forward` from there, so editing any partial still triggers a recompile. If you run it from the repo root the `theme.css` lands at the top level. Use the command:

```bash
sass --watch src/scss/theme.scss:theme.css
```

If you wish a `no-map` version, use the command:

```bash
sass --watch --no-source-map src/scss/theme.scss:theme.css
```

Just want a single build instead of a watcher? Drop `--watch`:

```bash
sass src/scss/theme.scss:theme.css
```

Make your changes to your SCSS files, and SASS will recompile.

> [!TIP]
> You can also have `theme.css` compile directly to your `.obsidian/themes/theme-folder-here` for testing. Just reload Obsidian to check all your changes.
> ```bash
> sass --watch src/scss/theme.scss:/path/to/vault/.obsidian/themes/theme-folder-here/theme.css
> ```
