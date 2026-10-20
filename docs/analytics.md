# GA4 measurement and UTM conventions

Configured 2026-10-20 (Asia/Seoul).
- Canonical site: https://bruceheo.com/
- Property: 558975449; web stream: 16125683951; measurement ID: G-17SXL7Q2XV.
- Existing gtag config and enhanced measurement stay in place. Do not add a second Google tag or GTM page_view.
- /assets/interaction-tracking.js sends profile_click for About/career links and contact_click for mailto links. It does not prevent navigation or send email recipient, subject or body.
- GA4 custom event external_channel_click is derived from enhanced-measurement click where link_domain matches ^([a-z0-9-]+\.)*(brunch\.co\.kr|linkedin\.com|instagram\.com|youtube\.com|youtu\.be)$ (ignore case); source parameters copied.
- Only contact_click is a key event: once per session, no monetary value. A click means intent, not a delivered inquiry.
- profile_click and external_channel_click are supporting engagement metrics. Do not sum enhanced click and the derived external_channel_click as separate physical clicks.
- The archive page template includes the interaction script so future articles retain it.
- Existing articles and primary Korean/English pages with the original GA4 tag include this script. Internal tools, content previews and the legacy portfolio file are outside this rollout.

UTM source/medium:
linkedin/social; brunch/referral; instagram/social; youtube/video; newsletter/email.
Campaign: evergreen profile = profile_always_on, or content launch = content_YYYYMMDD_topic.
Content: placement_variant, e.g. profile_bio, post_footer, video_description, newsletter_main.
Use lowercase ASCII and underscores, one stable campaign per content topic across channels.
Use the final canonical destination, e.g. /writing/223/. Never place UTM tags on internal site navigation.
UTM measures arrivals from external channels, not impressions, external platform views, subscriptions, or email delivery.

GA4 reporting:
Reports > Acquisition > Traffic acquisition (or the collection containing it).
Use Session source / medium and Session campaign; filter key event to contact_click.
For placement detail use Session manual ad content in Explore/manual campaigns.
Standard reporting may take 24–48 hours; event rules do not backfill earlier data.
