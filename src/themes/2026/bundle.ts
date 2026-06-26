import themeJson from "./theme.json";
import baseLayout from "./templates/layouts/base.liquid?raw";
import headerPartial from "./templates/parts/header.liquid?raw";
import footerPartial from "./templates/parts/footer.liquid?raw";
import homeTemplate from "./templates/home.liquid?raw";
import singleTemplate from "./templates/single.liquid?raw";
import pageTemplate from "./templates/page.liquid?raw";
import archiveTemplate from "./templates/archive.liquid?raw";
import notFoundTemplate from "./templates/404.liquid?raw";
import type { ThemeManifest, ThemePackageRecord } from "../../core/theme/types.ts";

const manifest = themeJson as ThemeManifest;

export const defaultThemePackage: ThemePackageRecord = {
  manifest,
  templates: {
    "layouts/base": baseLayout,
    "parts/header": headerPartial,
    "parts/footer": footerPartial,
    home: homeTemplate,
    single: singleTemplate,
    page: pageTemplate,
    archive: archiveTemplate,
    "404": notFoundTemplate,
  },
  updated_at: Date.now(),
};
