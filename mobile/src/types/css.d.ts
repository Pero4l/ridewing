/**
 * TypeScript has no built-in notion of a CSS file. Under `moduleResolution:
 * bundler` it tries to *resolve* the import and fails, because a stylesheet has
 * no type surface. A wildcard ambient declaration short-circuits that resolution
 * for both the CSS-module and bare side-effect import forms.
 */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.css";
