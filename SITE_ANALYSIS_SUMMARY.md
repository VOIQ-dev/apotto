# Chrome Extension Contact Form Finder - Site Analysis Summary

Analysis of 13 sites for FORM_NOT_FOUND failures. All sites were checked with `curl -sL` (static HTML fetch).

| #   | URL                                    | Contact Page URL                        | Has <form> on contact page | Input count | Page title / h1                         | Likely reason for FORM_NOT_FOUND                                                                                                 |
| --- | -------------------------------------- | --------------------------------------- | -------------------------- | ----------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | https://optemo.co.jp                   | https://optemo.co.jp/contact/           | **no**                     | 0           | お問い合わせ｜OPTEMO                    | **Form inside iframe** (pi.optemo.co.jp Pardot) - extension cannot access iframe content                                         |
| 2   | https://lancetier.co.jp                | https://lancetier.co.jp/contact/        | **no**                     | 0           | お問い合わせ - LANCETIER / Contact      | **JS-rendered Form** (Next.js/React SPA) - form rendered client-side, not in initial HTML                                        |
| 3   | https://smartf-nexta.com               | https://smartf-nexta.com/contact/       | **no**                     | 0           | お問い合わせ \| SmartF                  | **HubSpot embed** (js.hs-scripts.com) - form loaded via HubSpot WordPress plugin, JS-rendered                                    |
| 4   | https://social-marketing.io/about-us   | N/A                                     | N/A                        | N/A         | Error: Cannot GET /about-us             | **404/invalid URL** - /about-us returns 404; root is Vue SPA (div#app), no static contact page                                   |
| 5   | https://systena-tenatech.jp            | unknown                                 | N/A                        | N/A         | N/A                                     | **Connection failed** (curl exit 6) - DNS/host unreachable during analysis                                                       |
| 6   | https://www.intercom.co.jp             | https://www.intercom.co.jp/contact/     | **no**                     | 0           | お問い合わせ｜インターコム              | **JS-rendered or iframe** - no form/input in static HTML                                                                         |
| 7   | https://www.persol-avct.co.jp          | https://www.persol-avct.co.jp/inquiry/  | **no**                     | 4\*         | お問い合わせ \| パーソルAVCテクノロジー | **Inputs are menu checkboxes** - 4 inputs are mobile nav toggles, not form fields; Contact Form 7 may load form via shortcode/JS |
| 8   | https://www.poetics-ai.com             | https://www.poetics-ai.com/contact/     | **no**                     | 0           | Poetics \| CONTACT                      | **JS-rendered** - SPA or embed, no form in initial HTML                                                                          |
| 9   | https://www.ozaxitlab.jp               | https://www.ozaxitlab.jp/contact/       | **no**                     | 1\*         | OZAX IoT...                             | **1 input** likely hamburger menu - no contact form in static HTML                                                               |
| 10  | https://www.shashin-kagaku.co.jp/skm   | https://shashin-kagaku.smktg.jp/.../406 | **yes**                    | 12          | 写真化学 お問い合わせフォーム           | **External domain** - contact link goes to smktg.jp; form exists on external URL but extension may not follow cross-domain       |
| 11  | https://www.ogis-ri.co.jp/pickup/dx_fw | https://www.ogis-ri.co.jp/contact/      | 1\*                        | 3           | ページが見つかりませんでした            | **404 page** - /contact/ returns 404 "Page not found"; form may be site search on 404                                            |
| 12  | https://drecom.co.jp/company/profile   | https://drecom.co.jp/pr/contact/form/   | **no**                     | 0           | 報道関係者の皆様へ                      | **JS-rendered** - PR contact form, no form in static HTML                                                                        |
| 13  | https://www.zunda.co.jp                | https://www.zunda.co.jp/contact         | **no**                     | 0           | (Next.js)                               | **JS-rendered** (Next.js SPA) - form rendered client-side                                                                        |

- = count includes non-form elements (e.g. checkboxes for menu)

## Summary of Root Causes

| Reason                                   | Count | Sites                                                         |
| ---------------------------------------- | ----- | ------------------------------------------------------------- |
| Form in iframe (Pardot/HubSpot/embed)    | 2     | optemo, smartf                                                |
| JS-rendered / SPA (React/Next.js/Vue)    | 6     | lancetier, intercom, poetics, drecom, zunda, social-marketing |
| Contact on external domain               | 1     | shashin-kagaku                                                |
| 404 / invalid contact URL                | 2     | social-marketing, ogis-ri                                     |
| Connection failure                       | 1     | systena-tenatech                                              |
| Form not in static HTML (CF7/shortcode?) | 2     | persol-avct, ozaxitlab                                        |

## Recommendations for Extension

1. **Iframe handling**: Detect forms inside iframes; optionally inject into iframe document (same-origin) or report "form in iframe".
2. **JS-rendered forms**: Wait for DOM ready / use MutationObserver; consider running form detection after a delay or on load event.
3. **Cross-domain contact links**: When contact link points to different domain, either follow and analyze, or flag as "external contact form".
4. **SPA navigation**: Ensure content script runs after SPA route change; use `webNavigation` or `history` API to re-scan on navigation.
