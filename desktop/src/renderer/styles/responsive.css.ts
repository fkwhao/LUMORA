import { globalStyle } from "@vanilla-extract/css";

import { vars } from "./theme.css";

globalStyle(":root", {
  "@media": {
    "(max-width: 1260px)": {
      vars: {
        [vars.sidebarWidth]: "210px",
      },
    },
  },
});

globalStyle(".home-native-model-trigger", {
  "@media": {
    "(max-width: 620px)": {
      maxWidth: "128px",
    },
  },
});

globalStyle(".home-native-composer-control:not(.home-native-model-trigger) > span", {
  "@media": {
    "(max-width: 520px)": {
      display: "none",
    },
  },
});

globalStyle("*,\n  *::before,\n  *::after", {
  "@media": {
    "(prefers-reduced-motion: reduce)": {
    scrollBehavior: "auto",
    transitionDuration: "0.01ms",
    animationDuration: "0.01ms",
    },
  },
});
