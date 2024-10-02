/** @type {import('tailwindcss').Config} */
module.exports = {
  "presets": [
      {
          "theme": {
              "extend": {
                  "screens": {
                      "sm": "640px",
                      "md": "768px",
                      "lg": "1024px",
                      "xl": "1280px",
                      "2xl": "1380px"
                  },
                  "colors": {
                      "current": "currentColor",
                      "transparent": "transparent",
                      "black": "#000",
                      "white": "#fff",
                      "gray": {
                          "50": "#ECF4FD",
                          "100": "#E0E8F2",
                          "200": "#C0C8D2",
                          "300": "#919EB0",
                          "400": "#3D485B",
                          "500": "#232B3A",
                          "600": "#1E2431",
                          "700": "#1A202C",
                          "800": "#151A23",
                          "900": "#11151C"
                      },
                      "red": {
                          "50": "#fdefef",
                          "100": "#facccc",
                          "200": "#f6a8a8",
                          "300": "#f17373",
                          "400": "#ef6161",
                          "500": "#ED4F4F",
                          "600": "#8b1b1b",
                          "700": "#6a1515",
                          "800": "#5a1212",
                          "900": "#4D3232"
                      },
                      "yellow": {
                          "50": "#fffae8",
                          "100": "#fef6d5",
                          "200": "#fdedaf",
                          "300": "#fce588",
                          "400": "#fbd94f",
                          "500": "#FACC15",
                          "600": "#f6c605",
                          "700": "#e3b605",
                          "800": "#bd9704",
                          "900": "#7A4F01"
                      },
                      "green": {
                          "50": "#f6fdf9",
                          "100": "#c4f5d6",
                          "200": "#92ecb3",
                          "300": "#5fe491",
                          "400": "#2ddb6e",
                          "500": "#24D164",
                          "600": "#1b9f4c",
                          "700": "#157d3c",
                          "800": "#08660D",
                          "900": "#0d4b24"
                      },
                      "teal": {
                          "50": "#edf7f4",
                          "100": "#b7ded5",
                          "200": "#8fcbbd",
                          "300": "#74bfad",
                          "400": "#59b39d",
                          "500": "#4eaa94",
                          "600": "#428f7c",
                          "700": "#367465",
                          "800": "#29594e",
                          "900": "#234C42"
                      },
                      "blue": {
                          "50": "#F4F6FF",
                          "100": "#b9ddff",
                          "200": "#C6D2FE",
                          "300": "#1890FF",
                          "400": "#2c5afb",
                          "500": "#194BFB",
                          "600": "#1744E2",
                          "700": "#1338BC",
                          "800": "#0F2D97",
                          "900": "#010928"
                      },
                      "purple": {
                          "50": "#fdfdff",
                          "100": "#e3dbf9",
                          "200": "#d5caf6",
                          "300": "#baa9f1",
                          "400": "#9276e9",
                          "500": "#8565E6",
                          "600": "#5c5a9a",
                          "700": "#302f50",
                          "800": "#212037",
                          "900": "#37365C"
                      },
                      "pink": {
                          "50": "#FDF2F8",
                          "100": "#fce7f3",
                          "200": "#fbcfe8",
                          "300": "#f9a8d4",
                          "400": "#f472b6",
                          "500": "#ec4899",
                          "600": "#db2777",
                          "700": "#be185d",
                          "800": "#9d174d",
                          "900": "#831843"
                      }
                  },
                  "spacing": {
                      "0": "0px",
                      "1": "0.25rem",
                      "2": "0.5rem",
                      "3": "0.75rem",
                      "4": "1rem",
                      "5": "1.25rem",
                      "6": "1.5rem",
                      "7": "1.75rem",
                      "8": "2rem",
                      "9": "2.25rem",
                      "10": "2.5rem",
                      "11": "2.75rem",
                      "12": "3rem",
                      "14": "3.5rem",
                      "16": "4rem",
                      "18": "4.5rem",
                      "20": "5rem",
                      "24": "6rem",
                      "26": "6.5rem",
                      "28": "7rem",
                      "32": "8rem",
                      "36": "9rem",
                      "40": "10rem",
                      "44": "11rem",
                      "48": "12rem",
                      "52": "13rem",
                      "56": "14rem",
                      "60": "15rem",
                      "64": "16rem",
                      "72": "18rem",
                      "80": "20rem",
                      "96": "24rem",
                      "px": "1px",
                      "0.5": "0.125rem",
                      "1.5": "0.375rem",
                      "2.5": "0.625rem",
                      "3.5": "0.875rem"
                  },
                  "backdropBlur": (theme) => theme('blur'),
                  "backdropBrightness": (theme) => theme('brightness'),
                  "backdropContrast": (theme) => theme('contrast'),
                  "backdropGrayscale": (theme) => theme('grayscale'),
                  "backdropHueRotate": (theme) => theme('hueRotate'),
                  "backdropInvert": (theme) => theme('invert'),
                  "backdropOpacity": (theme) => theme('opacity'),
                  "backdropSaturate": (theme) => theme('saturate'),
                  "backdropSepia": (theme) => theme('sepia'),
                  "backgroundColor": theme => ({
          ...theme('colors'),
          body: '#1E2431',
      }),
                  "backgroundImage": {
                      "none": "none",
                      "gradient-to-t": "linear-gradient(to top, var(--tw-gradient-stops))",
                      "gradient-to-tr": "linear-gradient(to top right, var(--tw-gradient-stops))",
                      "gradient-to-r": "linear-gradient(to right, var(--tw-gradient-stops))",
                      "gradient-to-br": "linear-gradient(to bottom right, var(--tw-gradient-stops))",
                      "gradient-to-b": "linear-gradient(to bottom, var(--tw-gradient-stops))",
                      "gradient-to-bl": "linear-gradient(to bottom left, var(--tw-gradient-stops))",
                      "gradient-to-l": "linear-gradient(to left, var(--tw-gradient-stops))",
                      "gradient-to-tl": "linear-gradient(to top left, var(--tw-gradient-stops))"
                  },
                  "backgroundOpacity": (theme) => theme('opacity'),
                  "backgroundPosition": {
                      "bottom": "bottom",
                      "center": "center",
                      "left": "left",
                      "left-bottom": "left bottom",
                      "left-top": "left top",
                      "right": "right",
                      "right-bottom": "right bottom",
                      "right-top": "right top",
                      "top": "top"
                  },
                  "backgroundSize": {
                      "auto": "auto",
                      "cover": "cover",
                      "contain": "contain"
                  },
                  "blur": {
                      "0": "0",
                      "none": "0",
                      "sm": "4px",
                      "DEFAULT": "20px",
                      "md": "16px",
                      "lg": "24px",
                      "xl": "28px",
                      "2xl": "40px",
                      "3xl": "64px"
                  },
                  "brightness": {
                      "0": "0",
                      "50": ".5",
                      "75": ".75",
                      "90": ".9",
                      "95": ".95",
                      "100": "1",
                      "105": "1.05",
                      "110": "1.1",
                      "125": "1.25",
                      "150": "1.5",
                      "200": "2"
                  },
                  "borderColor": theme => ({
          ...theme('colors'),
          DEFAULT: '#C0C8D2',
      }),
                  "borderOpacity": (theme) => theme('opacity'),
                  "borderRadius": {
                      "none": "0",
                      "sm": "0.125rem",
                      "DEFAULT": "0.25rem",
                      "md": "0.375rem",
                      "lg": "0.5rem",
                      "xl": "0.75rem",
                      "2xl": "1rem",
                      "3xl": "1.5rem",
                      "full": "9999px"
                  },
                  "borderWidth": {
                      "0": "0",
                      "2": "2px",
                      "3": "3px",
                      "4": "4px",
                      "8": "8px",
                      "DEFAULT": "1px"
                  },
                  "boxShadow": {
                      "sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                      "DEFAULT": "0px 8px 16px rgba(0, 0, 0, 0.16)",
                      "md": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      "lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                      "xl": "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                      "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                      "inner": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
                      "none": "none"
                  },
                  "caretColor": (theme) => theme('colors'),
                  "contrast": {
                      "0": "0",
                      "50": ".5",
                      "75": ".75",
                      "100": "1",
                      "125": "1.25",
                      "150": "1.5",
                      "200": "2"
                  },
                  "container": [],
                  "cursor": {
                      "auto": "auto",
                      "DEFAULT": "default",
                      "pointer": "pointer",
                      "wait": "wait",
                      "text": "text",
                      "move": "move",
                      "not-allowed": "not-allowed"
                  },
                  "divideColor": (theme) => theme('borderColor'),
                  "divideOpacity": (theme) => theme('borderOpacity'),
                  "divideWidth": (theme) => theme('borderWidth'),
                  "dropShadow": {
                      "sm": "0 1px 1px rgba(0,0,0,0.05)",
                      "DEFAULT": [
                          "0 1px 2px rgba(0, 0, 0, 0.1)",
                          "0 1px 1px rgba(0, 0, 0, 0.06)"
                      ],
                      "md": [
                          "0 4px 3px rgba(0, 0, 0, 0.07)",
                          "0 2px 2px rgba(0, 0, 0, 0.06)"
                      ],
                      "lg": [
                          "0 10px 8px rgba(0, 0, 0, 0.04)",
                          "0 4px 3px rgba(0, 0, 0, 0.1)"
                      ],
                      "xl": [
                          "0 20px 13px rgba(0, 0, 0, 0.03)",
                          "0 8px 5px rgba(0, 0, 0, 0.08)"
                      ],
                      "2xl": "0 25px 25px rgba(0, 0, 0, 0.15)",
                      "none": "0 0 #0000"
                  },
                  "fill": {
                      "current": "currentColor"
                  },
                  "grayscale": {
                      "0": "0",
                      "DEFAULT": "100%"
                  },
                  "hueRotate": {
                      "0": "0deg",
                      "15": "15deg",
                      "30": "30deg",
                      "60": "60deg",
                      "90": "90deg",
                      "180": "180deg",
                      "-180": "-180deg",
                      "-90": "-90deg",
                      "-60": "-60deg",
                      "-30": "-30deg",
                      "-15": "-15deg"
                  },
                  "invert": {
                      "0": "0",
                      "DEFAULT": "100%"
                  },
                  "flex": {
                      "1": "1 1 0%",
                      "auto": "1 1 auto",
                      "initial": "0 1 auto",
                      "none": "none"
                  },
                  "flexGrow": {
                      "0": "0",
                      "DEFAULT": "1"
                  },
                  "flexShrink": {
                      "0": "0",
                      "DEFAULT": "1"
                  },
                  "fontFamily": {
                      "body": "\"Inter\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"Noto Sans\", sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\"",
                      "heading": "\"Inter\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"Noto Sans\", sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\"",
                      "sans": "\"Inter\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, \"Noto Sans\", sans-serif, \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\"",
                      "serif": "ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
                      "mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace"
                  },
                  "fontSize": {
                      "xs": [
                          "0.75rem",
                          {
                              "lineHeight": "1rem"
                          }
                      ],
                      "sm": [
                          "0.875rem",
                          {
                              "lineHeight": "1.25rem"
                          }
                      ],
                      "base": [
                          "1rem",
                          {
                              "lineHeight": "1.5rem"
                          }
                      ],
                      "lg": [
                          "1.125rem",
                          {
                              "lineHeight": "1.688rem"
                          }
                      ],
                      "xl": [
                          "1.25rem",
                          {
                              "lineHeight": "1.688rem"
                          }
                      ],
                      "2xl": [
                          "1.5rem",
                          {
                              "lineHeight": "2rem"
                          }
                      ],
                      "3xl": [
                          "1.875rem",
                          {
                              "lineHeight": "2.375rem"
                          }
                      ],
                      "4xl": [
                          "2.5rem",
                          {
                              "lineHeight": "3.25rem"
                          }
                      ],
                      "5xl": [
                          "3rem",
                          {
                              "lineHeight": "3.75rem"
                          }
                      ],
                      "6xl": [
                          "3.75rem",
                          {
                              "lineHeight": "1"
                          }
                      ],
                      "7xl": [
                          "4.5rem",
                          {
                              "lineHeight": "1"
                          }
                      ],
                      "8xl": [
                          "6rem",
                          {
                              "lineHeight": "1"
                          }
                      ],
                      "9xl": [
                          "8rem",
                          {
                              "lineHeight": "1"
                          }
                      ]
                  },
                  "fontWeight": {
                      "hairline": "100",
                      "thin": "200",
                      "light": "300",
                      "normal": "400",
                      "medium": "500",
                      "semibold": "600",
                      "bold": "700",
                      "extrabold": "800",
                      "black": "900"
                  },
                  "gap": (theme) => theme('spacing'),
                  "gradientColorStops": (theme) => theme('colors'),
                  "gridAutoColumns": {
                      "auto": "auto",
                      "min": "min-content",
                      "max": "max-content",
                      "fr": "minmax(0, 1fr)"
                  },
                  "gridAutoRows": {
                      "auto": "auto",
                      "min": "min-content",
                      "max": "max-content",
                      "fr": "minmax(0, 1fr)"
                  },
                  "gridColumn": {
                      "auto": "auto",
                      "span-1": "span 1 \/ span 1",
                      "span-2": "span 2 \/ span 2",
                      "span-3": "span 3 \/ span 3",
                      "span-4": "span 4 \/ span 4",
                      "span-5": "span 5 \/ span 5",
                      "span-6": "span 6 \/ span 6",
                      "span-7": "span 7 \/ span 7",
                      "span-8": "span 8 \/ span 8",
                      "span-9": "span 9 \/ span 9",
                      "span-10": "span 10 \/ span 10",
                      "span-11": "span 11 \/ span 11",
                      "span-12": "span 12 \/ span 12",
                      "span-full": "1 \/ -1"
                  },
                  "gridColumnEnd": {
                      "1": "1",
                      "2": "2",
                      "3": "3",
                      "4": "4",
                      "5": "5",
                      "6": "6",
                      "7": "7",
                      "8": "8",
                      "9": "9",
                      "10": "10",
                      "11": "11",
                      "12": "12",
                      "13": "13",
                      "auto": "auto"
                  },
                  "gridColumnStart": {
                      "1": "1",
                      "2": "2",
                      "3": "3",
                      "4": "4",
                      "5": "5",
                      "6": "6",
                      "7": "7",
                      "8": "8",
                      "9": "9",
                      "10": "10",
                      "11": "11",
                      "12": "12",
                      "13": "13",
                      "auto": "auto"
                  },
                  "gridRow": {
                      "auto": "auto",
                      "span-1": "span 1 \/ span 1",
                      "span-2": "span 2 \/ span 2",
                      "span-3": "span 3 \/ span 3",
                      "span-4": "span 4 \/ span 4",
                      "span-5": "span 5 \/ span 5",
                      "span-6": "span 6 \/ span 6",
                      "span-full": "1 \/ -1"
                  },
                  "gridRowStart": {
                      "1": "1",
                      "2": "2",
                      "3": "3",
                      "4": "4",
                      "5": "5",
                      "6": "6",
                      "7": "7",
                      "auto": "auto"
                  },
                  "gridRowEnd": {
                      "1": "1",
                      "2": "2",
                      "3": "3",
                      "4": "4",
                      "5": "5",
                      "6": "6",
                      "7": "7",
                      "auto": "auto"
                  },
                  "gridTemplateColumns": {
                      "1": "repeat(1, minmax(0, 1fr))",
                      "2": "repeat(2, minmax(0, 1fr))",
                      "3": "repeat(3, minmax(0, 1fr))",
                      "4": "repeat(4, minmax(0, 1fr))",
                      "5": "repeat(5, minmax(0, 1fr))",
                      "6": "repeat(6, minmax(0, 1fr))",
                      "7": "repeat(7, minmax(0, 1fr))",
                      "8": "repeat(8, minmax(0, 1fr))",
                      "9": "repeat(9, minmax(0, 1fr))",
                      "10": "repeat(10, minmax(0, 1fr))",
                      "11": "repeat(11, minmax(0, 1fr))",
                      "12": "repeat(12, minmax(0, 1fr))",
                      "none": "none"
                  },
                  "gridTemplateRows": {
                      "1": "repeat(1, minmax(0, 1fr))",
                      "2": "repeat(2, minmax(0, 1fr))",
                      "3": "repeat(3, minmax(0, 1fr))",
                      "4": "repeat(4, minmax(0, 1fr))",
                      "5": "repeat(5, minmax(0, 1fr))",
                      "6": "repeat(6, minmax(0, 1fr))",
                      "none": "none"
                  },
                  "height": theme => ({
          auto: 'auto',
          ...theme('spacing'),
          full: '100%',
          screen: '100vh',
      }),
                  "inset": (theme, { negative }) => ({
          auto: 'auto',
          ...theme('spacing'),
          ...negative(theme('spacing')),
          '1\/2': '50%',
          '1\/3': '33.333333%',
          '2\/3': '66.666667%',
          '1\/4': '25%',
          '2\/4': '50%',
          '3\/4': '75%',
          full: '100%',
          '-1\/2': '-50%',
          '-1\/3': '-33.333333%',
          '-2\/3': '-66.666667%',
          '-1\/4': '-25%',
          '-2\/4': '-50%',
          '-3\/4': '-75%',
          '-full': '-100%',
      }),
                  "keyframes": {
                      "spin": {
                          "to": {
                              "transform": "rotate(360deg)"
                          }
                      },
                      "ping": {
                          "75%, 100%": {
                              "transform": "scale(2)",
                              "opacity": "0"
                          }
                      },
                      "pulse": {
                          "50%": {
                              "opacity": ".5"
                          }
                      },
                      "bounce": {
                          "0%, 100%": {
                              "transform": "translateY(-25%)",
                              "animationTimingFunction": "cubic-bezier(0.8,0,1,1)"
                          },
                          "50%": {
                              "transform": "none",
                              "animationTimingFunction": "cubic-bezier(0,0,0.2,1)"
                          }
                      }
                  },
                  "letterSpacing": {
                      "70": "4.375em",
                      "tighter": "-0.05em",
                      "tight": "-0.025em",
                      "normal": "0em",
                      "wide": "0.025em",
                      "wider": "0.05em",
                      "widest": "0.1em",
                      "px": "1px"
                  },
                  "lineHeight": {
                      "3": ".75rem",
                      "4": "1rem",
                      "5": "1.25rem",
                      "6": "1.5rem",
                      "7": "1.75rem",
                      "8": "2rem",
                      "9": "2.25rem",
                      "10": "2.5rem",
                      "none": "1",
                      "tight": "1.1",
                      "snug": "1.3",
                      "normal": "1.5",
                      "relaxed": "1.8",
                      "loose": "2"
                  },
                  "listStyleType": {
                      "none": "none",
                      "disc": "disc",
                      "decimal": "decimal"
                  },
                  "margin": (theme, { negative }) => ({
          auto: 'auto',
          ...theme('spacing'),
          ...negative(theme('spacing')),
      }),
                  "maxHeight": {
                      "full": "100%",
                      "screen": "100vh"
                  },
                  "maxWidth": {
                      "none": "none",
                      "xxs": "18rem",
                      "xs": "20rem",
                      "sm": "24rem",
                      "md": "28rem",
                      "lg": "32rem",
                      "xl": "36rem",
                      "2xl": "42rem",
                      "3xl": "48rem",
                      "4xl": "56rem",
                      "5xl": "64rem",
                      "6xl": "72rem",
                      "7xl": "80rem",
                      "full": "100%",
                      "min": "min-content",
                      "max": "max-content",
                      "prose": "65ch"
                  },
                  "minHeight": {
                      "0": "0",
                      "full": "100%",
                      "screen": "100vh"
                  },
                  "minWidth": {
                      "0": "0",
                      "full": "100%"
                  },
                  "objectPosition": {
                      "bottom": "bottom",
                      "center": "center",
                      "left": "left",
                      "left-bottom": "left bottom",
                      "left-top": "left top",
                      "right": "right",
                      "right-bottom": "right bottom",
                      "right-top": "right top",
                      "top": "top"
                  },
                  "opacity": {
                      "0": "0",
                      "5": "0.05",
                      "10": "0.1",
                      "20": "0.2",
                      "25": "0.25",
                      "30": "0.3",
                      "40": "0.4",
                      "50": "0.5",
                      "60": "0.6",
                      "70": "0.7",
                      "75": "0.75",
                      "80": "0.8",
                      "90": "0.9",
                      "95": "0.95",
                      "100": "1"
                  },
                  "order": {
                      "1": "1",
                      "2": "2",
                      "3": "3",
                      "4": "4",
                      "5": "5",
                      "6": "6",
                      "7": "7",
                      "8": "8",
                      "9": "9",
                      "10": "10",
                      "11": "11",
                      "12": "12",
                      "first": "-9999",
                      "last": "9999",
                      "none": "0"
                  },
                  "outline": {
                      "none": [
                          "2px solid transparent",
                          "2px"
                      ],
                      "white": [
                          "2px dotted white",
                          "2px"
                      ],
                      "black": [
                          "2px dotted black",
                          "2px"
                      ]
                  },
                  "padding": theme => theme('spacing'),
                  "placeholderColor": theme => theme('colors'),
                  "placeholderOpacity": (theme) => theme('opacity'),
                  "ringColor": (theme) => ({
        DEFAULT: theme('colors.blue.500', '#3b82f6'),
        ...theme('colors'),
      }),
                  "ringOffsetColor": (theme) => theme('colors'),
                  "ringOffsetWidth": {
                      "0": "0px",
                      "1": "1px",
                      "2": "2px",
                      "4": "4px",
                      "8": "8px"
                  },
                  "ringOpacity": (theme) => ({
        DEFAULT: '0.5',
        ...theme('opacity'),
      }),
                  "ringWidth": {
                      "0": "0px",
                      "1": "1px",
                      "2": "2px",
                      "4": "4px",
                      "8": "8px",
                      "DEFAULT": "3px"
                  },
                  "rotate": {
                      "0": "0deg",
                      "1": "1deg",
                      "2": "2deg",
                      "3": "3deg",
                      "6": "6deg",
                      "12": "12deg",
                      "45": "45deg",
                      "90": "90deg",
                      "180": "180deg",
                      "-180": "-180deg",
                      "-90": "-90deg",
                      "-45": "-45deg",
                      "-12": "-12deg",
                      "-6": "-6deg",
                      "-3": "-3deg",
                      "-2": "-2deg",
                      "-1": "-1deg"
                  },
                  "saturate": {
                      "0": "0",
                      "50": ".5",
                      "100": "1",
                      "150": "1.5",
                      "200": "2"
                  },
                  "scale": {
                      "0": "0",
                      "50": ".5",
                      "75": ".75",
                      "90": ".9",
                      "95": ".95",
                      "100": "1",
                      "105": "1.05",
                      "110": "1.1",
                      "125": "1.25",
                      "150": "1.5"
                  },
                  "sepia": {
                      "0": "0",
                      "DEFAULT": "100%"
                  },
                  "skew": {
                      "0": "0deg",
                      "1": "1deg",
                      "2": "2deg",
                      "3": "3deg",
                      "6": "6deg",
                      "12": "12deg",
                      "-12": "-12deg",
                      "-6": "-6deg",
                      "-3": "-3deg",
                      "-2": "-2deg",
                      "-1": "-1deg"
                  },
                  "space": (theme, { negative }) => ({
        ...theme('spacing'),
        ...negative(theme('spacing')),
      }),
                  "stroke": {
                      "current": "currentColor"
                  },
                  "textColor": theme => ({
          ...theme('colors'),
          body: '#919EB0',
      }),
                  "textOpacity": (theme) => theme('opacity'),
                  "transformOrigin": {
                      "center": "center",
                      "top": "top",
                      "top-right": "top right",
                      "right": "right",
                      "bottom-right": "bottom right",
                      "bottom": "bottom",
                      "bottom-left": "bottom left",
                      "left": "left",
                      "top-left": "top left"
                  },
                  "transitionDelay": {
                      "75": "75ms",
                      "100": "100ms",
                      "150": "150ms",
                      "200": "200ms",
                      "300": "300ms",
                      "500": "500ms",
                      "700": "700ms",
                      "1000": "1000ms"
                  },
                  "transitionDuration": {
                      "75": "75ms",
                      "100": "100ms",
                      "150": "150ms",
                      "200": "200ms",
                      "300": "300ms",
                      "500": "500ms",
                      "700": "700ms",
                      "1000": "1000ms",
                      "DEFAULT": "150ms"
                  },
                  "transitionProperty": {
                      "none": "none",
                      "all": "all",
                      "DEFAULT": "background-color, border-color, color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter",
                      "colors": "background-color, border-color, color, fill, stroke",
                      "opacity": "opacity",
                      "shadow": "box-shadow",
                      "transform": "transform"
                  },
                  "transitionTimingFunction": {
                      "DEFAULT": "cubic-bezier(0.4, 0, 0.2, 1)",
                      "linear": "linear",
                      "in": "cubic-bezier(0.4, 0, 1, 1)",
                      "out": "cubic-bezier(0, 0, 0.2, 1)",
                      "in-out": "cubic-bezier(0.4, 0, 0.2, 1)"
                  },
                  "translate": (theme, { negative }) => ({
        ...theme('spacing'),
        ...negative(theme('spacing')),
        '1\/2': '50%',
        '1\/3': '33.333333%',
        '2\/3': '66.666667%',
        '1\/4': '25%',
        '2\/4': '50%',
        '3\/4': '75%',
        full: '100%',
        '-1\/2': '-50%',
        '-1\/3': '-33.333333%',
        '-2\/3': '-66.666667%',
        '-1\/4': '-25%',
        '-2\/4': '-50%',
        '-3\/4': '-75%',
        '-full': '-100%',
      }),
                  "width": theme => ({
          auto: 'auto',
          ...theme('spacing'),
          '1\/2': '50%',
          '1\/3': '33.333333%',
          '2\/3': '66.666667%',
          '1\/4': '25%',
          '2\/4': '50%',
          '3\/4': '75%',
          '1\/5': '20%',
          '2\/5': '40%',
          '3\/5': '60%',
          '4\/5': '80%',
          '1\/6': '16.666667%',
          '2\/6': '33.333333%',
          '3\/6': '50%',
          '4\/6': '66.666667%',
          '5\/6': '83.333333%',
          '1\/12': '8.333333%',
          '2\/12': '16.666667%',
          '3\/12': '25%',
          '4\/12': '33.333333%',
          '5\/12': '41.666667%',
          '6\/12': '50%',
          '7\/12': '58.333333%',
          '8\/12': '66.666667%',
          '9\/12': '75%',
          '10\/12': '83.333333%',
          '11\/12': '91.666667%',
          full: '100%',
          screen: '100vw',
      }),
                  "zIndex": {
                      "0": "0",
                      "10": "10",
                      "20": "20",
                      "30": "30",
                      "40": "40",
                      "50": "50",
                      "auto": "auto"
                  }
              }
          }
      }
  ],
  "theme": {
      "extend": []
  },
  "content": [
      "./*/index.html",
  ],
  "plugins": []
};

