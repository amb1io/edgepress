import themeCss from "./assets/theme.css?raw";
import themeJs from "./assets/theme.js?raw";

export const blogRhamsesThemeAssets: Record<string, { body: string; contentType: string }> = {
  "theme.css": { body: themeCss, contentType: "text/css; charset=utf-8" },
  "theme.js": { body: themeJs, contentType: "application/javascript; charset=utf-8" },
};
