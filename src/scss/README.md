# App.css split into SCSS

This is the current release app.css, split into SCSS partials. This folder can be deleted locally if you do not wish to keep it. 

## Features

Gentle nesting. Because we are using scripts to pull out the partials, and then coming in and selecting some selectors to nest, we want to make sure any nesting we do here in these doesn't end up compiling into a CSS file that does not match the source app.css. As such, it is currently limited to `@media` and `rtl` selectors. You are encouraged to add more nesting yourself, if you prefer so.

An [_examples.scss](_examples.scss) to introduce you to some of the common things you can do with SASS and building your theme. 

`@use` and `@forward` built in to the partials and compiled file.

## How to use this

> [!NOTE]
> If you use an IDE, your IDE may already contain a compiler. The instructions are for those editing by hand below. 

Install [SASS](https://sass-lang.com) through the package manager of your choice, or compile direct from Github. If you use an IDE, your IDE may already

In the terminal, point SASS to watch `/` folder and recompile as you make changesUse the command: 
```bash
sass --watch src/scss/theme.scss:theme.css
```

If you wish a `no-map` version, use the command: 

```bash
sass --watch --no-source-map src/scss/theme.scss:theme.css
```

Make your changes to your SCSS files, and SASS will recompile. 

> [!TIP]
> You can also have `theme.css` compile directly to your `.obsidian/themes/theme-folder-here` for testing. Just reload Obsidian to check all your chases. 
