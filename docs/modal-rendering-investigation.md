# Modal rendering investigation

Tested on Windows Chrome against the local Jobs page, 2026-09-12.

## Confirmed defect

The inline modal was a child of the Jobs page's `space-y-6` container.
Tailwind's sibling-spacing selector applied a 24px top margin to the fixed
overlay. At a 1920x919 viewport its bounds were `(0,24,1920,895)`, not the
viewport `(0,0,1920,919)`. The top strip remained outside the backdrop and
the panel was centered 12px too low. A body portal alone corrected these
bounds, with blur still enabled. No ancestor had transform, filter,
backdrop-filter, or animation in the inspected computed styles.

## One-variable experiments

Each experiment was restored to baseline before the next, except the final
combined implementation. Pointer sweeps used the browser tool's drag API
(button held during each sweep), since it has no standalone mouse-move API.
These measurements are not a GPU frame trace and do not prove that ordinary
button-up mouse movement is flicker-free.

| Variant | Duration | Sweeps | Distinct panel rectangles |
| --- | ---: | ---: | ---: |
| Baseline | 10.56s | 137 | 1 |
| A: backdrop blur disabled | 11.12s | 6 | 1 |
| B: modal animations disabled, blur restored | 10.52s | 124 | 1 |
| C: background card transforms disabled | 10.53s | 148 | 1 |
| D: body portal only, blur retained | 12.15s | 3 | 1 |
| E: transitions disabled, inline modal restored | 10.51s | 137 | 1 |
| Final desktop | 10.56s | 117 | 1 |
| Final mobile 390px | 12.15s | 3 | 1 |

Baseline and final desktop sampling found zero `article:hover` matches.
Modal animation was `none` before any edits; no card hover transform exists
in the current JobCard. Disabling animations/transforms/transitions did not
produce a distinguishing result. The reported GPU flicker was not reliably
reproduced, so blur is not established as its cause.

## Final changes

- Render the shared Modal into `document.body` to remove inherited page
  spacing and scroll/paint ancestry.
- Use the existing translucent slate backdrop without backdrop blur.
- Make the application workspace inert while a modal is open; restore its
  previous state on close. Reference-count shared isolation for nested modals.
- Preserve body overflow and padding and compensate a body scrollbar, if one
  exists. The Jobs page normally scrolls its main element, not the body.
- Keep dialog controls, centering, dimensions, business actions, and API paths.

At 360/390/430px and 768px the panel remained within the viewport with no
horizontal page overflow. Closing restored inert=false and the original body
overflow. Document and notice modals on different jobs opened successfully.
Browser diagnostics reported no warnings/errors during the final interaction
checks. All temporary global CSS overrides were removed.

The remaining validation gap is reproducing the user's visible compositing
artifact with ordinary mouse movement on the affected browser/session. Do not
describe the stable geometry samples as proof of a GPU/compositor fix.
