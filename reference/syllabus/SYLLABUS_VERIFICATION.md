# Syllabus seed — verification checklist

**Status of `year12_syllabus_seed.json`: PROVISIONAL.**
73 selectable dot points extracted. 58 verified. **15 require confirmation before the seed is called final.**

---

## Why these 15 exist

The official NESA content pages render some words as lazy-loaded glossary links. When the page is fetched
server-side (as any scraper, `WebFetch`, or headless HTTP client will do), those words have not hydrated yet
and the literal string `Loading` appears in their place.

This is the dangerous failure mode for this project, because the result is **grammatically plausible text
that is silently wrong**:

> "Apply security features incorporated into software including **Loading** protection, security, privacy
> and regulatory compliance"

Nothing downstream would flag that. It would be seeded, displayed in the selector as official wording,
attached to generated questions as provenance, and shown to a student on a results screen.

Secure software architecture is fully resolved because the pack contains an authoritative offline
cross-check — `reference/notes/01_SSA/tas-s6-software-engineering-teacher-support-resource-secure-software-architecture.docx`,
an official NESA document that reproduces the syllabus wording. It confirmed all three of its masked terms:
`data`, `evaluate`, and `application programming interface (API)`. No equivalent NESA document is supplied
for the other three focus areas, so their masked terms remain open.

---

## How to resolve them (5 minutes)

Open each focus area page in a **real browser** (the terms hydrate correctly there), and read off the missing
word. Then edit `year12_syllabus_seed.json`: replace the `UNRESOLVED` token, set `"verified": true`, and
delete the `note`.

| Page | URL |
|---|---|
| Programming for the web | `…/content/year-12/fa6aab137e` |
| Software automation | `…/content/year-12/fa56cc30c8` |
| Software engineering project | `…/content/year-12/fa0beecd16` |

Base: `https://curriculum.nsw.edu.au/learning-areas/tas/software-engineering-11-12-2022`

---

## The 15 items

Expected values are informed guesses recorded to make checking fast. **Do not accept them without looking.**

### Programming for the web

| ID | Text with the gap | Expected |
|---|---|---|
| `pwa.1.2` | Investigate and practise how **[?]** is transferred on the internet | data |
| `pwa.1.3` | Investigate and describe the function of web **[?]** and their ports | protocols |
| `pwa.1.5` | Investigate the effect of **[?]** on web architecture | big data |
| `pwa.2.1` | …role of the World Wide Web Consortium (**[?]**) in the development of applications for the web | W3C |
| `pwa.2.9` | Research, experiment with and **[?]** the prevalence and use of web content management systems (CMS) | evaluate |
| `pwa.2.12` | Develop a web application using an appropriate **[?]** with shell scripts… | scripting language |
| `pwa.2.14` | Compare **[?]** to SQL | NoSQL |

### Software automation

| ID | Text with the gap | Expected |
|---|---|---|
| `auto.1.2` | Distinguish between **[?]** and ML | AI / artificial intelligence (AI) |
| `auto.1.3` | Explore **[?]** of training ML | models / approaches |
| `auto.1.4` | Investigate common applications of key ML **[?]** | algorithms |
| `auto.2.1` | Design, develop and apply ML regression models using an **[?]** to predict numeric values | OOP |

### Software engineering project

| ID | Text with the gap | Expected |
|---|---|---|
| `proj.3.3` | Develop, construct and document **[?]** | uncertain — read carefully |
| `proj.3.5` | Demonstrate the use of programmed **[?]** backup | uncertain — read carefully |
| `proj.3.8` | Propose an additional innovative solution using a **[?]** and **[?]** design | two gaps in one dot point |
| `proj.4.1` | Apply methodologies to test and **[?]** code | evaluate |

`proj.3.3`, `proj.3.5` and `proj.3.8` are the least predictable — the surrounding text gives little constraint.
Read those three directly rather than trusting any guess.

---

## Minor wording discrepancies (not blocking)

Where the live page and the NESA teacher support resource disagree, it is only on serial commas. The live
page is the authority; the seed follows it. Recorded here so nobody "fixes" the seed toward the docx later.

- `ssa.2.5` — docx has a comma before *"and conducting disaster recovery"*; page does not.
- `ssa.2.7` — docx has a comma before *"and error handling"*; page does not.
- `ssa.3.3` — docx has a comma before *"and legal issues"*; page does not.

---

## Guard this in code

Add a startup assertion so a provisional seed can never quietly ship:

```ts
const unresolved = seed.focusAreas
  .flatMap(f => f.subtopics)
  .flatMap(s => s.items)
  .filter(i => !i.verified || i.exactText.includes('UNRESOLVED'));

if (unresolved.length && process.env.NODE_ENV === 'production') {
  throw new Error(
    `Syllabus seed is provisional: ${unresolved.length} unverified item(s). ` +
    `See reference/syllabus/SYLLABUS_VERIFICATION.md`
  );
}
```

In development, render unverified items with a visible marker in the selector rather than hiding the problem.
