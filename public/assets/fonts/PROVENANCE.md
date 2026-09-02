# Self-hosted font provenance

The public site serves seven Czech-complete WOFF2 application faces locally. There is no runtime Google Fonts, Fontsource, npm, or CDN dependency.

Source packages and licenses:

- `@fontsource/inter@5.3.0` — Inter upstream font version v4.1 — SIL Open Font License 1.1.
- `@fontsource/cormorant-garamond@5.3.0` — Cormorant Garamond upstream font version v21 — SIL Open Font License 1.1.

Generated application faces:

- `inter-400.woff2`
- `inter-500.woff2`
- `inter-600.woff2`
- `cormorant-garamond-400.woff2`
- `cormorant-garamond-500.woff2`
- `cormorant-garamond-600.woff2`
- `cormorant-garamond-400-italic.woff2`

Generation method: for each face, `scripts/build-czech-fonts.py` takes the Fontsource 5.3.0 `latin` WOFF2 face, takes the matching same-version `latin-ext` WOFF2 face, subsets `latin-ext` to the exact Czech target set below, and merges that subset into the Latin face. The result is written to the existing canonical application URL. The maintenance pipeline is pinned to FontTools 4.64.0 and Brotli 1.2.0; generation is a maintenance/build operation only and never occurs at runtime.

Czech target glyph set (28 characters):

`ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň`

The obsolete separate `*-latin-ext.woff2` resources are intentionally not shipped, preventing duplicate downloads for one family + weight + style on pages containing both Czech and ordinary Latin text.
