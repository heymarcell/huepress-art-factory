# Design System for HuePress

## 0) Snapshot

- **Product Type:** Content Subscription Platform (SaaS + Digital Downloads)
- **Primary Goal:** Convert traffic from Pinterest/SEO into "Club" subscribers and streamline the "Vault" browsing experience.
- **Audience & Context:** "Aesthetic Millennial Moms" (mobile-first, quick sessions) and Pediatric Therapists (desktop/tablet, workflow-focused). Context is often busy, looking for a quick "win" (activity).
- **Accessibility Target:** WCAG 2.2 AA. High focus on visual clarity (contrast) due to the "accessible/therapy-grade" brand promise.
- **Platforms:** Responsive Web (Mobile-first priority).
- **Key Assumptions:**

  - Implementation via Tailwind CSS + React (Vite).
  - "Bold & Easy" aesthetic applies to the UI, not just the content (large touch targets, clear typography).

## 1) Design Principles

1.  **Dopamine Design, Clinical Clarity:** The UI should feel joyful and energetic (using Coral/Lilac) but functionally calm and organized (Teal/White). Avoid visual clutter; let the art "pop."
2.  **Therapy-Grade Accessibility:** Just as the product features bold lines for motor skills, the UI uses high contrast, large distinct click targets, and clear labels. No ambiguous icons.
3.  **Fridgeworthy Polish:** The interface should feel like a high-end design studio ("The Curator"), not a chaotic clip-art warehouse. Use generous whitespace and elegant serif typography to build trust.
4.  **Instant Gratification:** Reduce friction between "seeing" and "printing." Loading states should be playful (dopamine), and empty states should provide immediate alternatives.

## 2) Brand Foundations

### 2.1 Voice & Tone

- **Voice:** Encouraging, curated, professional yet playful.
- **Tone:** "The calm expert next door."
- **Do:** "Unlock the Vault," "Printable in seconds," "Curated for calm."
- **Don't:** "Buy now," "Click here," "Super cheap deals."
- **CTA Style:** Action-oriented + Benefit. (e.g., "Start Coloring" instead of "Submit").
- **Error Messages:** Helpful and specific. (e.g., "We couldn't generate that PDF. Try refreshing?" instead of "Error 500").

### 2.2 Visual Direction

- **Shape Language:** Friendly and organic.

  - **Radius:** Generous rounded corners (`12px` - `24px`) on cards and buttons.
  - **Borders:** Thick, distinct borders (`2px`) for inputs and key containers to match the "Bold Line Art" product aesthetic.

- **Depth Model:** "Soft Pop." Use subtle drop shadows for depth, but keep elements feeling flat and tactile.

  - _Elevation 1:_ Cards resting.
  - _Elevation 2:_ Hover states (slight lift).

- **Density:** Low to Medium.

  - Mobile: Large touch targets (min `48px`).
  - Desktop: Ample whitespace to let the colorful preview images breathe.

## 3) Design Tokens

### 3.1 Color System

Based on the approved palette.

| **Role**      | **Token Name**         | **Value (Hex)**        | **Usage**                                          |
| ------------- | ---------------------- | ---------------------- | -------------------------------------------------- |
| **Primary**   | `color.primary.main`   | `#0F766E` (Deep Teal)  | Primary buttons, active tabs, strong links.        |
| **Secondary** | `color.secondary.main` | `#F97360` (Warm Coral) | Call-to-actions, "New" badges, highlights.         |
| **Accent**    | `color.accent.main`    | `#F3EFFF` (Lilac Tint) | Backgrounds, decorative shapes, subtle highlights. |
| **Neutral**   | `color.neutral.ink`    | `#111827` (Ink Black)  | Main text, headings, icon strokes.                 |
| **Neutral**   | `color.neutral.white`  | `#FFFFFF` (White)      | Card backgrounds, inputs, modal surfaces.          |
| **Neutral**   | `color.neutral.gray`   | `#F3F4F6` (Gray 100)   | Page background (alternative), dividers.           |
| **State**     | `color.state.error`    | `#EF4444`              | Form errors, destructive actions.                  |
| **State**     | `color.state.success`  | `#10B981`              | Success toasts, download complete.                 |

### 3.2 Typography

Combining **Lora** (Serif) for authority with **Plus Jakarta Sans** (Sans) for modern utility.

- **Headings:** `Lora`, Serif. Weights: Medium (500), Bold (700).
- **Body/UI:** `Plus Jakarta Sans`, Sans-serif. Weights: Regular (400), Medium (500), Bold (700).

| **Style**   | **Font**     | **Size (rem/px)** | **Line Height** | **Tracking** | **Usage**           |
| ----------- | ------------ | ----------------- | --------------- | ------------ | ------------------- |
| **Display** | Lora         | 2.5 / 40          | 1.1             | \-0.02em     | Hero headlines.     |
| **H1**      | Lora         | 2.0 / 32          | 1.2             | \-0.01em     | Page titles.        |
| **H2**      | Lora         | 1.5 / 24          | 1.3             | 0            | Section headers.    |
| **H3**      | Plus Jakarta | 1.25 / 20         | 1.4             | 0            | Card titles.        |
| **Body**    | Plus Jakarta | 1.0 / 16          | 1.5             | 0            | Standard text.      |
| **Small**   | Plus Jakarta | 0.875 / 14        | 1.5             | 0            | Metadata, captions. |
| **Button**  | Plus Jakarta | 1.0 / 16          | 1.0             | 0.02em       | CTA labels (Bold).  |

### 3.3 Spacing & Sizing

Base unit: `4px`.

- **Scale:** `4` (xs), `8` (sm), `16` (md), `24` (lg), `32` (xl), `48` (2xl), `64` (3xl).
- **Touch Targets:** Minimum `44px` (ideally `48px`) for all clickable elements.
- **Container:** Max-width `1200px` (Desktop), `100%` with `16px` padding (Mobile).

### 3.4 Layout & Grid

- **Mobile (<640px):** 4 columns, 16px gutter, 16px margin.
- **Tablet (640px - 1024px):** 8 columns, 24px gutter.
- **Desktop (>1024px):** 12 columns, 32px gutter.

### 3.5 Radius, Borders, Shadows

- **Radius:**

  - `sm`: `4px` (Checkboxes, Tags)
  - `md`: `8px` (Inputs, Small Cards)
  - `lg`: `16px` (Main Cards, Modals)
  - `xl`: `24px` (Feature Sections, Large Buttons)

- **Borders:**

  - `default`: `1px solid #E5E7EB` (Dividers)
  - `heavy`: `2px solid #111827` (Inputs, Buttons - "Bold Art" feel)

- **Shadows:**

  - `sm`: `0 1px 2px rgba(0,0,0,0.05)`
  - `md`: `0 4px 6px -1px rgba(0,0,0,0.1)` (Cards)
  - `pop`: `4px 4px 0px #111827` (Neobrutalist touch for "Fun" elements, optional)

## 4) Iconography & Imagery

- **Icons:** Thick stroke (`2px`), rounded caps. Color: `Ink Black`.

  - _Style:_ Lucid / Feather / Heroicons Outline (bold).

- **Imagery:**

  - _Thumbnails:_ Clean, white background, high contrast black lines.
  - _Vibes:_ No generic stock photos. Use real photos of printed pages being colored with markers.

- **Empty States:** Use the "Scribble" from the logo as a background pattern or playful spot illustration.

## 5) Components

| **Component**         | **Purpose**          | **Variants**                             | **States**                                | **A11y Notes**                                                       |
| --------------------- | -------------------- | ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| **Button**            | Main actions         | Primary (Teal), Secondary (Coral), Ghost | Default, Hover, Active, Disabled, Loading | Min 4.5:1 contrast. Focus ring visible.                              |
| **Resource Card**     | Display content item | Grid View, List View                     | Default, Hover, Locked (Premium)          | "Alt" text on images. Whole card clickable? No, separate title link. |
| **Filter Chip**       | Sort content         | Default, Selected                        | Default, Active                           | Aria-pressed state.                                                  |
| **Subscription Gate** | Block content        | Inline Overlay, Modal                    | \-                                        | Focus trap in modal.                                                 |

### Component: Button

- **Purpose:** Trigger actions (Download, Subscribe, Login).
- **Anatomy:** Label (Plus Jakarta Sans Bold), Optional Icon (Left/Right), Container (Radius `xl`).
- **Variants:**

  - _Primary:_ Background `Deep Teal`, Text `White`. (Main CTAs).
  - _Secondary:_ Background `Warm Coral`, Text `White`. (Fun/Promo actions).
  - _Outline:_ Border `2px Ink Black`, Text `Ink Black`. (Secondary actions).

- **States:**

  - _Hover:_ Slight brightness lift (e.g., Teal -> Light Teal).
  - _Focus:_ `3px` ring of `Lilac Tint` or `Blue`.

- **Behavior:** Scale down slightly (98%) on active/press.
- **Do:** Use for "Download PDF". **Don't:** Use for navigation links (use text links).

### Component: Resource Card (The "Vault" Item)

- **Purpose:** Preview a coloring page.
- **Anatomy:**

  - Image Thumbnail (Aspect ratio 1:1.41 - A4 paper shape).
  - Title (H3 Lora).
  - Tags (e.g., "Fine Motor", "Space").
  - Action Area (Download icon or Lock icon).

- **States:**

  - _Default:_ Image clear.
  - _Locked:_ Overlay with semi-transparent white + Lock Icon + "Club Only" badge.
  - _Hover:_ Shadow `md`, Title turns `Teal`.

- **Content:** Title max 2 lines.

### Component: Navbar

- **Purpose:** Global navigation.
- **Anatomy:** Logo (Left), Links (Center - Desktop), User/CTA (Right).
- **Responsive:** Hamburger menu on mobile.
- **Sticky:** Yes, with `Lilac Tint` blur background.

## 6) Patterns

### 6.1 Authentication & Gating

- **Use when:** A free user tries to download a Premium/Club asset.
- **Pattern:**

  1.  User clicks "Download" on a premium card.
  2.  **Modal** appears: "Unlock this design + 500 more."
  3.  Header: "Join the Club."
  4.  Body: Short bullet points (Bold & Easy, No Ads).
  5.  CTA: "$5/mo - Cancel Anytime" (Primary).
  6.  Alternative: "Login" link.

### 6.2 Search & Filter (The "Vault" Experience)

- **Use when:** Browsing the library.
- **Pattern:**

  - **Search Input:** Large, top of page. Placeholder: "Try 'Capybara' or 'Calm'..."
  - **Filter Bar:** Horizontal scrollable chips on mobile. Categories: _Theme_ (Animals, Space), _Skill_ (Fine Motor, Focus), _Collection_ (Bold & Easy).
  - **Results:** Asynchronous update (no page reload). Show "Skeleton" loaders while fetching.

### 6.3 Onboarding (The "Session Pack Builder")

- **Use when:** A therapist or parent wants to create a custom PDF packet.
- **Pattern:**

  - Step 1: "Who is this for?" (Select: Kid, Patient, Self).
  - Step 2: "Pick 3 themes."
  - Step 3: Generating... (Show playful animation).
  - Step 4: Result page with "Download Pack" button.

## 7) Page Templates

### 7.1 Home (Marketing)

- **Goal:** Explain "HuePress" and drive Email Signup or Subscription.
- **Sections:**

  1.  **Hero:** "Curated Coloring for \[Audience\]." Split screen: Text left, Hero Image right (Spread of coloring pages).
  2.  **Problem/Agitation:** "Stop searching for ugly clip art." Comparison visual.
  3.  **The Vault Preview:** Grid of 6 high-performing assets.
  4.  **How it Works:** 1. Join, 2. Print, 3. Dopamine.
  5.  **Pricing:** Simple cards ($5/mo vs $45/yr).
  6.  **Footer:** SEO links.

### 7.2 The Vault (Library/List)

- **Goal:** Discovery and Download.
- **Layout:**

  - Sidebar (Desktop) / Topbar (Mobile): Filters.
  - Main Content: Responsive Grid (2 col mobile, 3-4 col desktop).

- **States:**

  - _Empty:_ "No results for 'XYZ'. Try 'Space'?"
  - _Loading:_ Shimmer skeletons of cards.

### 7.3 Pricing Page

- **Goal:** Conversion.
- **Key Component:** Pricing Table.
- **Visual:** Use `Lilac Tint` background to separate it from standard content.
- **Social Proof:** "Trusted by 500+ OTs and Moms" near the CTA.

## 8) Implementation & Handoff (Tailwind Config)

Use this mapping in `tailwind.config.js` to enforce the system.

JavaScript

```
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F766E', // Deep Teal
          hover: '#0D645D',
        },
        secondary: {
          DEFAULT: '#F97360', // Warm Coral
          hover: '#E86350',
        },
        accent: {
          DEFAULT: '#F3EFFF', // Lilac Tint
        },
        ink: '#111827', // Ink Black
        paper: '#FFFFFF',
      },
      fontFamily: {
        serif: ['Lora', 'serif'], // Headings
        sans: ['"Plus Jakarta Sans"', 'sans-serif'], // UI
      },
      borderRadius: {
        'card': '16px',
        'button': '24px',
      },
      boxShadow: {
        'pop': '4px 4px 0px 0px #111827', // Optional fun vibe
      }
    }
  }
}
```

## 9) Governance

- **No "One-offs":** If a new button color is needed, it must be added to the tokens, not hardcoded.
- **Image Quality:** All uploads to the CMS must be SVGs or 300DPI PNGs to maintain the "Vector Quality" promise.
- **Accessibility Checks:** All new components must be tested via keyboard (Tab key) before launch.

## Appendix A) Token JSON

JSON

```
{
  "colors": {
    "primary": "#0F766E",
    "secondary": "#F97360",
    "accent": "#F3EFFF",
    "ink": "#111827",
    "white": "#FFFFFF",
    "error": "#EF4444",
    "success": "#10B981"
  },
  "typography": {
    "headingFamily": "Lora, serif",
    "bodyFamily": "Plus Jakarta Sans, sans-serif",
    "scale": {
      "h1": "2rem",
      "h2": "1.5rem",
      "h3": "1.25rem",
      "body": "1rem",
      "caption": "0.875rem"
    }
  },
  "borderRadius": {
    "sm": "4px",
    "md": "8px",
    "lg": "16px",
    "xl": "24px",
    "full": "9999px"
  },
  "breakpoints": {
    "sm": "640px",
    "md": "768px",
    "lg": "1024px",
    "xl": "1280px"
  }
}
```
