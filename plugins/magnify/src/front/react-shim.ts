/*
    Puts React in scope of every file with JSX (esbuild 'inject', see build.mjs). Magnify's sources come from
    the core's front, which compiled with the automatic JSX runtime and so never imported React to write
    JSX; the plugin build uses React.createElement against the core's React, and this is what provides it.
*/
import * as React from 'react'
export { React }
