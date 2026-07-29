---
name: Natuhair B2B Management
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#4a4455'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#7b7487'
  outline-variant: '#ccc3d8'
  surface-tint: '#732ee4'
  primary: '#630ed4'
  on-primary: '#ffffff'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#d2bbff'
  secondary: '#b4136d'
  on-secondary: '#ffffff'
  secondary-container: '#fd56a7'
  on-secondary-container: '#600037'
  tertiary: '#7d3d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#a15100'
  on-tertiary-container: '#ffe0cd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#ffd9e4'
  secondary-fixed-dim: '#ffb0cd'
  on-secondary-fixed: '#3e0022'
  on-secondary-fixed-variant: '#8c0053'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb784'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#713700'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 32px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

The design system is centered on efficiency, clarity, and professionalism, specifically tailored for B2B cosmetics representatives managing high-volume orders. The aesthetic blends **Minimalism** with a **Corporate Modern** sensibility, drawing heavy inspiration from `shadcn/ui` to prioritize utility without sacrificing elegance.

The UI should evoke a sense of organized calm. By utilizing expansive whitespace and a restrained color palette, the system reduces cognitive load during complex administrative tasks. Every element serves a functional purpose, utilizing subtle borders and soft depth to guide the user through the order fulfillment lifecycle.

## Colors

This design system utilizes a high-contrast functional palette. 

- **Primary (#7C3AED):** Reserved for primary actions, active navigation states, and critical progress indicators.
- **Accent (#EC4899):** Used sparingly for "soft" actions, promotional badges, or secondary interactive elements to provide visual variety without overwhelming the primary flow.
- **Neutral / Text (#1F2937):** Applied to all core copy and iconography to ensure AAA accessibility.
- **Background (#FAFAFA) & Surface (#FFFFFF):** The background provides a subtle contrast to white cards, creating a natural sense of depth and containment for data tables and order forms.

## Typography

The typography system relies exclusively on **Inter**, a typeface engineered for screen legibility and data density. 

- **Hierarchy:** H1 is used for page titles and dashboard headers. H2 is utilized for section titles within cards or sidebars.
- **Utility:** Labels are slightly tracking-heavy (0.01em) to improve readability at small sizes, typically used for table headers or input captions. 
- **Adaptability:** On mobile devices, H1 may scale down to 20px if titles exceed two lines, but body text remains constant at 14px to maintain legibility.

## Layout & Spacing

This design system follows a **Fluid Grid** philosophy with a focus on "airy" layouts. 

- **Grid:** A 12-column grid is used for desktop views. Content is contained within a maximum width of 1440px to prevent excessive line lengths.
- **Margins:** Large 32px external margins provide breathing room.
- **Density:** While being a B2B app, the spacing remains generous. Vertical lists and table rows should use a minimum padding of 12px (3 units) to avoid a "cramped" feel common in legacy enterprise software.
- **Mobile:** Transition to a 1-column layout with 16px horizontal margins.

## Elevation & Depth

The system uses **Tonal Layering** combined with **Low-Contrast Outlines**. 

- **Surface Definition:** Cards and containers are defined primarily by a 1px border using a light neutral grey (approx. #E5E7EB) rather than heavy shadows.
- **Shadows:** A single, soft "Ambient Shadow" is applied to floating elements (modals, popovers, and primary cards). 
  - *Shadow Token:* `0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)`
- **Hover States:** Elements elevate slightly on hover by intensifying the shadow depth or adding a subtle background tint (e.g., #F9FAFB).

## Shapes

The shape language is consistently **Rounded**, using a 12px (0.75rem) base radius to soften the professional interface and align with the organic nature of the cosmetics industry.

- **Base Radius:** 12px for cards, input fields, and large buttons.
- **Nested Elements:** Elements inside a card (like small tags or internal buttons) should use a slightly reduced radius (8px) to maintain visual harmony.
- **Inputs:** Checkboxes and Radio buttons retain a slightly tighter radius (4px) to emphasize their interactive state.

## Components

### Buttons
- **Primary:** Solid #7C3AED with white text. 12px border radius.
- **Secondary:** Transparent background with #7C3AED border and text.
- **Ghost:** No border or background; text turns to Primary color on hover.

### Input Fields
- Height: 40px (Standard) or 36px (Compact).
- Border: 1px solid #D1D5DB.
- Focus State: 2px ring of Primary color with a 2px offset.

### Cards
- Background: #FFFFFF.
- Border: 1px solid #F3F4F6.
- Padding: 24px internal padding for standard information blocks.

### Lists & Tables
- Table headers should be uppercase, #6B7280 color, 12px Medium.
- Row separators: 1px solid #F3F4F6.
- Row hover: Background #F9FAFB.

### Chips & Badges
- Used for "Order Status" (e.g., Pending, Shipped, Cancelled).
- Use a "Subtle Tonal" style: Light background tint of the status color with high-contrast text.