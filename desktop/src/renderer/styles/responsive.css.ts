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

globalStyle(".context-actions button:not(:first-child):not(:last-child)", {
  "@media": {
    "(max-width: 1260px)": {
    padding: "0 8px",
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
