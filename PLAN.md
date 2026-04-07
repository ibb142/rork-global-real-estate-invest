# Sync landing investor cards to use the exact app deal card

## Progress

- [x] Confirm the app deal card source of truth
- [x] Replace the landing-only deal card render with the shared app card
- [x] Run validation on the changed landing and shared card files

## Features

- Make the landing investor card use the exact same card design already shown inside the app.
- Remove the separate landing-only version so there is only one card style to maintain.
- Keep the same image treatment, badges, spacing, typography, metadata order, and fallback states as the app card.
- Keep the same deal data formatting and field order so landing and app stay fully aligned.
- Preserve landing flow safety by keeping the landing section focused on conversion without redesigning the page.

## Design

- No redesign: the landing card will visually match the app card exactly.
- Preserve the same card shape, image ratio, shadows, borders, chips, and button placement from the app.
- Preserve the same empty, loading, and missing-image states so both surfaces behave consistently.
- Keep the rest of the landing page unchanged outside of the synced card block. You need to sync  with app any update in app will be update on landing  have to be 100% same

## Pages / Screens

- Landing deals section: replace the duplicate deal card with the shared app card.
- App deal surfaces: continue using the same shared card as the source of truth.
- Shared deal experience: both landing and app will stay locked to one card system going forward.

## Audit focus

- Confirm which existing app deal card is the live source of truth.
- Trace the landing card output back to the separate landing implementation.
- Remove duplicated card rendering from the landing path.
- Reconnect the landing section to the shared card so future changes stay in sync automatically.

## Result

- Landing and app investor cards will match exactly.
- No manual visual matching.
- No unrelated redesign or refactor.

