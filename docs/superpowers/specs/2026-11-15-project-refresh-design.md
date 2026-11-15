# Project descriptions and selected work

The user approved refreshing all four existing project descriptions, adding five
public projects, and changing the homepage selection. Cherry Studio must appear
first. Apply the same project ordering on the homepage and the projects page.

## Content

Update both the frontmatter summary and Markdown body for Cherry Studio,
frontend-tools, CourseSelectionSystem, and text-classification-cnn-rnn using the
approved descriptions. Preserve the existing project roles and publication dates.
The TensorFlow project remains a fork and credits gaussic.

Add adaptive-ai-gateway, qt-device-workbench, thesisctl, cherry-studio-skills, and
S2SCR-data. Use their public repository creation dates in Asia/Shanghai for the
new entries. Describe adaptive-ai-gateway as a prototype and thesisctl in terms
of its completed first-stage input/data work. S2SCR-data is a data curation
repository. Do not describe unfinished business commands or original source
imagery as delivered work. game-data-agent is outside the approved addition.

## Presentation

The four selected projects, in order, are Cherry Studio, adaptive-ai-gateway,
qt-device-workbench, and frontend-tools. CourseSelectionSystem remains on the
projects page without being selected for the homepage.

Add an optional nonnegative integer `order` to project frontmatter. Use it for
explicit project priority; entries without an order follow publication date.
Project sorting filters drafts and leaves the original collection unchanged.
Blog, note, and recommendation ordering continues to use publication dates.

Use the existing card components and layout. All nine projects appear on the
projects page, with Cherry Studio first and its `member` role intact.

## Verification

Cover explicit order, publication-date fallback, draft filtering, and unchanged
input in the content helper tests. Update the existing browser checks to verify
the four selected cards, all nine project cards, Cherry Studio's first position,
and its official repository link. Run the relevant unit checks, a production
build, and the affected Playwright checks. Inspect desktop and mobile rendering.
