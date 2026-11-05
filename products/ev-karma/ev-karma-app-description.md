# EV Karma — App Concept

## One-line pitch

EV Karma helps EV drivers find charging stations on Google Maps and lets a
waiting driver notify the person currently charging — by license plate — once
it's time to move, in a polite, low-friction way that builds a driver's
reputation ("karma") over time.

## The Problem

Public EV chargers are often occupied by cars that finished charging long ago
but haven't been moved. There's no easy, low-friction way for a waiting driver
to reach the person currently parked and ask them to free up the spot — so
drivers either wait indefinitely or have an awkward in-person confrontation.

## The Solution

A location-based app that:

1. Shows all nearby charging stations on Google Maps.
2. Uses passive tracking for registered users — no manual check-in needed. If
   you're registered and near/using a charger, the app can notify you.
3. Lets a waiting driver notify the driver blocking the charger by entering
   just that car's **license plate and brand** — if it matches a registered
   vehicle, that driver gets notified.
4. Lets the notified driver reply instantly with a default quick response
   ("On my way" / "Give me 1 hour").
5. Builds trust through ID verification at sign-up, **and** through a review
   and karma-points system, like Airbnb, so considerate drivers stand out.

## Core Features

- **Charging station map** — Google Maps integration showing nearby stations,
  availability, and connector types.
- **Passive tracking, no check-in** — registered users don't need to
  manually check in; the app detects charging activity and notifies
  automatically when relevant.
- **Notify by plate + brand** — to alert the driver blocking a charger, a
  waiting user enters that vehicle's license plate and brand. If it matches a
  registered user, that user receives the notification.
- **Quick-reply responses** — the notified driver can respond instantly with
  default options such as:
  - "On my way right now"
  - "Give me about 1 hour"
  - (additional presets can be added later, e.g. "Already moved")
- **Do Not Disturb window** — users can set quiet hours during which they
  won't receive move-your-car notifications (e.g., overnight charging).
- **Reviews & EV Karma Points** — after an interaction, drivers can rate each
  other (like Airbnb). Ratings earn or cost **EV Karma Points**, building a
  visible reputation for considerate drivers.
- **Minimal exposed info** — the other driver only ever sees your **license
  plate and vehicle brand** — no name, phone number, or other personal
  details are shared.
- **Identity verification** — registration requires a valid government ID to
  confirm each user is a real person, reducing scams and abuse. This
  verified identity is never shown to other users; it's used internally for
  trust and moderation only.
- **Freemium model** — creating an account and browsing the map is free;
  sending a nudge/message to another driver requires a paid plan.

## Typical User Flow

1. Driver opens the app and sees nearby charging stations on the map.
2. Driver arrives and plugs in — no check-in step required, the app tracks
   this passively for registered users.
3. Another driver arrives and finds the spot occupied. They enter the
   blocking car's **license plate and brand** in the app.
4. If it matches a registered user, that driver receives a notification
   (unless they're in a Do Not Disturb window).
5. The notified driver quick-replies with "On my way" or "Give me 1 hour" (or
   another preset).
6. Once the spot is freed, both drivers can leave a review of the
   interaction. Reviews adjust each driver's **EV Karma Points**.

## Trust & Safety

- Sign-up is free, but every user must verify their identity with a valid ID
  before they can use core social features. This ID is kept private — other
  users never see it.
- The only information ever shown to another driver is your **license plate
  and vehicle brand** — nothing more.
- A peer review system (similar to Airbnb) lets drivers rate each other after
  an interaction, feeding into each driver's EV Karma Points and giving the
  community a visible, earned reputation.
- Pre-written, courteous quick-reply templates keep interactions respectful
  by default.

## EV Karma Points

- Every driver has an EV Karma score, built from the reviews other drivers
  leave them (promptness moving the car, courtesy, etc.).
- Higher karma signals a considerate, reliable driver — this reputation can
  later be surfaced on the map or profile as a trust signal.

## Business Model

- **Free:** account registration, browsing the map, passive tracking.
- **Paid:** sending "please move your car" notifications/messages to other
  drivers (subscription or pay-per-message — to be decided).

## Visual Identity / UX-UI Direction

- **Palette:** green and white — evokes clean energy, calm, and eco-friendliness.
- **Tone:** calm, uncluttered, low-stress interface — notifications should
  feel like a polite nudge, not an alarm.

## Target Users

EV owners who regularly use public/shared charging stations (apartment
residents, commuters, road-trippers) and want a fairer, more courteous way to
share limited charging infrastructure.
